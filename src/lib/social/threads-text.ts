import { supabaseAdmin } from '@/lib/supabase/admin';
import { logError } from '../logging/structured-logger';

/*
 * Text-only Threads posts (hot takes, questions, polls) on top of the daily
 * carousel + reels. Growth research 2026-10-10: Threads rewards conversation,
 * and our spikes came from replies, not media.
 *
 * Rows live in threads_text_posts. Only status='approved' rows post: Claude
 * drafts, Jose OKs. Runs inside the existing publish cron (:05 and :35), so a
 * row goes out within ~30 min of its scheduled_at. At most 2 per tick.
 */

const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_TOPIC_TAG = (process.env.THREADS_TOPIC_TAG ?? 'Anime Threads').trim();
const BASE = 'https://graph.threads.net/v1.0';

// Params go in the form body (like the main publisher), not the query string:
// every text post that failed had an apostrophe in it (2026-10-12/14/15).
async function post(url: string, params: Record<string, string>) {
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams(params), signal: AbortSignal.timeout(20_000) });
    return res.json().catch(() => ({}));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Publishing before the container is FINISHED fails with "The requested
 * resource does not exist" (same failure the carousel publisher guards
 * against). Wait up to ~30s, then retry the publish a few times.
 */
async function publishWhenReady(containerId: string, token: string): Promise<any> {
    for (let t = 0; t < 10; t++) {
        const st = await fetch(`${BASE}/${containerId}?fields=status&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(10_000) })
            .then((r) => r.json()).catch(() => ({}));
        if (st.status === 'FINISHED') break;
        if (st.status === 'ERROR') throw new Error('Threads text container ERROR');
        await sleep(3_000);
    }
    let pub: any = {};
    for (let attempt = 0; attempt < 3; attempt++) {
        pub = await post(`${BASE}/${THREADS_USER_ID}/threads_publish`, { access_token: token, creation_id: containerId });
        if (pub.id) return pub;
        await sleep(4_000);
    }
    return pub;
}

export async function publishDueThreadsText(): Promise<{ posted: number; failed: number }> {
    if (process.env.THREADS_TEXT_ENABLED === 'false' || !THREADS_ACCESS_TOKEN || !THREADS_USER_ID) return { posted: 0, failed: 0 };
    const { data: due } = await supabaseAdmin
        .from('threads_text_posts')
        .select('id, text, kind, poll_options')
        .eq('status', 'approved')
        .lte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(2);
    let posted = 0, failed = 0;
    for (const row of due || []) {
        // Claim the row first so overlapping ticks can't double-post.
        const { data: claimed } = await supabaseAdmin
            .from('threads_text_posts').update({ status: 'posting' }).eq('id', row.id).eq('status', 'approved').select('id');
        if (!claimed?.length) continue;
        try {
            const params: Record<string, string> = { access_token: THREADS_ACCESS_TOKEN, media_type: 'TEXT', text: row.text };
            if (THREADS_TOPIC_TAG) params.topic_tag = THREADS_TOPIC_TAG;
            const opts = Array.isArray(row.poll_options) ? row.poll_options.slice(0, 4) : [];
            if (row.kind === 'poll' && opts.length >= 2) {
                const keys = ['option_a', 'option_b', 'option_c', 'option_d'];
                params.poll_attachment = JSON.stringify(Object.fromEntries(opts.map((o: string, i: number) => [keys[i], String(o).slice(0, 25)])));
            }
            const container = await post(`${BASE}/${THREADS_USER_ID}/threads`, params);
            if (!container.id) throw new Error(container?.error?.message || `container failed: ${JSON.stringify(container).slice(0, 200)}`);
            const pub = await publishWhenReady(container.id, THREADS_ACCESS_TOKEN);
            if (!pub.id) throw new Error(pub?.error?.message || `publish failed: ${JSON.stringify(pub).slice(0, 200)}`);
            await supabaseAdmin.from('threads_text_posts').update({
                status: 'posted', threads_id: pub.id, threads_url: `https://www.threads.net/@kumolabanime/post/${pub.id}`, posted_at: new Date().toISOString(), error: null,
            }).eq('id', row.id);
            posted++;
        } catch (e: any) {
            failed++;
            await supabaseAdmin.from('threads_text_posts').update({ status: 'failed', error: String(e?.message || e).slice(0, 500) }).eq('id', row.id);
            await logError({ source: 'threads-text', errorMessage: `Threads text post failed: ${e?.message || e}`, context: { id: row.id } });
        }
    }
    return { posted, failed };
}
