/**
 * The citation contract, enforced in code after the model call.
 *
 * A card survives only if:
 *   1. its type belongs to the section and it cites 1+ refs that exist in the digest,
 *   2. every number, date and clock time in its text appears in the sources it cites,
 *   3. measurement-flavoured words ("only", "exclusive", "viral", ...) appear in a cited source too.
 *
 * Pure: no DB, no network. Unit-tested in __tests__/validate.test.ts.
 */

import { CARD_TYPES, type Card, type Digest, type Drop, type RawCard } from './types';

export const MAX_CARDS_PER_SECTION: Record<string, number> = { world: 5, ours: 5, system: 2 };

const LIMITS = { title: 90, why: 160, details: 700, recommendation: 220 };

/** Window lengths the digest itself defines; always allowed ("last 7 days"). */
const GLOBAL_NUMBERS = [7, 14, 30, 24, 48, 72];

const DATE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/gi;
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/gi;
const NUM_RE = /(\d[\d,]*(?:\.\d+)?)\s?([kKmM](?![a-zA-Z]))?/g;
const HYPE_RE = /\b(only|exclusive(?:ly)?|first|viral|huge|massive|insane|record|explod\w*|skyrocket\w*)\b/gi;

// Built from char codes so no literal dash characters live in source.
const DASH_RE = new RegExp('[ ]*[' + String.fromCharCode(8212, 8211) + '][ ]*', 'g');
const ELLIPSIS = String.fromCharCode(8230);

/** Replace em/en dashes (house style: none in UI copy). */
export function stripDashes(s: string): string {
    return s.replace(DASH_RE, ', ');
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + ELLIPSIS : s);

function normDate(month: string, day: string): string {
    return `${month.slice(0, 3).toLowerCase()} ${Number(day)}`;
}

function normTime(h: string, m: string | undefined, ap: string): string {
    return `${Number(h)}:${m ?? '00'}${ap.toLowerCase()}`;
}

/** Dates in a text, normalized to "oct 8". */
export function extractDates(text: string): string[] {
    return [...text.matchAll(DATE_RE)].map((m) => normDate(m[1], m[2]));
}

export function extractTimes(text: string): string[] {
    return [...text.matchAll(TIME_RE)].map((m) => normTime(m[1], m[2], m[3]));
}

/** Numbers in a text, with dates and clock times removed first. */
export function extractNumbers(text: string): { value: number; approx: boolean }[] {
    const stripped = text.replace(DATE_RE, ' ').replace(TIME_RE, ' ');
    const out: { value: number; approx: boolean }[] = [];
    for (const m of stripped.matchAll(NUM_RE)) {
        const raw = Number(m[1].replace(/,/g, ''));
        if (!Number.isFinite(raw)) continue;
        const suf = m[2]?.toLowerCase();
        const value = suf === 'k' ? raw * 1_000 : suf === 'm' ? raw * 1_000_000 : raw;
        out.push({ value, approx: !!suf });
    }
    return out;
}

export function numberSupported(n: { value: number; approx: boolean }, allowed: number[]): boolean {
    const x = Math.abs(n.value);
    return allowed.some((raw) => {
        const v = Math.abs(raw);
        if (Math.abs(x - v) < 0.051) return true;
        if (Math.round(v) === x) return true;
        if (Math.round(v * 10) / 10 === x) return true;
        if (n.approx && v > 0 && Math.abs(x - v) / v <= 0.05) return true;
        return false;
    });
}

export function validateCards(section: Digest['section'], raw: RawCard[], digest: Digest): { cards: Card[]; drops: Drop[] } {
    const drops: Drop[] = [];
    const cards: Card[] = [];
    const allowedTypes = CARD_TYPES[section];
    const cap = MAX_CARDS_PER_SECTION[section] ?? 5;

    for (const r of Array.isArray(raw) ? raw : []) {
        const title = stripDashes(String(r?.title ?? '').trim());
        const drop = (reason: string) => drops.push({ section, title: title || '(untitled)', reason });

        if (!title || !String(r?.why ?? '').trim()) { drop('missing title or why'); continue; }
        if (!allowedTypes.includes(r.type)) { drop(`type "${r.type}" not allowed in ${section}`); continue; }

        const refs = [...new Set((Array.isArray(r.sources) ? r.sources : []).map(String))];
        if (refs.length === 0) { drop('no sources'); continue; }
        const unknown = refs.filter((ref) => !digest.refs[ref]);
        if (unknown.length) { drop(`unknown source ref(s): ${unknown.slice(0, 3).join(', ')}`); continue; }

        const why = stripDashes(String(r.why).trim());
        const details = stripDashes(String(r.details ?? '').trim());
        const recommendation = stripDashes(String(r.recommendation ?? '').trim());
        const body = [title, why, details, recommendation].join('\n');

        const cited = refs.map((ref) => digest.refs[ref]);
        const haystack = cited.map((s) => `${s.label}\n${s.text}`).join('\n');
        const hayLower = haystack.toLowerCase();

        // Dates and times must be quoted from a cited source, not inferred.
        const hayDates = new Set(extractDates(haystack));
        const badDate = extractDates(body).find((d) => !hayDates.has(d));
        if (badDate) { drop(`date "${badDate}" not in cited sources`); continue; }
        const hayTimes = new Set(extractTimes(haystack));
        const badTime = extractTimes(body).find((t) => !hayTimes.has(t));
        if (badTime) { drop(`time "${badTime}" not in cited sources`); continue; }

        const allowed = [
            ...GLOBAL_NUMBERS,
            ...cited.flatMap((s) => s.values),
            ...extractNumbers(haystack).map((n) => n.value),
            // Years inside cited dates ("ended Sep 13, 2022") may be named on their own.
            ...[...haystack.matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => Number(m[0])),
        ];
        const badNum = extractNumbers(body).find((n) => !numberSupported(n, allowed));
        if (badNum) { drop(`number ${badNum.value} not in cited sources`); continue; }

        const hype = [...body.matchAll(HYPE_RE)].map((m) => m[1].toLowerCase()).find((w) => !hayLower.includes(w));
        if (hype) { drop(`claim word "${hype}" not backed by a cited source`); continue; }

        // A recommendation must carry its action line; a "fact" that recommends
        // something is relabeled so the UI always marks advice as advice.
        const kind: Card['kind'] = recommendation ? 'recommendation' : 'fact';

        cards.push({
            section,
            type: r.type,
            kind,
            title: clip(title, LIMITS.title),
            why: clip(why, LIMITS.why),
            details: details ? clip(details, LIMITS.details) : null,
            recommendation: recommendation ? clip(recommendation, LIMITS.recommendation) : null,
            sources: refs.map((ref) => ({ ref, ...digest.refs[ref] })),
            anime: String(r.anime ?? '').trim() || null,
            confidence: ['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'low',
            rank: 0,
        });
    }

    const kept = cards.slice(0, cap).map((c, i) => ({ ...c, rank: i + 1 }));
    for (const c of cards.slice(cap)) drops.push({ section, title: c.title, reason: `over the ${cap}-card cap` });
    return { cards: kept, drops };
}
