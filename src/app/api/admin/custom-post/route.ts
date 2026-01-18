import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateIntelImage } from '@/lib/engine/image-processor';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const title = formData.get('title') as string;
        const content = formData.get('content') as string;
        const type = formData.get('type') as string || 'COMMUNITY';
        const headline = formData.get('headline') as string || 'FEATURED';
        const imageFile = formData.get('image') as File;

        if (!title || !imageFile) {
            return NextResponse.json({ error: 'Title and image are required' }, { status: 400 });
        }

        // Convert image file to buffer
        const arrayBuffer = await imageFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload original image to Supabase Storage temporarily
        const tempFileName = `temp-${Date.now()}-${imageFile.name}`;
        const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('blog-images')
            .upload(tempFileName, buffer, {
                contentType: imageFile.type,
                upsert: true
            });

        if (uploadError) {
            console.error('Upload error:', uploadError);
            return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
        }

        // Get public URL of uploaded image
        const { data: { publicUrl } } = supabaseAdmin
            .storage
            .from('blog-images')
            .getPublicUrl(tempFileName);

        // Generate processed image with text overlay
        const skipProcessing = formData.get('skipProcessing') === 'true';

        // Generate processed image with text overlay
        const slug = `custom-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)}`;
        let processedImageUrl: string | null = null;

        if (skipProcessing) {
            // If skipping processing, the uploaded image is ALREADY the final processed image.
            // We just need to ensure it persists. The temp upload is fine, but let's be cleaner and rename it or just use it.
            // Since we plan to delete 'tempFileName', we should probably copy it or just use a final filename initially?
            // Let's just use the Public URL of the uploaded file and NOT delete it.
            processedImageUrl = publicUrl;
        } else {
            processedImageUrl = await generateIntelImage({
                sourceUrl: publicUrl,
                animeTitle: title,
                headline: headline,
                slug: slug,
                textPosition: 'bottom'
            });
        }

        // Create post in database
        const post = {
            id: `custom-${Date.now()}`,
            title,
            slug,
            type,
            content: content || `Check out: ${title}`,
            image: processedImageUrl || publicUrl,
            timestamp: new Date().toISOString(),
            isPublished: false // Start as draft
        };

        const { data, error } = await supabaseAdmin
            .from('posts')
            .insert({
                id: post.id,
                title: post.title,
                slug: post.slug,
                type: post.type,
                content: post.content,
                image: post.image,
                timestamp: post.timestamp,
                is_published: post.isPublished
            })
            .select()
            .single();

        if (error) {
            console.error('Database error:', error);
            return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
        }

        // Clean up temp file ONLY if we generated a new one via processing
        if (!skipProcessing) {
            await supabaseAdmin.storage.from('blog-images').remove([tempFileName]);
        }

        return NextResponse.json({
            success: true,
            post: {
                ...data,
                isPublished: data.is_published
            }
        });

    } catch (error: any) {
        console.error('Custom post creation error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
