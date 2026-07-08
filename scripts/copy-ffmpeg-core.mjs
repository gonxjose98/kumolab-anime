/**
 * Copy the FFmpeg.wasm cores from node_modules into /public/ffmpeg so the
 * Studio can load them at runtime (self-hosted, no CDN). Runs on postinstall
 * (incl. Vercel's build), because /public/ffmpeg is gitignored — the 30MB+
 * wasm never lives in the repo, it's regenerated from the installed packages.
 */
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ffmpeg');
const outMt = join(out, 'mt');

const jobs = [
    { from: join(root, 'node_modules/@ffmpeg/core/dist/umd'), to: out, files: ['ffmpeg-core.js', 'ffmpeg-core.wasm'] },
    { from: join(root, 'node_modules/@ffmpeg/core-mt/dist/umd'), to: outMt, files: ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'] },
];

let copied = 0;
for (const job of jobs) {
    if (!existsSync(job.from)) { console.warn(`[ffmpeg] source missing, skipping: ${job.from}`); continue; }
    mkdirSync(job.to, { recursive: true });
    for (const f of job.files) {
        const src = join(job.from, f);
        if (!existsSync(src)) { console.warn(`[ffmpeg] file missing: ${src}`); continue; }
        copyFileSync(src, join(job.to, f));
        copied++;
    }
}
console.log(`[ffmpeg] copied ${copied} core file(s) into public/ffmpeg`);
