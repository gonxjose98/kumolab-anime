import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { createFingerprint } from '@/lib/engine/utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { ids } = await req.json();

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: 'Array of IDs required' }, { status: 400 });
        }

        console.log(`[API] Bulk deleting ${ids.length} posts`);

        // Fetch posts BEFORE deleting — we need title + source_url to build the
        // fingerprint that goes into seen_fingerprints (the v2 dedup memory).
        const { data: posts } = await supabaseAdmin
            .from('posts')
            .select('id, title, slug, source, source_url, claim_type, anime_id')
            .in('id', ids);

        // Record in seen_fingerprints (origin='declined') so the detection worker
        // never re-detects these. Replaces the old declined_posts table from v1.
        if (posts && posts.length > 0) {
            const now = new Date().toISOString();
            const fingerprintRecords = posts
                .filter((p: any) => p.title && p.source_url)
                .map((post: any) => ({
                    fingerprint: createFingerprint(post.title, post.source_url),
                    anime_id: post.anime_id ?? null,
                    claim_type: post.claim_type ?? null,
                    origin: 'declined' as const,
                    source_url: post.source_url,
                    seen_at: now,
                }));

            if (fingerprintRecords.length > 0) {
                const { error: trackError } = await supabaseAdmin
                    .from('seen_fingerprints')
                    .upsert(fingerprintRecords, { onConflict: 'fingerprint' });

                if (trackError) {
                    console.warn(`[API] Could not record ${fingerprintRecords.length} fingerprints:`, trackError.message);
                } else {
                    console.log(`[API] Recorded ${fingerprintRecords.length} fingerprints (origin=declined)`);
                }
            }
        }

        // Delete posts
        const { error } = await supabaseAdmin
            .from('posts')
            .delete()
            .in('id', ids);

        if (error) {
            console.error('[API] Bulk delete error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log(`[API] Successfully deleted ${ids.length} posts`);

        // Revalidate paths
        try {
            revalidatePath('/');
            revalidatePath('/blog');
            if (posts) {
                posts.forEach((post: any) => {
                    if (post.slug) revalidatePath(`/blog/${post.slug}`);
                });
            }
        } catch (revError) {
            console.error('[API] Revalidation error (non-critical):', revError);
        }

        return NextResponse.json({
            success: true,
            message: `Deleted ${ids.length} posts`,
            deleted: ids.length
        });
    } catch (err: any) {
        console.error('[API] Bulk delete exception:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
