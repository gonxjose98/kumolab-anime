'use client';

import { create } from 'zustand';

/**
 * Transient playback + view state for the timeline. Never serialized.
 * `currentTime` is the playhead position in seconds on the global timeline.
 * `pxPerSec` is the timeline zoom (pixels per second of content).
 */
interface PlaybackStore {
    currentTime: number;
    isPlaying: boolean;
    pxPerSec: number;
    setCurrentTime: (t: number) => void;
    play: () => void;
    pause: () => void;
    toggle: () => void;
    setPxPerSec: (v: number) => void;
    zoomBy: (factor: number) => void;
}

const MIN_PX = 8;
const MAX_PX = 240;

export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
    currentTime: 0,
    isPlaying: false,
    pxPerSec: 40,
    setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),
    play: () => set({ isPlaying: true }),
    pause: () => set({ isPlaying: false }),
    toggle: () => set((s) => ({ isPlaying: !s.isPlaying })),
    setPxPerSec: (v) => set({ pxPerSec: Math.min(MAX_PX, Math.max(MIN_PX, v)) }),
    zoomBy: (factor) => set({ pxPerSec: Math.min(MAX_PX, Math.max(MIN_PX, get().pxPerSec * factor)) }),
}));
