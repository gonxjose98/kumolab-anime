import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateIntelImage } from '@/lib/engine/image-processor';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { postId } = await req.json();

    if (!postId || typeof postId !== 'string') {
      return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });
    }

    const { data: post, error: fetchError } = await supabaseAdmin
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (fetchError || !post) {
      return NextResponse.json({ success: false, error: fetchError?.message || 'Post not found' }, { status: 404 });
    }

    const sourceUrl: string | null = post.background_image || post.image || null;
    if (!sourceUrl) {
      return NextResponse.json({ success: false, error: 'Post has no background_image or image to render from' }, { status: 400 });
    }

    const imageSettings = post.image_settings || {};

    const result = await generateIntelImage({
      sourceUrl,
      animeTitle: post.title || '',
      // Canonical storage for overlay tag is excerpt
      headline: (post.excerpt || '').toString(),
      slug: post.slug || `post-${postId}`,

      // Image editor controls
      scale: imageSettings.imageScale ?? 1,
      position: imageSettings.imagePosition ?? { x: 0, y: 0 },
      applyText: imageSettings.isApplyText ?? true,
      applyGradient: imageSettings.isApplyGradient ?? true,
      applyWatermark: imageSettings.isApplyWatermark ?? true,
      gradientPosition: imageSettings.gradientPosition ?? 'bottom',
      textScale: imageSettings.textScale ?? 1,
      textPosition: imageSettings.textPosition,
      purpleWordIndices: imageSettings.purpleWordIndices ?? [],
      watermarkPosition: imageSettings.watermarkPosition,
      disableAutoScaling: false,

      // Allow admin to override poster classification
      classification: 'CLEAN',
      bypassSafety: true,
    });

    if (!result?.processedImage) {
      return NextResponse.json({ success: false, error: 'Image renderer returned null (source likely unsafe or fetch failed)' }, { status: 500 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('posts')
      .update({
        image: result.processedImage,
      })
      .eq('id', postId)
      .select('*')
      .single();

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      post: updated,
      layout: result.layout,
    });
  } catch (e: any) {
    console.error('[admin/render-post-image] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
