'use client';

import { useProjectStore } from './store/projectStore';
import { DEFAULT_TRANSFORM, DEFAULT_TEXT, type MediaAsset, type TrackKind, type Clip } from './types';

const IMAGE_DEFAULT_SEC = 5;

function trackKindFor(assetKind: MediaAsset['kind']): TrackKind {
    return assetKind === 'audio' ? 'audio' : assetKind === 'image' ? 'image' : 'video';
}

/** Append a clip for an asset onto a suitable track (creating one if needed). */
export function addAssetToTimeline(asset: MediaAsset): string {
    const store = useProjectStore.getState();
    const p = store.project;
    if (!p) return '';
    const kind = trackKindFor(asset.kind);
    let track = p.tracks.find((t) => t.kind === kind && !t.locked);
    let trackId = track?.id;
    if (!trackId) trackId = store.addTrack(kind);

    // Place at the end of that track's timeline.
    const t2 = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    const end = t2.clips.reduce((mx, c) => Math.max(mx, c.timelineStart + c.duration), 0);

    const dur = asset.kind === 'image' ? IMAGE_DEFAULT_SEC : Math.max(0.1, asset.durationSec);
    const clip: Omit<Clip, 'id' | 'trackId'> = {
        mediaId: asset.id,
        srcStart: 0,
        srcEnd: asset.kind === 'image' ? IMAGE_DEFAULT_SEC : Math.max(0.1, asset.durationSec),
        timelineStart: end,
        duration: dur,
        speed: 1,
        volume: 1,
        muted: false,
        transform: { ...DEFAULT_TRANSFORM },
        z: 0,
    };
    return store.addClip(trackId, clip);
}

/** Add an empty text clip at the current playhead on a text track. */
export function addTextClip(atSec: number): string {
    const store = useProjectStore.getState();
    const p = store.project;
    if (!p) return '';
    let track = p.tracks.find((t) => t.kind === 'text' && !t.locked);
    let trackId = track?.id;
    if (!trackId) trackId = store.addTrack('text');
    const clip: Omit<Clip, 'id' | 'trackId'> = {
        srcStart: 0,
        srcEnd: 3,
        timelineStart: Math.max(0, atSec),
        duration: 3,
        speed: 1,
        volume: 1,
        muted: false,
        // Land captions in the lower third, horizontally centred — where anime
        // clips put them, and clear of the top action. The operator can still
        // drag it anywhere with the Position sliders.
        transform: { ...DEFAULT_TRANSFORM, fillStyle: undefined, xPct: 0.5, yPct: 0.8 },
        text: { ...DEFAULT_TEXT },
        z: 10,
    };
    const id = store.addClip(trackId, clip);
    store.select([id]);
    return id;
}
