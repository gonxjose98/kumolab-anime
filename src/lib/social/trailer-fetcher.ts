/**
 * trailer-fetcher.ts
 *
 * Given a YouTube URL, download the MP4 and stage it in the blog-videos Supabase
 * bucket. Returns a public URL that TikTok + YT Shorts publishers can point at.
 *
 * Reliability notes:
 *   - YouTube plays cat-and-mouse with programmatic downloads. @distube/ytdl-core
 *     ships updates when things break, but expect occasional failures.
 *   - Vercel serverless timeout is 60s on Pro. Trailers <60s at 360p run fine;
 *     longer/higher-quality videos may time out.
 *   - On failure, the publisher falls back to website + IG only (no TikTok/YT).
 */

import ytdl from '@distube/ytdl-core';
import { supabaseAdmin } from '../supabase/admin';
import { processForSocial } from './video-processor';

const BUCKET = 'blog-videos';
const MAX_BYTES = 80 * 1024 * 1024; // 80 MB hard cap — anything larger skips re-upload

export interface TrailerStaged {
    bucket_url: string;
    bucket_path: string;
    video_id: string;
    duration_seconds: number;
    bytes: number;
    title?: string;
}

function extractVideoId(url: string): string | null {
    try {
        const u = new URL(url);
        if (u.hostname.includes('youtu.be')) {
            return u.pathname.replace(/^\//, '').split('/')[0] || null;
        }
        const v = u.searchParams.get('v');
        if (v) return v;
        const short = u.pathname.match(/\/shorts\/([^/]+)/);
        if (short) return short[1];
    } catch { /* fall through */ }
    return null;
}

export async function fetchYouTubeToBucket(sourceUrl: string, slug: string): Promise<TrailerStaged | null> {
    const videoId = extractVideoId(sourceUrl);
    if (!videoId) {
        console.warn('[TrailerFetcher] Could not extract video ID from:', sourceUrl);
        return null;
    }

    try {
        const canonical = `https://www.youtube.com/watch?v=${videoId}`;
        const info = await ytdl.getInfo(canonical);
        const duration = parseInt(info.videoDetails.lengthSeconds || '0', 10);

        if (duration > 180) {
            console.warn(`[TrailerFetcher] Video too long for Shorts/TikTok (${duration}s > 180s), skipping`);
            return null;
        }

        // Prefer a compact MP4 format under 60MB. itag 18 = 360p MP4 (ubiquitous).
        const format = ytdl.chooseFormat(info.formats, {
            quality: '18',
            filter: f => f.container === 'mp4' && !!f.hasVideo && !!f.hasAudio,
        });

        if (!format) {
            console.warn('[TrailerFetcher] No suitable MP4 format found for', videoId);
            return null;
        }

        // Buffer into memory — 360p trailers are typically well under 60 MB.
        const chunks: Buffer[] = [];
        let total = 0;
        const stream = ytdl.downloadFromInfo(info, { format });

        const buffer = await new Promise<Buffer | null>((resolve, reject) => {
            const abortAt = setTimeout(() => {
                stream.destroy(new Error('download timeout (45s)'));
            }, 45_000);

            stream.on('data', (chunk: Buffer) => {
                total += chunk.length;
                if (total > MAX_BYTES) {
                    stream.destroy(new Error(`exceeded max bytes (${MAX_BYTES})`));
                    return;
                }
                chunks.push(chunk);
            });
            stream.on('end', () => {
                clearTimeout(abortAt);
                resolve(Buffer.concat(chunks));
            });
            stream.on('error', err => {
                clearTimeout(abortAt);
                reject(err);
            });
        });

        if (!buffer) return null;

        // Run the FFmpeg pass: 9:16 letterbox + KumoLab watermark + 60s
        // hard-trim. If the pass fails for any reason we fall back to the
        // original buffer rather than blocking the publish — the trailer
        // still ships, just without the rebrand.
        let finalBuffer = buffer;
        try {
            const processed = await processForSocial(buffer, { aspect: '9:16', maxSeconds: 60 });
            if (processed && processed.length > 0) {
                console.log(`[TrailerFetcher] FFmpeg pass: ${buffer.length} → ${processed.length} bytes`);
                finalBuffer = processed;
            } else {
                console.warn('[TrailerFetcher] FFmpeg pass returned null; uploading raw download');
            }
        } catch (e: any) {
            console.warn('[TrailerFetcher] FFmpeg pass threw, uploading raw download:', e?.message || e);
        }

        const bucketPath = `${slug}-${videoId}.mp4`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(bucketPath, finalBuffer, { contentType: 'video/mp4', upsert: true });

        if (uploadError) {
            console.error('[TrailerFetcher] Bucket upload failed:', uploadError.message);
            return null;
        }

        const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(bucketPath);

        return {
            bucket_url: pub.publicUrl,
            bucket_path: bucketPath,
            video_id: videoId,
            duration_seconds: Math.min(duration, 60),
            bytes: finalBuffer.length,
            title: info.videoDetails.title,
        };
    } catch (e: any) {
        console.error('[TrailerFetcher] Failed:', e.message);
        return null;
    }
}
