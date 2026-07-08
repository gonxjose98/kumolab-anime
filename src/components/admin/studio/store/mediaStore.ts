'use client';

import { create } from 'zustand';
import type { MediaAsset } from '../types';
import { getBlob, putBlob } from './blobStore';

/**
 * Live media handles for the current session. Maps mediaId → a playable object
 * URL (blob:) so <video>/<audio>/<img> elements and the exporter can read the
 * bytes without hitting the network repeatedly. Object URLs are session-local
 * and revoked on teardown; the durable manifest lives in the project + the
 * IndexedDB blob cache (see blobStore).
 */
interface MediaEntry {
    url: string;   // object URL
    blob: Blob;
}

interface MediaStore {
    entries: Record<string, MediaEntry>;
    /** Register raw bytes for a media id (from an upload or a fetched remote). Caches to IndexedDB. */
    register: (mediaId: string, blob: Blob, persistKey?: string) => Promise<string>;
    /** Get an object URL for a media id, re-hydrating from IndexedDB or remoteUrl if needed. */
    resolve: (asset: MediaAsset) => Promise<string>;
    getUrl: (mediaId: string) => string | undefined;
    revokeAll: () => void;
}

export const useMediaStore = create<MediaStore>((set, get) => ({
    entries: {},

    register: async (mediaId, blob, persistKey) => {
        const existing = get().entries[mediaId];
        if (existing) return existing.url;
        const url = URL.createObjectURL(blob);
        set((s) => ({ entries: { ...s.entries, [mediaId]: { url, blob } } }));
        if (persistKey) {
            try { await putBlob(persistKey, blob); } catch (e) { console.warn('[studio] blob cache failed', e); }
        }
        return url;
    },

    resolve: async (asset) => {
        const cached = get().entries[asset.id];
        if (cached) return cached.url;

        // 1) Try the local IndexedDB cache (opfsKey === mediaId by convention).
        const key = asset.opfsKey || asset.id;
        let blob = await getBlob(key).catch(() => null);

        // 2) Fall back to fetching the remote bytes, then cache them.
        if (!blob && asset.remoteUrl) {
            const res = await fetch(asset.remoteUrl, { mode: 'cors' });
            if (!res.ok) throw new Error(`Failed to fetch media (${res.status})`);
            blob = await res.blob();
            try { await putBlob(key, blob); } catch { /* cache best-effort */ }
        }
        if (!blob) throw new Error(`Media ${asset.id} has no local bytes and no remoteUrl`);

        const url = URL.createObjectURL(blob);
        set((s) => ({ entries: { ...s.entries, [asset.id]: { url, blob } } }));
        return url;
    },

    getUrl: (mediaId) => get().entries[mediaId]?.url,

    revokeAll: () => {
        const { entries } = get();
        for (const k of Object.keys(entries)) {
            try { URL.revokeObjectURL(entries[k].url); } catch { /* noop */ }
        }
        set({ entries: {} });
    },
}));
