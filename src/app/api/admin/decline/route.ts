import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logAction } from '@/lib/logging/structured-logger';

function computeFingerprint(title: string, url?: string): string {
    const normalized = title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().substring(0, 80);
    const domain = (url || '').replace(/^https?:\/\//, '').split('/')[0] || '';
    let hash = 0;
    const input = normalized + '|' + domain;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash = hash & hash;
    }
    return `${normalized.replace(/\s/g, '_').substring(0, 40)}_${Math.abs(hash).toString(36)}`;
}

export async function POST(req: NextRequest) {
    try {
        const { postIds, reason } = await req.json();

        if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
            return NextResponse.json({ success: false, error: 'Invalid postIds' }, { status: 400 });
        }

        console.log(`[Decline] Processing ${postIds.length} post(s)...`);
        const now = new Date();
        const results = [];

        for (const postId of postIds) {
            const { data: post, error: fetchError } = await supabaseAdmin
                .from('posts')
                .select('id, title, slug, source, source_url, anime_id, claim_type')
                .eq('id', postId)
                .single();

            if (fetchError || !post) {
                console.error(`[Decline] Post ${postId} not found:`, fetchError?.message);
                results.push({ id: postId, success: false, error: 'Post not found' });
                continue;
            }

            // Record the fingerprint in seen_fingerprints so the same content doesn't
            // re-enter the queue. Best-effort — do this before the delete so a later
            // detection pass can't re-insert it between our delete and fingerprint write.
            const fp = computeFingerprint(post.title, post.source_url);
            await supabaseAdmin.from('seen_fingerprints').upsert({
                fingerprint: fp,
                anime_id: post.anime_id ?? null,
                claim_type: post.claim_type ?? null,
                origin: 'declined',
                source_url: post.source_url ?? null,
                seen_at: now.toISOString(),
            }, { onConflict: 'fingerprint' });

            const { data: deletedRows, error: deleteError } = await supabaseAdmin
                .from('posts')
                .delete()
                .eq('id', postId)
                .select('id');

            if (deleteError || !deletedRows || deletedRows.length === 0) {
                const errMsg = deleteError?.message || 'Delete returned 0 rows';
                console.error(`[Decline] DELETE failed for "${post.title}":`, errMsg);
                results.push({ id: postId, success: false, error: errMsg });
                continue;
            }

            console.log(`[Decline] Deleted "${post.title}"`);
            results.push({ id: postId, success: true, method: 'deleted' });
            await logAction({ action: 'declined', entityId: postId, actor: 'Admin', reason: reason || 'No reason provided' });
        }

        revalidatePath('/admin/dashboard');
        revalidatePath('/blog');

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        console.log(`[Decline] Done. Success: ${successCount}, Failed: ${failCount}`);

        return NextResponse.json({
            success: failCount === 0,
            results,
            summary: { success: successCount, failed: failCount }
        });
    } catch (e: any) {
        console.error('[Decline] Unhandled error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
