import { createHash } from 'crypto';

/**
 * Generates a stable canonical identity for an event.
 * event_fingerprint = hash(anime_id + event_type + canonical_announcement_key + primary_signal_date_or_asset_id)
 */
export function generateEventFingerprint(params: {
    anime_id: string;
    event_type: string;
    canonical_announcement_key: string;
    primary_signal_date_or_asset_id: string;
}): string {
    const { anime_id, event_type, canonical_announcement_key, primary_signal_date_or_asset_id } = params;

    const normalizedAnimeId = String(anime_id).toLowerCase().trim();
    const normalizedEventType = String(event_type).toUpperCase().trim();
    const normalizedKey = String(canonical_announcement_key).toLowerCase().trim();
    const normalizedSignal = String(primary_signal_date_or_asset_id).toLowerCase().trim();

    const rawString = `${normalizedAnimeId}|${normalizedEventType}|${normalizedKey}|${normalizedSignal}`;

    return createHash('sha256').update(rawString).digest('hex');
}

/**
 * Generates a TRUTH-BASED fingerprint that ignores the specific source or URL.
 * truth_fingerprint = hash(anime_id + event_type + season_label)
 */
export function generateTruthFingerprint(params: {
    anime_id: string;
    event_type: string;
    season_label?: string;
}): string {
    const { anime_id, event_type, season_label } = params;

    const normalizedAnimeId = String(anime_id).toLowerCase().trim();
    const normalizedEventType = String(event_type).toUpperCase().trim();
    const normalizedSeason = String(season_label || '0').toLowerCase().trim();

    const rawString = `${normalizedAnimeId}|${normalizedEventType}|${normalizedSeason}`;

    return createHash('sha256').update(rawString).digest('hex');
}

/**
 * Title+host fingerprint used by the v2 dedup memory (`seen_fingerprints` rows).
 * Same shape as the detection worker's writer so admin-delete handlers and the
 * detection worker dedup against each other.
 */
export function createFingerprint(title: string, url: string): string {
    const normalized = title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().substring(0, 80);
    const domain = url.replace(/^https?:\/\//, '').split('/')[0] || '';
    let hash = 0;
    const input = normalized + '|' + domain;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash = hash & hash;
    }
    return `${normalized.replace(/\s/g, '_').substring(0, 40)}_${Math.abs(hash).toString(36)}`;
}
