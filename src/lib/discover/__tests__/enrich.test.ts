import { describe, it, expect } from 'vitest';
import { parseOgImages, matchRadar, cleanModelItems, radarFacts, type RadarLite } from '../enrich';
import { alertsFromSnapshot, tokenAlertText } from '../../dashboard/alerts';
import { initialsOf, wireImages, wireHeadline, shortSource } from '../../../components/admin/discover/format';

const radar = (over: Partial<RadarLite>): RadarLite => ({
    anilist_id: 1, title_english: null, title_romaji: null, popularity: null, streaming: [], anticipation_rank: null,
    next_episode: null, next_airing_at: null, start_date: null, season_label: null, status: null, ...over,
});

describe('parseOgImages', () => {
    it('reads og:image and twitter:image in either attribute order, best first, absolute', () => {
        const html = `<head>
            <meta name="twitter:image" content="https://x.test/tw.jpg" />
            <meta content="/img/og.png" property="og:image">
            <meta property="og:image:width" content="1920" />
        </head>`;
        expect(parseOgImages(html, 'https://site.test/a/b')).toEqual(['https://site.test/img/og.png', 'https://x.test/tw.jpg']);
    });
    it('decodes entities and ignores junk', () => {
        expect(parseOgImages('<meta property="og:image" content="https://a.test/i.jpg?a=1&amp;b=2">', 'https://a.test')).toEqual(['https://a.test/i.jpg?a=1&b=2']);
        expect(parseOgImages('<meta property="og:title" content="x">', 'https://a.test')).toEqual([]);
    });
});

describe('matchRadar', () => {
    const rows = [
        radar({ anilist_id: 10, title_english: 'Black Clover', popularity: 500_000 }),
        radar({ anilist_id: 11, title_english: 'Black Clover Season 2', popularity: 80_000 }),
        radar({ anilist_id: 12, title_romaji: 'Kusuriya no Hitorigoto' }),
    ];
    it('exact beats contains, longest contained title wins', () => {
        expect(matchRadar('Black Clover', rows)?.anilist_id).toBe(10);
        expect(matchRadar('Black Clover Season 2 trailer drops', rows)?.anilist_id).toBe(11);
        expect(matchRadar('kusuriya no hitorigoto', rows)?.anilist_id).toBe(12);
    });
    it('returns null for no match or empty input', () => {
        expect(matchRadar('Street Fighter cabinet', rows)).toBeNull();
        expect(matchRadar(null, rows)).toBeNull();
    });
});

describe('cleanModelItems', () => {
    it('keeps only asked ids once, clamps importance, strips em dashes', () => {
        const em = String.fromCharCode(8212);
        const out = cleanModelItems({ items: [
            { id: 1, plain_title: `New show ${em} hits Netflix`, is_anime: true, anime_title: 'X', importance: 9 },
            { id: 1, plain_title: 'dup', is_anime: true, anime_title: null, importance: 1 },
            { id: 99, plain_title: 'not asked', is_anime: true, anime_title: null, importance: 3 },
            { id: 2, plain_title: '', is_anime: false, anime_title: null, importance: 2 },
            { id: 3, plain_title: 'Arcade cabinet', is_anime: false, anime_title: '  ', importance: 0 },
        ] }, new Set([1, 2, 3]));
        expect(out).toEqual([
            { id: 1, plain_title: 'New show, hits Netflix', is_anime: true, anime_title: 'X', importance: 5 },
            { id: 3, plain_title: 'Arcade cabinet', is_anime: false, anime_title: null, importance: 1 },
        ]);
    });
    it('survives garbage', () => {
        expect(cleanModelItems(null, new Set([1]))).toEqual([]);
        expect(cleanModelItems({ items: 'x' }, new Set([1]))).toEqual([]);
    });
});

describe('radarFacts', () => {
    it('lists only facts present', () => {
        const f = radarFacts(radar({ popularity: 84_000, anticipation_rank: 1, streaming: [{ name: 'Netflix' }], season_label: 'Season 2' }));
        expect(f).toEqual(['84K AniList members', '#1 most anticipated upcoming show on AniList', 'Season 2', 'Streams on Netflix']);
        expect(radarFacts(null)).toEqual([]);
    });
});

describe('token alerts from the stored snapshot', () => {
    const snap = [
        { key: 'meta', level: 'warn', daysLeft: 20, window: 30, detail: 'data access ends Oct 29' },
        { key: 'threads', level: 'ok', daysLeft: 57, window: null, detail: 'fine' },
        { key: 'vercel', level: 'crit', daysLeft: null, window: 0, detail: 'HTTP 403' },
    ];
    it('surfaces windowed + broken tokens only', () => {
        const a = alertsFromSnapshot(snap);
        expect(a.map((x) => x.key)).toEqual(['vercel', 'meta']);
        expect(a[1].text).toBe('Meta token expires in 20 days');
        expect(a[0]).toMatchObject({ text: 'Vercel token needs attention', level: 'crit' });
        expect(alertsFromSnapshot(null)).toEqual([]);
    });
    it('words expiry', () => {
        expect(tokenAlertText({ key: 'threads', level: 'crit', daysLeft: 1, window: 1, detail: '' })).toBe('Threads token expires in 1 day');
        expect(tokenAlertText({ key: 'threads', level: 'crit', daysLeft: 0, window: 0, detail: '' })).toBe('Threads token has expired');
    });
});

describe('wire visuals', () => {
    it('falls back headline + images in order', () => {
        expect(wireHeadline({ plain_title: null, title: 'Orig' })).toBe('Orig');
        expect(wireHeadline({ plain_title: 'Plain', title: 'Orig' })).toBe('Plain');
        const w = { image: null, radar_cover: 'https://c/1.jpg', radar_banner: 'https://b/1.jpg' };
        expect(wireImages(w)).toEqual(['https://c/1.jpg', 'https://b/1.jpg']);
        expect(wireImages(w, true)).toEqual(['https://b/1.jpg', 'https://c/1.jpg']);
    });
    it('initials + short source', () => {
        expect(initialsOf("Everyone's Darling Has a Secret")).toBe('ED');
        expect(initialsOf('The Skull Dragon')).toBe('SD');
        expect(shortSource('AnimeNewsNetwork', null)).toBe('ANN');
        expect(shortSource('YouTube_Crunchyroll', null)).toBe('Crunchyroll');
    });
});
