import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
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
        const imageSettings = formData.get('imageSettings') as string;
        const backgroundImageUrl = formData.get('background_image') as string;
        const isWebsitePublished = formData.get('isWebsitePublished') === 'true';

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        // Video posts (X/Twitter, YouTube) may not have an image — that's OK
        const isVideoPost = content?.match(/Tweet ID:\s*\d+/) || content?.includes('youtube.com');
        if (!imageFile && !postId && !isVideoPost) {
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

            // Check if user has text overlays enabled in imageSettings
        let parsedImageSettings: any = null;
        if (imageSettings) {
            try {
                parsedImageSettings = JSON.parse(imageSettings);
            } catch (e) {
                console.error('Failed to parse imageSettings:', e);
            }
        }
        
        // Force processing if text/gradient/watermark is enabled - ignore skipProcessing flag
        const needsProcessing = parsedImageSettings && (
            parsedImageSettings.isApplyText === true ||
            parsedImageSettings.isApplyGradient === true ||
            parsedImageSettings.isApplyWatermark === true
        );
        
        // Process the image if needed (overlays enabled) OR if skipProcessing is false
        if (needsProcessing || !skipProcessing) {
            console.log(`[Admin API] Processing image with settings:`, {
                needsProcessing,
                isApplyText: parsedImageSettings?.isApplyText,
                isApplyGradient: parsedImageSettings?.isApplyGradient,
                isApplyWatermark: parsedImageSettings?.isApplyWatermark,
                headline: headline
            });
            
            const result = await generateIntelImage({
                sourceUrl: publicUrl,
                animeTitle: title,
                headline: headline,
                slug: slug,
                gradientPosition: parsedImageSettings?.gradientPosition || 'bottom',
                applyText: parsedImageSettings?.isApplyText ?? true,
                applyGradient: parsedImageSettings?.isApplyGradient ?? true,
                applyWatermark: parsedImageSettings?.isApplyWatermark ?? true,
                textScale: parsedImageSettings?.textScale ?? 1,
                textPosition: parsedImageSettings?.textPosition,
                purpleWordIndices: parsedImageSettings?.purpleWordIndices,
                verticalOffset: parsedImageSettings?.verticalOffset ?? 0
            });
            
            if (result?.processedImage) {
                finalImageUrl = result.processedImage;
                console.log(`[Admin API] Image processed successfully, length:`, finalImageUrl.length);
            } else {
                console.error('[Admin API] Image processing returned null, falling back to raw image');
                finalImageUrl = publicUrl;
            }
        } else {
            // No overlays needed - move temp file to permanent location
            console.log(`[Admin API] No overlays needed, using raw image`);
            const permanentFileName = `${slug}-${Date.now()}.png`;
            const { error: moveError } = await supabaseAdmin
                .storage
                .from('blog-images')
                .move(tempFileName, permanentFileName);
            
            if (moveError) {
                console.error('Move error:', moveError);
                // Fall back to temp URL if move fails
                finalImageUrl = publicUrl;
            } else {
                // Get URL for permanent file
                const { data: { publicUrl: permanentUrl } } = supabaseAdmin
                    .storage
                    .from('blog-images')
                    .getPublicUrl(permanentFileName);
                finalImageUrl = permanentUrl;
                tempFileName = null; // Don't delete the permanent file
            }
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

        if (imageSettings) {
            try {
                postData.image_settings = JSON.parse(imageSettings);
            } catch (e) {
                console.error('Failed to parse imageSettings:', e);
            }
        }

        if (backgroundImageUrl) {
            postData.background_image = backgroundImageUrl;
        }

        // Deployment Logic: Use user's choice for website publication
        // For NEW posts, use the toggle value (default false unless Confirmation Alert)
        // For EXISTING posts, PRESERVE status unless explicitly publishing
        if (!postId) {
            postData.is_published = isWebsitePublished || type === 'CONFIRMATION_ALERT';
            postData.status = (isWebsitePublished || type === 'CONFIRMATION_ALERT') ? 'published' : 'pending';
            postData.id = randomUUID();
            postData.slug = `custom-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)}`;
            postData.timestamp = new Date().toISOString();
        } else {
            // CRITICAL FIX: Fetch existing post to preserve approval status
            // Editing should NEVER move an approved post to hidden
            const { data: existingPost } = await supabaseAdmin
                .from('posts')
                .select('status, is_published')
                .eq('id', postId)
                .single();
            
            if (existingPost) {
                const currentStatus = existingPost.status;
                
                // Only update is_published if explicitly toggling ON (publishing)
                // Never auto-hide an approved post just because toggle is off
                if (isWebsitePublished) {
                    // User is explicitly publishing
                    postData.is_published = true;
                    postData.status = 'published';
                } else if (currentStatus === 'approved') {
                    // Approved post stays approved (scheduled), regardless of toggle
                    postData.is_published = false;
                    postData.status = 'approved';
                } else if (currentStatus === 'published' && !isWebsitePublished) {
                    // Only hide if explicitly unpublishing a live post
                    postData.is_published = false;
                    postData.status = 'hidden';
                } else {
                    // Pending or other statuses - keep as-is, only update is_published if needed
                    postData.is_published = false;
                    // Don't overwrite status - let it stay pending/declined/etc
                }
            } else {
                // Fallback: if can't fetch existing, only update if publishing
                if (isWebsitePublished) {
                    postData.is_published = true;
                    postData.status = 'published';
                }
                // If not publishing, don't touch status/is_published fields
            }
        }
        
        postData.source_tier = 1; // Admin is Tier 1
        postData.relevance_score = 100;
        postData.source = 'Admin Dashboard';
        postData.scraped_at = new Date().toISOString();

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

        // --- REVALIDATION ---
        // Ensure the Next.js cache is purged for these paths so the update is visible immediately.
        try {
            await Promise.all([
                revalidatePath('/', 'page'),
                revalidatePath('/blog', 'page'),
                revalidatePath(`/blog/${data.slug}`, 'page')
            ]);
        } catch (e) {
            console.warn('Revalidation failed:', e);
        }

        // Add cache-busting timestamp to image URL for immediate refresh
        const cacheBustedPost = {
            ...data,
            isPublished: data.is_published,
            image: data.image ? `${data.image}?v=${Date.now()}` : data.image
        };

        return NextResponse.json({
            success: true,
            post: cacheBustedPost
        });

    } catch (error: any) {
        console.error('Custom post creation error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
