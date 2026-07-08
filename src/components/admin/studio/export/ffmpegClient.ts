'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

/**
 * Lazily-loaded FFmpeg.wasm singleton. The core (~30MB) is fetched via
 * toBlobURL only when export is first invoked, so it never touches the main
 * bundle. Self-hosted from /public/ffmpeg (single-thread core for now; the
 * multithread core + cross-origin isolation is a later perf upgrade).
 */
let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const CORE_BASE = '/ffmpeg';

export type ProgressFn = (ratio: number) => void;

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
    if (ffmpeg) return ffmpeg;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
        const inst = new FFmpeg();
        if (onLog) inst.on('log', ({ message }) => onLog(message));
        await inst.load({
            coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        ffmpeg = inst;
        return inst;
    })();
    return loadPromise;
}

/** Whether the browser can use the multithreaded core (informational for the UI). */
export function isIsolated(): boolean {
    return typeof globalThis !== 'undefined' && (globalThis as any).crossOriginIsolated === true;
}
