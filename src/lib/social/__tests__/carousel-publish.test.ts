import { describe, it, expect, vi, beforeEach } from 'vitest';

// Env must exist before publisher.ts reads it at import time.
vi.hoisted(() => {
    process.env.AUTO_PUBLISH_SOCIALS = 'true';
    process.env.META_ACCESS_TOKEN = 'meta-token';
    process.env.META_IG_ID = 'ig-1';
    process.env.THREADS_ACCESS_TOKEN = 'threads-token';
    process.env.THREADS_USER_ID = 'th-1';
});

const calls: Array<{ url: string; body: string }> = [];
vi.mock('../../http', () => ({
    fetchWithTimeout: vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? String(init.body) : '';
        calls.push({ url: String(url), body });
        const u = String(url);
        let json: any = {};
        if (u.includes('/photos')) json = { id: `fbphoto${calls.length}` };
        else if (u.includes('/feed')) json = { id: 'PAGE_POST1' };
        else if (u.includes('threads_publish')) json = { id: 'THREAD_POST1' };
        else if (u.includes('graph.threads.net') && u.includes('fields=status')) json = { status: 'FINISHED' };
        else if (u.includes('graph.threads.net')) json = { id: `thitem${calls.length}` };
        else if (u.includes('media_publish')) json = { id: 'IG_MEDIA1' };
        else if (u.includes('status_code')) json = { status_code: 'FINISHED' };
        else if (u.includes('fields=permalink')) json = { permalink: 'https://instagram.com/p/x' };
        else if (u.includes('/media')) json = { id: `igc${calls.length}` };
        return { ok: true, json: async () => json } as any;
    }),
}));
vi.mock('../../logging/structured-logger', () => ({ logError: vi.fn(async () => {}), logAction: vi.fn(async () => {}) }));
vi.mock('../../supabase/admin', () => {
    const chain: any = {};
    for (const m of ['from', 'select', 'eq', 'update', 'insert', 'gte', 'not', 'is', 'delete', 'lt']) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: { social_ids: {} } });
    chain.then = (r: any) => Promise.resolve({ data: null, error: null }).then(r);
    return { supabaseAdmin: chain };
});
vi.mock('../tiktok-publisher', () => ({ enqueueTikTokPost: vi.fn(async () => ({ skipped: 'test' })) }));
vi.mock('../youtube-publisher', () => ({ publishToYouTubeShorts: vi.fn(async () => ({})) }));
vi.mock('../trailer-fetcher', () => ({ fetchYouTubeToBucket: vi.fn(async () => null) }));

import { publishToSocials } from '../publisher';

describe('carousel publish (FB multi-photo + Threads carousel)', () => {
    beforeEach(() => { calls.length = 0; vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 }); });

    it('sends every slide to IG, FB and Threads with per-platform captions', async () => {
        const slides = [1, 2, 3].map(i => ({ renderedUrl: `https://cdn.test/s${i}.jpg` }));
        const post: any = {
            id: 'p1', slug: 'test-carousel', title: 'Test', image: 'https://cdn.test/s1.jpg',
            caption_override: 'IG caption',
            image_settings: { slides, captions: { facebook: 'FB caption', threads: 'Threads caption' } },
        };
        const p = publishToSocials(post);
        await vi.runAllTimersAsync();
        const r = await p;

        // Facebook: 3 unpublished photos, then one feed post attaching all 3.
        const fbPhotos = calls.filter(c => c.url.includes('/photos'));
        expect(fbPhotos).toHaveLength(3);
        expect(fbPhotos.every(c => c.body.includes('published=false'))).toBe(true);
        const feed = calls.find(c => c.url.includes('/feed'))!;
        expect(decodeURIComponent(feed.body)).toContain('attached_media[2]');
        expect(new URLSearchParams(feed.body).get('message')).toBe('FB caption');

        // Threads: 3 image items, then a CAROUSEL parent with the threads text.
        const items = calls.filter(c => c.url.endsWith('/th-1/threads') && c.body.includes('is_carousel_item=true'));
        expect(items).toHaveLength(3);
        const parent = calls.find(c => c.body.includes('media_type=CAROUSEL') && c.url.includes('graph.threads.net'))!;
        expect(new URLSearchParams(parent.body).get('text')).toBe('Threads caption');
        expect(new URLSearchParams(parent.body).get('children')!.split(',')).toHaveLength(3);

        expect(r.facebook_id).toBe('PAGE_POST1');
        expect(r.threads_id).toBe('THREAD_POST1');
    });

    it('carousels-only mode skips non-carousel posts and still sends carousels', async () => {
        process.env.SOCIALS_CAROUSELS_ONLY = 'true';
        try {
            const reel: any = { id: 'p2', slug: 'trailer', title: 'Trailer', image: 'https://cdn.test/x.jpg', image_settings: {} };
            const r = await publishToSocials(reel);
            expect((r as any).skipped_reason).toBe('socials_paused');
            expect(calls.filter(c => c.url.includes('graph.'))).toHaveLength(0);

            const car: any = { id: 'p3', slug: 'car', title: 'Car', image: 'https://cdn.test/s1.jpg', caption_override: 'c',
                image_settings: { slides: [1, 2].map(i => ({ renderedUrl: `https://cdn.test/s${i}.jpg` })) } };
            const p = publishToSocials(car);
            await vi.runAllTimersAsync();
            const r2 = await p;
            expect(r2.facebook_id).toBe('PAGE_POST1');
        } finally {
            delete process.env.SOCIALS_CAROUSELS_ONLY;
        }
    });

    it('carousels-only mode lets operator-built reels through', async () => {
        process.env.SOCIALS_CAROUSELS_ONLY = 'true';
        try {
            const reel: any = { id: 'p4', slug: 'news30', title: 'News', image: 'https://cdn.test/c.jpg', caption_override: 'c',
                image_settings: { reel_source: 'kumolab-reels' }, social_ids: { staged_video_url: 'https://cdn.test/r.mp4' } };
            const p = publishToSocials(reel);
            await vi.runAllTimersAsync();
            const r = await p;
            expect((r as any).skipped_reason).toBeUndefined();
            expect(r.staged_video_url).toBe('https://cdn.test/r.mp4');
            // A reel without the staged MP4 is still held back.
            const bare: any = { id: 'p5', slug: 'x', title: 'X', image: 'https://cdn.test/c.jpg', image_settings: { reel_source: 'kumolab-reels' } };
            expect(((await publishToSocials(bare)) as any).skipped_reason).toBe('socials_paused');
        } finally {
            delete process.env.SOCIALS_CAROUSELS_ONLY;
        }
    });
});
