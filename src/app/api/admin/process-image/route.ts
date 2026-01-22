
import { NextRequest, NextResponse } from 'next/server';
import { generateIntelImage } from '@/lib/engine/image-processor';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const { imageUrl, title, headline, scale, position, applyText, applyGradient } = await request.json();

        if (!imageUrl || !title) {
            return NextResponse.json({ success: false, error: 'Image URL and Title are required' }, { status: 400 });
        }

        console.log(`[Admin] Generating preview for: ${title}`);

        // Generate valid slug for filename generation logic (even if mocked)
        const mockSlug = `preview-${Date.now()}`;

        const processedImage = await generateIntelImage({
            sourceUrl: imageUrl,
            animeTitle: title,
            headline: headline || '',
            slug: mockSlug,
            skipUpload: true, // Force Base64 return
            scale,
            position,
            applyText,
            applyGradient
        });


        if (!processedImage) {
            throw new Error('Image generation returned null');
        }

        return NextResponse.json({
            success: true,
            processedImage // Base64 string
        });
    } catch (error: any) {
        console.error('Error generating preview:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
