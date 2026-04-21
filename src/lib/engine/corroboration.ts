/**
 * corroboration.ts
 *
 * Multi-source corroboration for non-video claims. Before auto-publishing a
 * non-video claim (new season, delay, date, staff/cast), we require at least N
 * distinct T1/T2 sources reporting the same claim within a window.
 *
 * Checks both:
 *   - live posts (source_tier 1/2, published within window)
 *   - seen_fingerprints (catches claims recorded from sources that already cycled out)
 *
 * Returns {ok, sourceCount, sources[]}.
 */

import { supabaseAdmin } from '../supabase/admin';
import { AUTOMATION } from './automation-config';

export interface CorroborationResult {
    ok: boolean;
    sourceCount: number;
    sources: string[];
    windowHours: number;
    reason?: string;
}

export async function hasCorroboration(params: {
    anime_id?: string | number | null;
    claim_type?: string | null;
    currentSource?: string;
    windowHours?: number;
    minSources?: number;
}): Promise<CorroborationResult> {
    const windowHours = params.windowHours ?? AUTOMATION.CORROBORATION_WINDOW_HOURS;
    const minSources = params.minSources ?? AUTOMATION.CORROBORATION_MIN_SOURCES;

    if (!params.anime_id || !params.claim_type) {
        return {
            ok: false,
            sourceCount: 0,
            sources: [],
            windowHours,
            reason: 'missing anime_id or claim_type',
        };
    }

    const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
    const sources = new Set<string>();
    if (params.currentSource) sources.add(params.currentSource);

    // 1) Live posts: recent posts with matching anime+claim from T1/T2 sources.
    const { data: posts } = await supabaseAdmin
        .from('posts')
        .select('source, source_tier')
        .eq('anime_id', params.anime_id as any)
        .eq('claim_type', params.claim_type)
        .gte('timestamp', since)
        .in('source_tier', [1, 2]);

    for (const p of posts || []) {
        if (p.source) sources.add(p.source);
    }

    // 2) Fingerprint memory: covers claims that already expired or were declined but once existed.
    //    We don't store source_tier on seen_fingerprints; treat seen as a weaker signal (origin='processed'|'published' only).
    const { data: fps } = await supabaseAdmin
        .from('seen_fingerprints')
        .select('source_url, origin')
        .eq('anime_id', params.anime_id as any)
        .eq('claim_type', params.claim_type)
        .gte('seen_at', since);

    for (const fp of fps || []) {
        if (fp.origin !== 'declined' && fp.source_url) {
            // Use the URL host as a proxy for source identity when we don't have the source_name.
            try {
                const host = new URL(fp.source_url).host;
                if (host) sources.add(host);
            } catch { /* ignore bad urls */ }
        }
    }

    const sourceList = Array.from(sources);
    return {
        ok: sourceList.length >= minSources,
        sourceCount: sourceList.length,
        sources: sourceList,
        windowHours,
    };
}
