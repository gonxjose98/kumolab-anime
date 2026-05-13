/**
 * /api/admin/scrape-search
 *
 * First half of the "Find Video" scrape flow on the admin dashboard.
 * Operator clicks "Find Video" on a pending post, optionally edits the
 * search query, and we hit YouTube Data API to return ranked candidates.
 * The second half (/api/admin/scrape-attach) downloads the chosen video
 * and enriches the pending row.
 *
 * Auth: middleware gates /api/admin/* by Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { searchYouTube } from '@/lib/youtube/search';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { postId, query } = (body || {}) as { postId?: string; query?: string };

        if (!postId || typeof postId !== 'string') {
            return NextResponse.json(
                { success: false, error: 'postId is required' },
                { status: 400 },
            );
        }
        if (!query || typeof query !== 'string' || !query.trim()) {
            return NextResponse.json(
                { success: false, error: 'query is required' },
                { status: 400 },
            );
        }

        // Look up the post for ranking context (claim_type sets the duration
        // window; timestamp gates the recency bonus). Soft-fail: if the post
        // can't be loaded we still run the search with default settings.
        const { data: post } = await supabaseAdmin
            .from('posts')
            .select('claim_type, timestamp')
            .eq('id', postId)
            .maybeSingle();

        const result = await searchYouTube(query.trim(), {
            claimType: post?.claim_type ?? null,
            postPublishedAt: post?.timestamp ?? null,
            maxResults: 10,
        });

        if (!result.ok) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 502 },
            );
        }

        return NextResponse.json({ success: true, candidates: result.candidates });
    } catch (e: any) {
        console.error('[scrape-search] error', e);
        return NextResponse.json(
            { success: false, error: e?.message || 'Internal error' },
            { status: 500 },
        );
    }
}
