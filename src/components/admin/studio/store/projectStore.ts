'use client';

import { create } from 'zustand';
import {
    type VideoProject,
    type Track,
    type Clip,
    type MediaAsset,
    type TrackKind,
    emptyProject,
    uid,
} from '../types';

/**
 * The serializable edit model. Every mutation goes through `commit()` which
 * snapshots the previous project onto an undo stack, keeps each track's clips
 * time-sorted, and recomputes the total duration. `serialize()` returns the
 * object we PATCH into `posts.image_settings.video_project`.
 */
interface ProjectStore {
    project: VideoProject | null;
    selectedClipIds: string[];
    past: VideoProject[];
    future: VideoProject[];

    load: (project: VideoProject) => void;
    initEmpty: (postId: string) => void;

    addMedia: (asset: MediaAsset) => void;
    removeMedia: (mediaId: string) => void;

    addTrack: (kind: TrackKind, name?: string) => string;
    reorderTracks: (orderedIds: string[]) => void;
    setTrackFlag: (trackId: string, flag: 'muted' | 'hidden' | 'locked', value: boolean) => void;

    addClip: (trackId: string, clip: Omit<Clip, 'id' | 'trackId'> & Partial<Pick<Clip, 'id'>>) => string;
    updateClip: (clipId: string, patch: Partial<Clip>) => void;
    moveClip: (clipId: string, toTrackId: string, timelineStart: number) => void;
    trimClip: (clipId: string, edge: 'start' | 'end', deltaSec: number) => void;
    splitClip: (clipId: string, atTimelineSec: number) => void;
    removeClip: (clipId: string) => void;

    select: (ids: string[]) => void;
    clearSelection: () => void;

    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;

    getClip: (clipId: string) => { clip: Clip; track: Track } | null;
    serialize: () => VideoProject | null;
}

const MIN_CLIP = 0.1; // seconds

function clone(p: VideoProject): VideoProject {
    return JSON.parse(JSON.stringify(p));
}

function sortTrack(t: Track): Track {
    t.clips.sort((a, b) => a.timelineStart - b.timelineStart);
    return t;
}

function recompute(p: VideoProject): VideoProject {
    let end = 0;
    for (const t of p.tracks) {
        for (const c of t.clips) end = Math.max(end, c.timelineStart + c.duration);
    }
    p.durationSec = end;
    p.updatedAt = Date.now();
    return p;
}

export const useProjectStore = create<ProjectStore>((set, get) => {
    /** Apply a pure mutation to a cloned project, snapshotting for undo. */
    const commit = (mutator: (p: VideoProject) => void) => {
        const cur = get().project;
        if (!cur) return;
        const snapshot = clone(cur);
        const next = clone(cur);
        mutator(next);
        for (const t of next.tracks) sortTrack(t);
        recompute(next);
        set((s) => ({
            project: next,
            past: [...s.past.slice(-49), snapshot],
            future: [],
        }));
    };

    const findClip = (p: VideoProject, clipId: string): { clip: Clip; track: Track } | null => {
        for (const t of p.tracks) {
            const clip = t.clips.find((c) => c.id === clipId);
            if (clip) return { clip, track: t };
        }
        return null;
    };

    return {
        project: null,
        selectedClipIds: [],
        past: [],
        future: [],

        load: (project) => set({ project: clone(project), past: [], future: [], selectedClipIds: [] }),
        initEmpty: (postId) => set({ project: emptyProject(postId), past: [], future: [], selectedClipIds: [] }),

        addMedia: (asset) => commit((p) => {
            if (!p.media.some((m) => m.id === asset.id)) p.media.push(asset);
        }),
        removeMedia: (mediaId) => commit((p) => {
            p.media = p.media.filter((m) => m.id !== mediaId);
            for (const t of p.tracks) t.clips = t.clips.filter((c) => c.mediaId !== mediaId);
        }),

        addTrack: (kind, name) => {
            const id = uid();
            commit((p) => {
                const order = p.tracks.length;
                p.tracks.push({
                    id, kind,
                    name: name || `${kind[0].toUpperCase()}${kind.slice(1)} ${p.tracks.filter((t) => t.kind === kind).length + 1}`,
                    clips: [], muted: false, hidden: false, locked: false, order,
                });
            });
            return id;
        },
        reorderTracks: (orderedIds) => commit((p) => {
            orderedIds.forEach((id, i) => {
                const t = p.tracks.find((x) => x.id === id);
                if (t) t.order = i;
            });
            p.tracks.sort((a, b) => a.order - b.order);
        }),
        setTrackFlag: (trackId, flag, value) => commit((p) => {
            const t = p.tracks.find((x) => x.id === trackId);
            if (t) (t as any)[flag] = value;
        }),

        addClip: (trackId, clip) => {
            const id = clip.id ?? uid();
            commit((p) => {
                const t = p.tracks.find((x) => x.id === trackId);
                if (!t) return;
                t.clips.push({ ...(clip as Clip), id, trackId });
            });
            return id;
        },
        updateClip: (clipId, patch) => commit((p) => {
            const found = findClip(p, clipId);
            if (!found) return;
            Object.assign(found.clip, patch);
        }),
        moveClip: (clipId, toTrackId, timelineStart) => commit((p) => {
            const found = findClip(p, clipId);
            if (!found) return;
            const { clip, track } = found;
            track.clips = track.clips.filter((c) => c.id !== clipId);
            clip.trackId = toTrackId;
            clip.timelineStart = Math.max(0, timelineStart);
            const dest = p.tracks.find((x) => x.id === toTrackId) || track;
            dest.clips.push(clip);
        }),
        trimClip: (clipId, edge, deltaSec) => commit((p) => {
            const found = findClip(p, clipId);
            if (!found) return;
            const { clip } = found;
            if (edge === 'start') {
                const newSrcStart = clip.srcStart + deltaSec * clip.speed;
                const maxStart = clip.srcEnd - MIN_CLIP * clip.speed;
                clip.srcStart = Math.min(Math.max(0, newSrcStart), maxStart);
                clip.timelineStart = Math.max(0, clip.timelineStart + deltaSec);
            } else {
                const newSrcEnd = clip.srcEnd + deltaSec * clip.speed;
                clip.srcEnd = Math.max(clip.srcStart + MIN_CLIP * clip.speed, newSrcEnd);
            }
            clip.duration = (clip.srcEnd - clip.srcStart) / clip.speed;
        }),
        splitClip: (clipId, atTimelineSec) => commit((p) => {
            const found = findClip(p, clipId);
            if (!found) return;
            const { clip, track } = found;
            const offset = atTimelineSec - clip.timelineStart;
            if (offset <= MIN_CLIP || offset >= clip.duration - MIN_CLIP) return;
            const srcSplit = clip.srcStart + offset * clip.speed;
            const right: Clip = {
                ...(JSON.parse(JSON.stringify(clip)) as Clip),
                id: uid(),
                srcStart: srcSplit,
                timelineStart: clip.timelineStart + offset,
                duration: (clip.srcEnd - srcSplit) / clip.speed,
                transitionIn: undefined,
            };
            clip.srcEnd = srcSplit;
            clip.duration = offset;
            track.clips.push(right);
        }),
        removeClip: (clipId) => {
            commit((p) => {
                for (const t of p.tracks) t.clips = t.clips.filter((c) => c.id !== clipId);
            });
            set((s) => ({ selectedClipIds: s.selectedClipIds.filter((id) => id !== clipId) }));
        },

        select: (ids) => set({ selectedClipIds: ids }),
        clearSelection: () => set({ selectedClipIds: [] }),

        undo: () => set((s) => {
            if (!s.past.length || !s.project) return s;
            const prev = s.past[s.past.length - 1];
            return { project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future].slice(0, 50) };
        }),
        redo: () => set((s) => {
            if (!s.future.length || !s.project) return s;
            const next = s.future[0];
            return { project: next, future: s.future.slice(1), past: [...s.past, s.project].slice(-50) };
        }),
        canUndo: () => get().past.length > 0,
        canRedo: () => get().future.length > 0,

        getClip: (clipId) => {
            const p = get().project;
            return p ? findClip(p, clipId) : null;
        },
        serialize: () => get().project,
    };
});
