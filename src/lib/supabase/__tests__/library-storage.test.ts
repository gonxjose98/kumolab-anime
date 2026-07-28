import { describe, it, expect } from 'vitest';
import { extractBucketFile, bucketFileVariants } from '@/lib/supabase/storage-url';
import { libraryKeys, LIBRARY_BUCKET } from '@/lib/supabase/library-storage';

const pub = (bucket: string, key: string) =>
    `https://xzoqsldtcoeaegxcdsia.supabase.co/storage/v1/object/public/${bucket}/${key}`;

describe('extractBucketFile', () => {
    it('pulls the object key for the matching bucket', () => {
        expect(extractBucketFile(pub('studio-library', 'library/123-clip.mp4'), 'studio-library'))
            .toBe('library/123-clip.mp4');
    });

    it('returns null for a different bucket', () => {
        expect(extractBucketFile(pub('blog-videos', 'manual-uploads/1-a.mp4'), 'studio-library')).toBeNull();
    });

    it('returns null for empty input', () => {
        expect(extractBucketFile(null, 'studio-library')).toBeNull();
        expect(extractBucketFile(undefined, 'studio-library')).toBeNull();
        expect(extractBucketFile('not-a-url', 'studio-library')).toBeNull();
    });
});

describe('bucketFileVariants', () => {
    it('returns both raw and decoded spellings when they differ', () => {
        const v = bucketFileVariants(pub('blog-videos', 'manual-uploads/1-a%20b.mp4'), 'blog-videos');
        expect(v).toContain('manual-uploads/1-a%20b.mp4');
        expect(v).toContain('manual-uploads/1-a b.mp4');
    });

    it('does not duplicate when the spellings match', () => {
        expect(bucketFileVariants(pub('blog-videos', 'plain.mp4'), 'blog-videos')).toEqual(['plain.mp4']);
    });

    it('survives a malformed escape sequence', () => {
        const v = bucketFileVariants(pub('blog-videos', 'bad%.mp4'), 'blog-videos');
        expect(v).toEqual(['bad%.mp4']);
    });
});

describe('libraryKeys — what a delete is allowed to remove', () => {
    it('selects only studio-library objects', () => {
        // A studio_media row can legitimately hold a blog-* URL. Those objects
        // belong to the cleanup worker's lifecycle, and removing them here
        // would delete media a live post is still serving.
        const keys = libraryKeys([
            pub(LIBRARY_BUCKET, 'library/1-a.mp4'),
            pub('blog-videos', 'manual-uploads/2-b.mp4'),
            pub('blog-images', 'manual-uploads/3-c.jpg'),
            null,
            undefined,
            'https://example.com/elsewhere.mp4',
        ]);
        expect(keys).toEqual(['library/1-a.mp4']);
    });

    it('dedupes repeated URLs', () => {
        const u = pub(LIBRARY_BUCKET, 'library/dup.mp4');
        expect(libraryKeys([u, u])).toEqual(['library/dup.mp4']);
    });

    it('returns nothing for an empty folder', () => {
        expect(libraryKeys([])).toEqual([]);
    });
});
