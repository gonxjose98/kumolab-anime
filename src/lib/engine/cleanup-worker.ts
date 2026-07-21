/**
 * cleanup-worker.ts
 *
 * Daily retention sweep. Runs the SQL cleanup_* functions and handles
 * image bucket cleanup (which SQL can't do directly).
 *
 * Scheduled at 03:00 UTC via vercel.json (worker=cleanup).
 */

import { supabaseAdmin } from '../supabase/admin';
import { logSchedulerRun } from '../logging/scheduler';
import { createFingerprint } from './utils';

const STORAGE_BUCKET = 'blog-images';
const VIDEO_BUCKET = 'blog-videos';
const STORAGE_ALERT_BYTES = 400 * 1024 * 1024; // 400 MB

/** Pull the object key out of a Supabase public URL for a given bucket, or null. */
function extractBucketFile(url: string | null | undefined, bucket: string): string | null {
    if (!url) return null;
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.substring(idx + marker.length);
}

export interface CleanupResult {
    expiredPostsDeleted: number;
    stalePendingDeclined: number;
    bucketFilesDeleted: number;
    bucketOrphansDeleted: number;
    videoFilesDeleted: number;
    candidateSweep: number;
    fingerprintSweep: number;
    redirectSweep: number;
    pageViewSweep: number;
    taskSweep: number;
    dailyReportSweep: number;
    staleLockSweep: number;
    logSweep: Record<string, number>;
    dbSizeBytes: number;
    storageAlert: boolean;
    durationMs: number;
    errors: string[];
}

// Pending posts older than this get auto-declined. The news isn't news anymore;
// holding them in the queue just clutters the admin dashboard. Their fingerprint
// is written so the same content can't re-enter via detection.
const STALE_PENDING_HOURS = 72;

function extractStoredFilename(imageUrl: string | null): string | null {
    if (!imageUrl) return null;
    // Supabase public URL: https://<project>.supabase.co/storage/v1/object/public/blog-images/<filename>
    const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const idx = imageUrl.indexOf(marker);
    if (idx === -1) return null;
    return imageUrl.substring(idx + marker.length);
}

export async function runCleanupWorker(): Promise<CleanupResult> {
    const start = Date.now();
    const result: CleanupResult = {
        expiredPostsDeleted: 0,
        stalePendingDeclined: 0,
        bucketFilesDeleted: 0,
        bucketOrphansDeleted: 0,
        videoFilesDeleted: 0,
        candidateSweep: 0,
        fingerprintSweep: 0,
        redirectSweep: 0,
        pageViewSweep: 0,
        taskSweep: 0,
        dailyReportSweep: 0,
        staleLockSweep: 0,
        logSweep: {},
        dbSizeBytes: 0,
        storageAlert: false,
        durationMs: 0,
        errors: [],
    };

    // 0. Auto-decline stale pending posts. If admin hasn't acted in 72h the
    //    news is dead news. Fingerprint each so detection can't re-insert them.
    try {
        const cutoff = new Date(Date.now() - STALE_PENDING_HOURS * 60 * 60 * 1000).toISOString();
        const { data: stale, error: fetchErr } = await supabaseAdmin
            .from('posts')
            .select('id, title, source_url, anime_id, claim_type')
            .eq('status', 'pending')
            .lt('timestamp', cutoff);

        if (fetchErr) throw fetchErr;

        if (stale && stale.length > 0) {
            const now = new Date().toISOString();
            const fingerprintRows = stale
                .filter(p => p.title && p.source_url)
                .map(p => ({
                    fingerprint: createFingerprint(p.title, p.source_url),
                    anime_id: p.anime_id ?? null,
                    claim_type: p.claim_type ?? null,
                    origin: 'declined' as const,
                    source_url: p.source_url,
                    seen_at: now,
                }));

            if (fingerprintRows.length > 0) {
                await supabaseAdmin
                    .from('seen_fingerprints')
                    .upsert(fingerprintRows, { onConflict: 'fingerprint' });
            }

            const ids = stale.map(p => p.id);
            const { error: delErr } = await supabaseAdmin.from('posts').delete().in('id', ids);
            if (delErr) throw delErr;

            result.stalePendingDeclined = ids.length;
        }
    } catch (e: any) {
        result.errors.push(`stale_pending_decline: ${e.message}`);
    }

    // 1. Safety-net candidate sweep
    try {
        const { data } = await supabaseAdmin.rpc('cleanup_old_candidates');
        result.candidateSweep = typeof data === 'number' ? data : 0;
    } catch (e: any) {
        result.errors.push(`cleanup_old_candidates: ${e.message}`);
    }

    // Pre-capture the blog-videos objects of posts that are about to expire,
    // keyed by slug. cleanup_expired_posts (below) deletes the rows and returns
    // only (slug, image), so we grab their video objects NOW and delete them
    // AFTER — intersected with the slugs the RPC actually removed. That way we
    // only ever touch videos of posts retention deleted, never a live post's
    // staged/original reel (which Studio may still re-edit from).
    const expiringVideos = new Map<string, string[]>();
    try {
        const { data: soon } = await supabaseAdmin
            .from('posts')
            .select('slug, social_ids')
            .not('expires_at', 'is', null)
            .lt('expires_at', new Date().toISOString());
        for (const p of soon || []) {
            const sid: any = p.social_ids || {};
            const files = [
                extractBucketFile(sid.staged_video_url, VIDEO_BUCKET),
                extractBucketFile(sid.original_video_url, VIDEO_BUCKET),
            ].filter((x): x is string => !!x);
            if (files.length) expiringVideos.set(p.slug, files);
        }
    } catch (e: any) {
        result.errors.push(`expiring_video_precapture: ${e.message}`);
    }

    // 2. Expired posts — function returns (slug, image) rows for deleted posts
    let expiredImages: { slug: string; image: string | null }[] = [];
    try {
        const { data } = await supabaseAdmin.rpc('cleanup_expired_posts');
        expiredImages = (data || []).map((r: any) => ({ slug: r.deleted_slug, image: r.deleted_image }));
        result.expiredPostsDeleted = expiredImages.length;
    } catch (e: any) {
        result.errors.push(`cleanup_expired_posts: ${e.message}`);
    }

    // 3. Delete bucket files for expired posts
    const filesToDelete = expiredImages
        .map(r => extractStoredFilename(r.image))
        .filter((x): x is string => !!x);

    if (filesToDelete.length > 0) {
        try {
            const { data: removed, error } = await supabaseAdmin.storage
                .from(STORAGE_BUCKET)
                .remove(filesToDelete);
            if (error) result.errors.push(`storage.remove(expired): ${error.message}`);
            result.bucketFilesDeleted = removed?.length || 0;
        } catch (e: any) {
            result.errors.push(`storage.remove(expired): ${e.message}`);
        }
    }

    // 3b. Delete blog-videos objects for the posts that just expired. Only the
    // slugs cleanup_expired_posts actually removed, matched against the
    // pre-captured map — so this never deletes a live post's video. Closes the
    // storage ratchet: staged reels (up to ~80MB each) were never swept before.
    if (expiredImages.length > 0 && expiringVideos.size > 0) {
        const videoFiles = Array.from(
            new Set(expiredImages.flatMap(r => expiringVideos.get(r.slug) || [])),
        );
        if (videoFiles.length > 0) {
            try {
                const { data: removed, error } = await supabaseAdmin.storage
                    .from(VIDEO_BUCKET)
                    .remove(videoFiles);
                if (error) result.errors.push(`storage.remove(videos): ${error.message}`);
                result.videoFilesDeleted = removed?.length || 0;
            } catch (e: any) {
                result.errors.push(`storage.remove(videos): ${e.message}`);
            }
        }
    }

    // 3c. Slim the blog-videos bucket every run (not only on post expiry).
    // A trailer for a YouTube-embed post is dead weight once published: the blog
    // article plays the YouTube iframe (PostBody: hasUploadedVideo requires NO
    // youtube_video_id), and the Reel already lives on social. Those + true
    // orphans (no post references them) are removed here. We KEEP anything a
    // post with youtube_video_id IS NULL references (the uploaded/edited videos
    // the site plays natively) and anything on a not-yet-published post
    // (in-flight drafts), and skip files staged in the last 24h as a safety
    // margin against yanking a reel mid-publish. This is what stops the storage
    // ratchet that pushed the org over its free quota (July 2026).
    try {
        const keep = new Set<string>();
        const addKeep = (u: string | null | undefined) => {
            const raw = extractBucketFile(u, VIDEO_BUCKET);
            if (raw) { keep.add(raw); try { keep.add(decodeURIComponent(raw)); } catch { /* noop */ } }
        };
        // Posts whose staged/original video must survive: uploaded/edited
        // (no youtube source) OR any post not yet published (still in flight).
        const { data: served, error: serveErr } = await supabaseAdmin
            .from('posts')
            .select('social_ids')
            .or('youtube_video_id.is.null,status.neq.published');
        if (serveErr) throw serveErr;
        for (const p of served || []) {
            const sid: any = p.social_ids || {};
            addKeep(sid.staged_video_url);
            addKeep(sid.original_video_url);
        }

        // Defensive: never run a bucket-wide delete with an empty keep-set —
        // a transient query hiccup must not wipe the site-served videos.
        if (keep.size === 0) {
            result.errors.push('video-slim-sweep: empty keep-set, skipped for safety');
        } else {
            const cutoff = Date.now() - 24 * 60 * 60 * 1000;
            const vids: { name: string; created_at?: string }[] = [];
            const PAGE = 1000;
            for (let offset = 0; ; offset += PAGE) {
                const { data: page, error: listErr } = await supabaseAdmin.storage
                    .from(VIDEO_BUCKET)
                    .list('', { limit: PAGE, offset, sortBy: { column: 'created_at', order: 'asc' } });
                if (listErr) throw listErr;
                if (!page || page.length === 0) break;
                vids.push(...page.filter((f: any) => f.id).map((f: any) => ({ name: f.name, created_at: f.created_at })));
                if (page.length < PAGE) break;
            }
            const stale = vids
                .filter(v => !keep.has(v.name))
                .filter(v => !v.created_at || new Date(v.created_at).getTime() < cutoff)
                .map(v => v.name);
            for (let i = 0; i < stale.length; i += 100) {
                const { data: removed, error: rmErr } = await supabaseAdmin.storage
                    .from(VIDEO_BUCKET)
                    .remove(stale.slice(i, i + 100));
                if (rmErr) { result.errors.push(`storage.remove(video-slim): ${rmErr.message}`); break; }
                result.videoFilesDeleted += removed?.length || 0;
            }
        }
    } catch (e: any) {
        result.errors.push(`video-slim-sweep: ${e.message}`);
    }

    // 4. Orphan sweep — files in bucket whose slug no longer has a post row.
    //
    // image-processor.ts uploads as `<slug>-social.png`. The previous regex
    // only matched `<slug>-<digits>.<ext>`, so it never recognised the
    // -social suffix and treated every published post's image as an
    // orphan — the file got deleted at the next 03:00 UTC sweep, leaving
    // every post with a 400'ing image URL by the next morning.
    //
    // deriveSlug returns the underlying post slug for assets we *should*
    // check; returns null for filenames we shouldn't touch (editor uploads
    // in subfolders, ad-hoc files we don't recognise).
    const deriveSlug = (filename: string): string | null => {
        if (filename.includes('/')) return null; // subfolder asset (e.g. editor-uploads/) — leave alone
        const social = filename.match(/^(.+)-social\.(png|jpe?g|webp)$/i);
        if (social) return social[1];
        const tsLegacy = filename.match(/^(.+)-\d{6,}\.(png|jpe?g|webp)$/i);
        if (tsLegacy) return tsLegacy[1];
        return null;
    };

    try {
        // Page through the whole bucket — the single limit:1000 call left any
        // files past the first 1000 permanently unswept as the archive grew.
        const bucketList: { name: string }[] = [];
        const PAGE = 1000;
        for (let offset = 0; ; offset += PAGE) {
            const { data: page, error: listError } = await supabaseAdmin.storage
                .from(STORAGE_BUCKET)
                .list('', { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
            if (listError) throw listError;
            if (!page || page.length === 0) break;
            bucketList.push(...page.map(f => ({ name: f.name })));
            if (page.length < PAGE) break;
        }
        if (bucketList.length > 0) {
            const candidates = bucketList
                .map(f => ({ name: f.name, slug: deriveSlug(f.name) }))
                .filter(c => c.slug !== null) as Array<{ name: string; slug: string }>;

            if (candidates.length > 0) {
                const slugs = candidates.map(c => c.slug);
                const { data: existingPosts } = await supabaseAdmin
                    .from('posts')
                    .select('slug')
                    .in('slug', slugs);

                const existingSlugs = new Set((existingPosts || []).map(p => p.slug));
                const orphans = candidates
                    .filter(c => !existingSlugs.has(c.slug))
                    .map(c => c.name);

                if (orphans.length > 0) {
                    const { data: removed, error: removeErr } = await supabaseAdmin.storage
                        .from(STORAGE_BUCKET)
                        .remove(orphans);
                    if (removeErr) result.errors.push(`storage.remove(orphans): ${removeErr.message}`);
                    result.bucketOrphansDeleted = removed?.length || 0;
                }
            }
        }
    } catch (e: any) {
        result.errors.push(`orphan-sweep: ${e.message}`);
    }

    // 5. Logs — 30-day retention. Returns table(table_name, deleted_rows).
    try {
        const { data } = await supabaseAdmin.rpc('cleanup_old_logs', { retention_days: 30 });
        if (Array.isArray(data)) {
            for (const row of data) {
                result.logSweep[row.table_name] = row.deleted_rows;
            }
        }
    } catch (e: any) {
        result.errors.push(`cleanup_old_logs: ${e.message}`);
    }

    // 6. Fingerprints — 90-day retention
    try {
        const { data } = await supabaseAdmin.rpc('cleanup_old_fingerprints', { retention_days: 90 });
        result.fingerprintSweep = typeof data === 'number' ? data : 0;
    } catch (e: any) {
        result.errors.push(`cleanup_old_fingerprints: ${e.message}`);
    }

    // 7. Expired redirects — 1-year retention
    try {
        const { data } = await supabaseAdmin.rpc('cleanup_expired_redirects', { retention_days: 365 });
        result.redirectSweep = typeof data === 'number' ? data : 0;
    } catch (e: any) {
        result.errors.push(`cleanup_expired_redirects: ${e.message}`);
    }

    // 8. Page views — 90-day retention
    try {
        const { data } = await supabaseAdmin.rpc('cleanup_page_views', { retention_days: 90 });
        result.pageViewSweep = typeof data === 'number' ? data : 0;
    } catch (e: any) {
        result.errors.push(`cleanup_page_views: ${e.message}`);
    }

    // 9. Done tasks — 30-day retention
    try {
        const { data } = await supabaseAdmin.rpc('cleanup_old_tasks', { retention_days: 30 });
        result.taskSweep = typeof data === 'number' ? data : 0;
    } catch (e: any) {
        result.errors.push(`cleanup_old_tasks: ${e.message}`);
    }

    // 10. Daily reports — 180-day retention
    try {
        const { data } = await supabaseAdmin.rpc('cleanup_old_daily_reports', { retention_days: 180 });
        result.dailyReportSweep = typeof data === 'number' ? data : 0;
    } catch (e: any) {
        result.errors.push(`cleanup_old_daily_reports: ${e.message}`);
    }

    // 11. Stale worker locks
    try {
        const { data } = await supabaseAdmin.rpc('cleanup_stale_locks');
        result.staleLockSweep = typeof data === 'number' ? data : 0;
    } catch (e: any) {
        result.errors.push(`cleanup_stale_locks: ${e.message}`);
    }

    // 12. DB size probe — alert if approaching the 500MB free-tier limit
    try {
        const { data } = await supabaseAdmin.rpc('database_size_bytes');
        result.dbSizeBytes = typeof data === 'number' ? data : Number(data) || 0;
        result.storageAlert = result.dbSizeBytes > STORAGE_ALERT_BYTES;
        if (result.storageAlert) {
            await supabaseAdmin.from('error_logs').insert({
                source: 'cleanup-worker',
                error_message: `DB size ${(result.dbSizeBytes / 1024 / 1024).toFixed(1)} MB exceeds ${STORAGE_ALERT_BYTES / 1024 / 1024} MB alert threshold`,
                context: { dbSizeBytes: result.dbSizeBytes },
            });
        }
    } catch (e: any) {
        result.errors.push(`database_size_bytes: ${e.message}`);
    }

    result.durationMs = Date.now() - start;

    await logSchedulerRun(
        'cleanup',
        result.errors.length > 0 ? 'error' : 'success',
        `expired:${result.expiredPostsDeleted} bucket:${result.bucketFilesDeleted}+${result.bucketOrphansDeleted} vid:${result.videoFilesDeleted} fp:${result.fingerprintSweep} pv:${result.pageViewSweep} size:${(result.dbSizeBytes / 1024 / 1024).toFixed(1)}MB`,
        result as any
    );

    return result;
}
