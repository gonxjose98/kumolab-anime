import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateIntelImage } from '@/lib/engine/image-processor';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const title = formData.get('title') as string;
        const content = formData.get('content') as string;
        const type = formData.get('type') as string || 'COMMUNITY';
        const headline = formData.get('headline') as string || 'FEATURED';
        const imageFile = formData.get('image') as File;

        const skipProcessing = formData.get('skipProcessing') === 'true';
        const postId = formData.get('postId') as string;

        if (!title || (!imageFile && !postId)) {
            return NextResponse.json({ error: 'Title and image are required' }, { status: 400 });
        }

        let finalImageUrl: string | null = null;
        let tempFileName: string | null = null;

        if (imageFile) {
            // Convert image file to buffer
            const arrayBuffer = await imageFile.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Upload original image to Supabase Storage temporarily
            const sanitizedName = imageFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            tempFileName = `temp-${Date.now()}-${sanitizedName}`;
            const { error: uploadError } = await supabaseAdmin
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

            const slug = `custom-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)}`;

            if (skipProcessing) {
                finalImageUrl = publicUrl;
            } else {
                finalImageUrl = await generateIntelImage({
                    sourceUrl: publicUrl,
                    animeTitle: title,
                    headline: headline,
                    slug: slug,
                    gradientPosition: 'bottom'
                });
            }
        }

        // Create or Update post in database
        const postData: any = {
            title,
            type,
            content: content || `Check out: ${title}`,
            excerpt: headline, // Map internal headline to DB excerpt for storage
        };

        if (finalImageUrl) {
            postData.image = finalImageUrl;
        }

        // Only generate slug and timestamp for NEW posts
        if (!postId) {
            postData.id = randomUUID();
            postData.slug = `custom-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)}`;
            postData.timestamp = new Date().toISOString();
            postData.is_published = type === 'CONFIRMATION_ALERT';
        }

        let query;
        if (postId) {
            query = supabaseAdmin
                .from('posts')
                .update(postData)
                .eq('id', postId)
                .select()
                .single();
        } else {
            query = supabaseAdmin
                .from('posts')
                .insert(postData)
                .select()
                .single();
        }

        const { data, error } = await query;

        if (error) {
            console.error('[Admin DB] Detailed Error:', error);
            return NextResponse.json({ error: `Database Error: ${error.message} (${error.code})` }, { status: 500 });
        }

        // Clean up temp file ONLY if we generated a new one via processing
        if (tempFileName && !skipProcessing) {
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
