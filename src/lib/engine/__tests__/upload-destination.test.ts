import { describe, it, expect } from 'vitest';
import { resolveUploadTarget } from '@/lib/supabase/upload-target';
import { canArchive } from '@/components/admin/studio/libraryUpload';

// The bucket split is the whole reason the media library is safe: transient
// post footage lives in blog-* (which the cleanup worker slims), curated
// library media lives in studio-library (which nothing sweeps).

describe('resolveUploadTarget', () => {
    it('routes library uploads to studio-library for both kinds', () => {
        expect(resolveUploadTarget('library', 'video')).toEqual({ bucket: 'studio-library', prefix: 'library' });
        expect(resolveUploadTarget('library', 'image')).toEqual({ bucket: 'studio-library', prefix: 'library' });
    });

    it('keeps the original behaviour when destination is absent', () => {
        expect(resolveUploadTarget(undefined, 'video')).toEqual({ bucket: 'blog-videos', prefix: 'manual-uploads' });
        expect(resolveUploadTarget(undefined, 'image')).toEqual({ bucket: 'blog-images', prefix: 'manual-uploads' });
    });

    it("treats an explicit 'post' the same as absent", () => {
        expect(resolveUploadTarget('post', 'video')).toEqual({ bucket: 'blog-videos', prefix: 'manual-uploads' });
    });

    it('never falls through to the library bucket for an unexpected value', () => {
        // The route rejects these before calling us; this pins the fail-safe
        // direction if that guard is ever relaxed.
        for (const bad of ['LIBRARY', 'lib', '', null, 0, {}]) {
            expect(resolveUploadTarget(bad, 'video').bucket).toBe('blog-videos');
        }
    });
});

describe('canArchive — audio is excluded', () => {
    it('accepts the kinds the library can store', () => {
        expect(canArchive('image')).toBe(true);
        expect(canArchive('video')).toBe(true);
    });

    it('rejects audio', () => {
        // upload-sign accepts only video|image, the studio/media POST rejects
        // other kinds, and studio_media's CHECK bars 'audio'. Offering it would
        // fail at the storage layer.
        expect(canArchive('audio')).toBe(false);
    });
});
