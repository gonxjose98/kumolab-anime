/**
 * video-poster.ts
 *
 * Extract a single representative frame from a staged video and upload it to
 * the blog-images bucket as a JPEG poster. Used to give imported X/IG video
 * posts a real thumbnail (instead of a black ▶ placeholder) in the admin list.
 *
 * The poster URL is stored in posts.image — isVideoPost keys off
 * staged_video_url (not image), so this never affects the video editor, and
 * being referenced by posts.image keeps the cleanup worker from sweeping it.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { supabaseAdmin } from '../supabase/admin';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath = require('ffmpeg-static') as string;
const BUCKET = 'blog-images';

export async function generateVideoPoster(
    videoUrl: string,
    postId: string,
    durationSec?: number,
): Promise<string | null> {
    let buf: Buffer;
    try {
        const r = await fetch(videoUrl, { cache: 'no-store' });
        if (!r.ok) return null;
        buf = Buffer.from(await r.arrayBuffer());
        if (!buf.length) return null;
    } catch {
        return null;
    }

    const tmpDir = os.tmpdir();
    const id = crypto.randomBytes(6).toString('hex');
    const inPath = path.join(tmpDir, `poster-in-${id}.mp4`);
    const outPath = path.join(tmpDir, `poster-out-${id}.jpg`);
    const cleanup = () => {
        try { fs.unlinkSync(inPath); } catch { /* noop */ }
        try { fs.unlinkSync(outPath); } catch { /* noop */ }
    };
    try { fs.writeFileSync(inPath, buf); } catch { cleanup(); return null; }

    // Seek ~25% in for a representative frame (avoids black intro frames),
    // scale to a sensible thumbnail width, decent JPEG quality.
    const seek = durationSec && durationSec > 2 ? Math.max(1, Math.round(durationSec * 0.25)) : 1;
    const args = [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-ss', String(seek),
        '-i', inPath,
        '-frames:v', '1',
        '-vf', "scale='min(720,iw)':-2",
        '-q:v', '3',
        outPath,
    ];

    const ok = await new Promise<boolean>((resolve) => {
        let proc;
        try {
            proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        } catch {
            resolve(false);
            return;
        }
        const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* noop */ } }, 45_000);
        proc.on('error', () => { clearTimeout(timer); resolve(false); });
        proc.on('close', (code: number) => { clearTimeout(timer); resolve(code === 0 && fs.existsSync(outPath)); });
    });
    if (!ok) { cleanup(); return null; }

    let out: Buffer;
    try { out = fs.readFileSync(outPath); } catch { cleanup(); return null; }
    cleanup();
    if (!out.length) return null;

    const bucketPath = `import-poster-${postId}.jpg`;
    const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(bucketPath, out, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(bucketPath);
    return data.publicUrl;
}
