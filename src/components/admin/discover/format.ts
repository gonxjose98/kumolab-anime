import type { RadarRow } from '@/lib/discover/queries';

const TZ = 'America/New_York';

export function radarTitle(r: Pick<RadarRow, 'title_english' | 'title_romaji'>): string {
    return r.title_english || r.title_romaji || 'Untitled';
}

/** "Oct 20" in ET, from next airing or the start date. */
export function radarDate(r: RadarRow): { day: string; rel: string } {
    const iso = r.next_airing_at || (r.start_date ? `${r.start_date}T12:00:00Z` : null);
    if (!iso) return { day: 'TBA', rel: '' };
    const d = new Date(iso);
    const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
    const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
    const rel = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days}d`;
    return { day, rel };
}

/** The row's one facts line: chips minus the date chip (the date has its own column). */
export function radarFacts(r: RadarRow, max = 2): string {
    // Row line: members first (short), then the next most telling fact. The
    // full wording with its source lives in the expanded chips.
    const chips = (r.chips || []).filter((c) => !/^(Premieres|Episode \d+ airs|Starts )/.test(c));
    const members = chips.find((c) => c.includes('members on AniList'));
    const rest = chips.filter((c) => c !== members);
    return [members, ...rest]
        .filter(Boolean)
        .map((c) => c!.replace(' upcoming on AniList', '').replace(' on AniList', ''))
        .slice(0, max)
        .join(' · ');
}

export function timeAgo(iso: string | null | undefined): string {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function domainOf(url: string | null): string | null {
    if (!url) return null;
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

export const KIND_LABEL: Record<string, string> = {
    news: 'News', streaming: 'Streaming', release: 'Release', youtube: 'YouTube', trending: 'Trending',
};

// ─── Dashboard / Wire visuals ────────────────────────────────

/** The headline Jose reads: the plain rewrite, else the original. */
export function wireHeadline(w: { plain_title?: string | null; title: string }): string {
    return w.plain_title || w.title;
}

/** Image candidates in order: item art, then the matched show's radar art. */
export function wireImages(w: { image: string | null; radar_banner?: string | null; radar_cover?: string | null }, hero = false): string[] {
    const list = hero ? [w.radar_banner, w.image, w.radar_cover] : [w.image, w.radar_cover, w.radar_banner];
    return list.filter((x): x is string => !!x && /^https?:\/\//i.test(x));
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'on', 'for', 'new', 'with', 'is', 'at', 'by']);

/** Two-letter tile text from a show name or headline. */
export function initialsOf(label: string): string {
    const words = label.replace(/['"‘’“”]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const sig = words.filter((w) => !STOP.has(w.toLowerCase()));
    const pick = (sig.length ? sig : words).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
    return pick || '?';
}

const TILE_COLORS = ['#5468a8', '#7a5aa8', '#4a8a7a', '#a8645a', '#3f7fb5', '#8a7a3a'];

export function tileColor(label: string): string {
    let h = 0;
    for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
    return TILE_COLORS[h % TILE_COLORS.length];
}

/** Short source name for small spaces. */
export function shortSource(name: string | null, url: string | null): string {
    const n = (name || domainOf(url) || '').replace(/^YouTube_/, '');
    if (/^anime ?news ?network$/i.test(n)) return 'ANN';
    return n;
}

/** Compact age: "12m", "3h", "2d". */
export function ageShort(iso: string | null | undefined): string {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 3_600_000) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
    return `${Math.floor(ms / 86_400_000)}d`;
}

const etKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

/** ET calendar-day difference from today (0 = today, 1 = tomorrow, -1 = yesterday). */
export function etDayDiff(iso: string, now = new Date()): number {
    const a = Date.parse(`${etKey(new Date(iso))}T00:00:00Z`);
    const b = Date.parse(`${etKey(now)}T00:00:00Z`);
    return Math.round((a - b) / 86_400_000);
}

/** "Today" / "Tomorrow" / "N days" countdown for a radar row. */
export function countdown(r: RadarRow): { label: string; hot: boolean } {
    const iso = r.next_airing_at || (r.start_date ? `${r.start_date}T12:00:00Z` : null);
    if (!iso) return { label: 'TBA', hot: false };
    const d = etDayDiff(iso);
    if (d <= 0) return { label: 'Today', hot: true };
    if (d === 1) return { label: 'Tomorrow', hot: true };
    return { label: `${d} days`, hot: false };
}

/** Wire grouping label by ET day. */
export function wireDayGroup(iso: string | null | undefined): 'Today' | 'Yesterday' | 'Earlier' {
    if (!iso) return 'Earlier';
    const d = etDayDiff(iso);
    return d >= 0 ? 'Today' : d === -1 ? 'Yesterday' : 'Earlier';
}

export const KIND_CHIP: Record<string, string> = {
    news: 'ak-home-chip--news', streaming: 'ak-home-chip--stream', release: 'ak-home-chip--rel', youtube: 'ak-home-chip--yt', trending: 'ak-home-chip--trend',
};
