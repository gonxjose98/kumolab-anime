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
    return (r.chips || [])
        .filter((c) => !/^(Premieres|Episode \d+ airs|Starts )/.test(c))
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
