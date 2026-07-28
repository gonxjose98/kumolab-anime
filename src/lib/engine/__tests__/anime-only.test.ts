import { describe, it, expect } from 'vitest';
import { scorePost, GATES } from '@/lib/engine/scoring';
import {
    matchOffTopic,
    OFF_TOPIC_KEYWORDS,
    CONTENT_RULES,
} from '@/lib/engine/sources-config';

// KumoLab posts anime. Not live action, not reviews, not games (Jose
// 2026-07-28). These lock in both halves of the rule: off-topic candidates are
// rejected, and — just as important — real anime news is NOT.

const NOW = new Date('2026-07-28T18:00:00Z');
const fresh = new Date(NOW.getTime() - 3_600_000).toISOString();

describe('matchOffTopic — blocks live action', () => {
    it.each([
        'One Piece Live Action Season 2 Trailer',
        'Netflix reveals live-action Cowboy Bebop',
        'Bleach stage play announced',
        'A new TV drama adaptation is coming',
    ])('rejects %s', (title) => {
        expect(matchOffTopic(title)).not.toBeNull();
    });
});

describe('matchOffTopic — blocks games and game teasers', () => {
    it.each([
        'Demon Slayer video game announcement',
        'New Jujutsu Kaisen game trailer drops',
        'Honkai Star Rail gameplay reveal',
        'Blue Archive mobile game update',
        'Coming to Nintendo Switch this fall',
        'PlayStation exclusive announced',
        'Pre-registration is now open',
        'Closed beta test begins next week',
    ])('rejects %s', (title) => {
        expect(matchOffTopic(title)).not.toBeNull();
    });

    it('matches against the description too', () => {
        expect(matchOffTopic('Some anime news', 'The mobile game launches in June')).not.toBeNull();
    });

    // Known, accepted gap: "gacha" on its own is NOT a blocklist term, because
    // "Gacha Girls Corps" is a real anime. A gacha post that names no platform
    // and no game vocabulary gets through to review rather than being killed —
    // the deliberate trade to avoid dropping legitimate anime.
    it('lets a bare gacha mention reach review (documents the trade-off)', () => {
        expect(matchOffTopic('Some title with a gacha banner')).toBeNull();
    });
});

describe('regression: titles that actually leaked through and PUBLISHED', () => {
    // Pulled from the posts table 2026-07-28 (status='published'). Every one of
    // these is content Jose has been declining or would never post. They are the
    // reason the blocklists exist — lock them shut.
    it.each([
        // Games
        "'Xenoblade Chronicles 2' Switch 2 Edition Trailer Reveals Xenosaga's Momo • Launches July 30",
        "'Final Fantasy Resonance' New Trailer Released • Pre-Orders Open for Switch, Switch 2",
        "'Tekken 8' Bob Early Access August 19, Full Release August 24 • New Gameplay Trailer Released",
        "'Guilty Gear -Strive-' Robo-Ky DLC Character Official Trailer Released • Launches July 2",
        "'Monster Hunter Stories 3' Game Reveals 'Side Story: Rudy' DLC Trailer • Out Today",
        "'Legend of Heroes: Trails from Zero & Trails to Azure' Games Trailer Reveals September 10 Release for Switch 2, PS5",
        "Koei Tecmo Announces New 'Atelier Kalia' Game • Premieres Early 2027 for Switch 2, PS5, Xbox X|S, PC",
        "'Xenoblade Genesis' Game Announced • Switch 2 Editions for 3 'Xenoblade Chronicles' Titles Launch 2027",
        "'Kingdom Hearts IV' Switch 2 Release Trailer Announced • Collection Launches October 8",
        "'Kemuri' 1st Gameplay Trailer Released • Launches on PS5 in 2027",
        "'Bananya Buddies' Mobile Pre-Registration Teaser Released on Crunchyroll Game Vault",
        // Live action
        "'Live-Action Wandance' Film Reveals Anji Ikehata as Wanda in Teaser • Opens November 27",
        "'Look Back' Live-Action Film Trailer Released • More Cast Revealed, Premieres September 11",
        "'In the Clear Moonlit Dusk' Live-Action Film Trailer Reveals Theme Song • Naniwa Danshi Performs \"Moonlit\"",
        "'High School Family: Kokosei Kazoku' Live-Action Film Teaser Confirms January 8 Delay",
        "'Golden Kamuy' Live-Action Film 2 Streams July 13 on Netflix",
        "'Blue Lock' Live-Action Film 2nd Trailer Reveals Ado's Theme Song \"Monstruo\"",
    ])('now blocks %s', (title) => {
        expect(matchOffTopic(title)).not.toBeNull();
    });
});

describe('matchOffTopic — does NOT eat real anime news', () => {
    // Each of these is a substring trap: the naive keyword ('game', 'steam',
    // 'rpg') would kill a legitimate anime, which is why those bare forms are
    // deliberately absent from the lists.
    it.each([
        'No Game No Life Season 2 confirmed',
        'Steamboy 4K remaster trailer',
        'RPG Real Estate key visual revealed',
        'Frieren Season 2 premiere date announced',
        'Chainsaw Man movie trailer released',
        'Attack on Titan final season PV',
        'Sunset on the 15th: new anime announced',
        // Real published anime posts that sit one word away from a blocklist
        // entry — these are why 'gacha' and bare 'switch' are not on the lists.
        "'Gacha Girls Corps' New Anime Official Trailer Released • Premieres on Crunchyroll",
        "'Cyborg 009: Nemesis' Main Trailer Premieres July 19 • Features Ending Theme by Sukima Switch",
        "'Free Fire Daybreak' Anime Key Visual Unveiled • Premieres Spring 2027",
        'The Elusive Samurai Season 2 | Official Trailer',
        "'Star Detective Precure!' Film Main Trailer Released • Ending Song \"FIRST PRISM\" Revealed",
    ])('keeps %s', (title) => {
        expect(matchOffTopic(title)).toBeNull();
    });

    it('returns null for empty input', () => {
        expect(matchOffTopic(null)).toBeNull();
        expect(matchOffTopic('', '')).toBeNull();
    });
});

describe('off-topic keywords are substring-safe', () => {
    // Several enforcement points use bare `includes` rather than a word-boundary
    // regex, so a one-word entry would match inside longer words. Guard the
    // invariant that every entry is either multi-word or a distinctive token.
    const SAFE_SINGLE_WORDS = new Set([
        'liveaction', 'gameplay', 'gacha', 'nintendo', 'playstation',
        'xbox', 'dlc', 'preregistration', 'videogame', 'ps5', 'ps4',
    ]);

    it('every single-word entry is on the vetted list', () => {
        const singles = OFF_TOPIC_KEYWORDS.filter((k) => !/[\s-]/.test(k));
        for (const k of singles) {
            expect(SAFE_SINGLE_WORDS.has(k), `"${k}" is a bare word — verify it can't match inside a real anime title`).toBe(true);
        }
    });

    it('feeds the shared NEGATIVE_KEYWORDS list every checkpoint reads', () => {
        for (const k of OFF_TOPIC_KEYWORDS) {
            expect(CONTENT_RULES.NEGATIVE_KEYWORDS).toContain(k);
        }
    });
});

describe('scorePost — anime_only hard gate', () => {
    const perfect = {
        tier: 1 as const, tierMatchedBy: 'anime' as const, claimType: 'TRAILER_DROP',
        format: 'real_video' as const, detectedAt: fresh, now: NOW,
    };

    it('rejects an otherwise-perfect post when it is off topic', () => {
        const s = scorePost({ ...perfect, offTopicMatch: 'live action' });
        expect(s.verdict).toBe('REJECT');
        expect(s.hard_gates.find((g) => g.gate === GATES.ANIME_ONLY)?.passed).toBe(false);
    });

    it('passes the gate for real anime news', () => {
        const s = scorePost({ ...perfect, offTopicMatch: null });
        expect(s.hard_gates.find((g) => g.gate === GATES.ANIME_ONLY)?.passed).toBe(true);
        expect(s.verdict).toBe('AUTO_PUBLISH');
    });

    it('defaults to passing when the caller supplies nothing', () => {
        const s = scorePost(perfect);
        expect(s.hard_gates.find((g) => g.gate === GATES.ANIME_ONLY)?.passed).toBe(true);
    });
});
