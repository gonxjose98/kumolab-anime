import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    // Check which social media platforms have tokens configured
    const status = {
        x: !!(process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN),
        instagram: !!(process.env.META_ACCESS_TOKEN && process.env.META_IG_ID),
        facebook: !!(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID),
        threads: !!(process.env.THREADS_ACCESS_TOKEN || (process.env.META_ACCESS_TOKEN && process.env.THREADS_USER_ID)),
        youtube: !!(process.env.YOUTUBE_API_KEY),
        reddit: true, // Reddit scraping uses public JSON/RSS — no auth needed
    };

    return NextResponse.json(status);
}
