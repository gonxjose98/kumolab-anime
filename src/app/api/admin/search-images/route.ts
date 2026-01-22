
import { NextRequest, NextResponse } from 'next/server';
import { fetchOfficialAnimeImages } from '@/lib/engine/fetchers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const { topic, page } = await request.json();

        if (!topic) {
            return NextResponse.json({ success: false, error: 'Topic is required' }, { status: 400 });
        }

        const pageNum = page || 1;
        console.log(`[Admin] Searching images for: ${topic} (Page ${pageNum})`);
        const images = await fetchOfficialAnimeImages(topic, pageNum);

        return NextResponse.json({
            success: true,
            images
        });
    } catch (error: any) {
        console.error('Error searching images:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
