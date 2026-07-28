import { describe, it, expect } from 'vitest';
import { isSelectable, DEFAULT_KINDS } from '@/components/admin/studio/MediaPickerModal';

// The picker is shared by the carousel builders (images only) and Studio
// (images + video). The default is what protects the carousel screens, so it
// is pinned here rather than left to a literal buried in a signature.

describe('DEFAULT_KINDS protects the carousel call sites', () => {
    it('is images only', () => {
        expect(DEFAULT_KINDS).toEqual(['image']);
    });

    it('makes video unselectable when a caller passes no kinds', () => {
        // MediaFolders "Build carousel" and the post editor's "Add from
        // library" both rely on this: a video can't be a carousel slide.
        expect(isSelectable('image')).toBe(true);
        expect(isSelectable('video')).toBe(false);
    });
});

describe('isSelectable', () => {
    it('allows both kinds when Studio asks for both', () => {
        expect(isSelectable('image', ['image', 'video'])).toBe(true);
        expect(isSelectable('video', ['image', 'video'])).toBe(true);
    });

    it('allows video only when that is the sole allowed kind', () => {
        expect(isSelectable('video', ['video'])).toBe(true);
        expect(isSelectable('image', ['video'])).toBe(false);
    });

    it('selects nothing for an empty allow-list', () => {
        expect(isSelectable('image', [])).toBe(false);
        expect(isSelectable('video', [])).toBe(false);
    });
});
