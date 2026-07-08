/**
 * KumoLab Studio — data model.
 *
 * A "project" is the serializable edit description (tracks + clips + media
 * manifest). It is persisted to `posts.image_settings.video_project` so an
 * edit is always re-openable. The actual media BYTES live outside the project
 * (in OPFS locally, and in Supabase Storage remotely via `remoteUrl`); the
 * project only references them by `mediaId`.
 *
 * Positions use the same normalized, centre-based convention as the legacy
 * VideoEditor (`xPct`/`yPct` in 0..1 of the canvas), so overlay math is shared
 * between the live preview and the FFmpeg export.
 */

export type TrackKind = 'video' | 'audio' | 'text' | 'image';
export type FillStyle = 'black' | 'white' | 'blur';
export type FitMode = 'contain' | 'cover';

/** An imported source asset. Bytes are referenced, never stored in the project. */
export interface MediaAsset {
    id: string;
    kind: 'video' | 'audio' | 'image';
    name: string;
    /**
     * Where the canonical bytes live:
     *  - 'post-original' → the post's immutable import (social_ids.original_video_url)
     *  - 'upload'        → uploaded by the operator to a Supabase bucket (remoteUrl)
     *  - 'opfs'          → only cached locally (must be uploaded before it can publish)
     */
    origin: 'post-original' | 'upload' | 'opfs';
    remoteUrl?: string;
    opfsKey?: string;
    durationSec: number;
    width?: number;
    height?: number;
    hasAudio?: boolean;
    createdAt: number;
}

/** Visual placement of a clip on the canvas (video / image). */
export interface Transform {
    xPct: number;          // centre X, 0..1
    yPct: number;          // centre Y, 0..1
    scale: number;         // 1 = fit baseline
    rotationDeg: number;
    opacity: number;       // 0..1
    fit: FitMode;
    fillStyle?: FillStyle; // background when `contain` leaves bars
    blurIntensity?: number;// used when fillStyle === 'blur'
}

export interface TextStyle {
    text: string;
    color: string;
    sizePct: number;       // font size as a fraction of canvas height
    fontFamily?: string;
    weight?: number;
    align?: 'left' | 'center' | 'right';
    bg?: string | null;    // optional caption box
    strokePx?: number;
    strokeColor?: string;
}

export type TransitionKind = 'none' | 'fade' | 'crossfade' | 'slide';
export interface Transition {
    kind: TransitionKind;
    durationSec: number;
}

export type ClipEffectType = 'brightness' | 'contrast' | 'saturation' | 'blur' | 'grayscale';
export interface ClipEffect {
    type: ClipEffectType;
    amount: number;        // meaning depends on type; 0 = neutral
}

export interface Clip {
    id: string;
    trackId: string;
    mediaId?: string;      // undefined for pure text clips
    // Source window in media-local seconds. For text/image: srcStart=0.
    srcStart: number;
    srcEnd: number;
    // Global timeline placement (seconds).
    timelineStart: number;
    // Rendered length on the timeline = (srcEnd - srcStart) / speed.
    duration: number;
    speed: number;         // 1 = normal
    volume: number;        // 0..1
    muted: boolean;
    transform?: Transform; // video / image
    text?: TextStyle;      // text clips
    transitionIn?: Transition;
    effects?: ClipEffect[];
    z: number;             // stacking within a frame (higher = front)
}

export interface Track {
    id: string;
    kind: TrackKind;
    name: string;
    clips: Clip[];         // kept sorted by timelineStart
    muted: boolean;
    hidden: boolean;
    locked: boolean;
    order: number;         // 0 = top row
}

export interface ProjectMeta {
    canvasWidth: number;   // 1080
    canvasHeight: number;  // 1920
    fps: number;           // 30
    backgroundColor: string;
}

export interface VideoProject {
    schemaVersion: 1;
    postId: string;
    meta: ProjectMeta;
    tracks: Track[];
    media: MediaAsset[];
    durationSec: number;
    updatedAt: number;
}

// ── Defaults / factories ──────────────────────────────────────────────────

export const DEFAULT_META: ProjectMeta = {
    canvasWidth: 1080,
    canvasHeight: 1920,
    fps: 30,
    backgroundColor: '#000000',
};

export const DEFAULT_TRANSFORM: Transform = {
    xPct: 0.5,
    yPct: 0.5,
    scale: 1,
    rotationDeg: 0,
    opacity: 1,
    fit: 'contain',
    fillStyle: 'blur',
    blurIntensity: 20,
};

export const DEFAULT_TEXT: TextStyle = {
    text: 'New text',
    color: '#ffffff',
    sizePct: 0.05,
    weight: 800,
    align: 'center',
    bg: null,
    strokePx: 2,
    strokeColor: 'rgba(0,0,0,0.85)',
};

/** Guard rails (see plan: browser export performance). */
export const CAPS = {
    maxDurationSec: 120,
    maxTracks: 6,
    maxSourceWidth: 1080,
    warnDurationSec: 60,
};

export function uid(): string {
    try {
        return crypto.randomUUID();
    } catch {
        // Fallback for insecure contexts / older engines.
        return 'id-' + Math.abs(Math.floor((performance.now() % 1) * 1e9)).toString(36) + '-' + (globalThis.__kumoIdSeq = (globalThis.__kumoIdSeq || 0) + 1).toString(36);
    }
}

declare global {
    // eslint-disable-next-line no-var
    var __kumoIdSeq: number | undefined;
}

export function emptyProject(postId: string): VideoProject {
    return {
        schemaVersion: 1,
        postId,
        meta: { ...DEFAULT_META },
        tracks: [],
        media: [],
        durationSec: 0,
        updatedAt: Date.now(),
    };
}
