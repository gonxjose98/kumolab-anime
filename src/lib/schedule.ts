import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPeakSlots } from '@/lib/engine/engine-config';

/*
 * Posting schedule + peak-hour helpers.
 *
 * The engine slots posts to the top of an ET hour inside a 7am–11pm ET window,
 * preferring PREMIUM ("peak") hours for priority content — anime-audience peak:
 * noon (lunch) + 5–10pm ET (after-school + evening). Peak status is DERIVED from
 * the scheduled time's ET hour; there is no separate flag. Kept in one place so
 * the Content > Schedule view and the Dashboard lineup agree. Mirrors
 * PREMIUM_HOURS_ET in src/lib/engine/scheduler.ts.
 */

export const PREMIUM_HOURS_ET = new Set([12, 17, 18, 19, 20, 21, 22]);

const ET = 'America/New_York';

/** The ET hour (0–23) for an ISO timestamp. */
export function etHour(iso: string): number {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
    return Number(s) % 24;
}

/** A friendly ET slot label, e.g. "6:00 PM". */
export function etSlotLabel(iso: string): string {
    return new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

/** Short ET day label, e.g. "Today", "Tomorrow", or "Wed Jul 9". */
export function etDayLabel(iso: string): string {
    const d = new Date(iso);
    const day = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric' }).format(d);
    const today = new Intl.DateTimeFormat('en-US', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const that = new Intl.DateTimeFormat('en-US', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const tomorrow = new Intl.DateTimeFormat('en-US', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86400000));
    if (that === today) return 'Today';
    if (that === tomorrow) return 'Tomorrow';
    return day;
}

export function isPeakSlot(iso: string | null | undefined): boolean {
    if (!iso) return false;
    return PREMIUM_HOURS_ET.has(etHour(iso));
}

/** ET calendar day key (YYYY-MM-DD) for an ISO timestamp, for day grouping. */
export function etDayKey(iso: string | number | Date): string {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export type ScheduleKind = 'carousel' | 'video' | 'image';
export type SchedulePlatform = 'instagram' | 'facebook' | 'threads' | 'website';

export interface ScheduleRow {
    id: string;
    title: string;
    slug: string;
    status: string | null;
    claim: string | null;
    scheduledPostTime: string;
    slotLabel: string;   // "6:00 PM"
    dayLabel: string;    // "Today" / "Tomorrow" / "Wed Jul 9"
    isPeak: boolean;
    isFuture: boolean;
    dayKey: string;      // ET "YYYY-MM-DD"
    kind: ScheduleKind;
    /** Slide image URLs in order (carousels: baked renders; others: [cover]). */
    slides: string[];
    /** Card thumbnail (carousel cover slide, else post.image). */
    cover: string | null;
    /** IG caption (caption_override), falling back to the website excerpt. */
    caption: string | null;
    captionIsExcerpt: boolean;
    fbCaption: string | null;
    threadsCaption: string | null;
    youtubeUrl: string | null;
    /** Pre-staged MP4 (operator-built reels): played inline in the preview. */
    videoUrl: string | null;
    /** Where this post is expected to go when it fires (derived, best effort). */
    platforms: SchedulePlatform[];
}

const isHttp = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);

/** Mirrors the publisher's carousel test (2+ slides with a usable URL). */
function slideUrls(imageSettings: any): string[] {
    const slides = Array.isArray(imageSettings?.slides) ? imageSettings.slides : [];
    return slides
        .map((sl: any) => (isHttp(sl?.renderedUrl) ? sl.renderedUrl : isHttp(sl?.sourceUrl) ? sl.sourceUrl : ''))
        .filter(Boolean);
}

function derivePlatforms(kind: ScheduleKind, claim: string | null, isReel = false): SchedulePlatform[] {
    if (kind === 'carousel' || isReel) return ['instagram', 'facebook', 'threads', 'website'];
    // Non-carousel posts: socials paused while SOCIALS_CAROUSELS_ONLY=true.
    if (process.env.SOCIALS_CAROUSELS_ONLY === 'true') return ['website'];
    // Legacy routing: key visuals are Facebook-only, the rest are IG reels.
    if ((claim || '').toUpperCase() === 'NEW_KEY_VISUAL') return ['facebook', 'website'];
    return kind === 'video' ? ['instagram', 'facebook', 'threads', 'website'] : ['facebook', 'website'];
}

/**
 * Posts slotted in a window around now (default: last 24h → next 48h), ordered by
 * slot time, each flagged for peak vs off-peak. Used for the Schedule view and the
 * dashboard's "today's lineup".
 */
export async function getScheduleRows(opts?: { pastHours?: number; futureHours?: number; limit?: number }): Promise<ScheduleRow[]> {
    const pastHours = opts?.pastHours ?? 24;
    const futureHours = opts?.futureHours ?? 48;
    const since = new Date(Date.now() - pastHours * 3600_000).toISOString();
    const until = new Date(Date.now() + futureHours * 3600_000).toISOString();
    try {
        // Derive "peak" from the LIVE peak-slot config (7:30/13:00/21:30 ET by
        // default), not the retired hourly-grid PREMIUM_HOURS_ET — otherwise the
        // real slots render as "off-peak" in the schedule view.
        const peakHours = new Set<number>();
        try {
            for (const s of await getPeakSlots()) {
                const h = parseInt((s.time || '').slice(0, 2), 10);
                if (Number.isFinite(h)) peakHours.add(h);
            }
        } catch { /* fall back to isPeakSlot below */ }

        const { data } = await supabaseAdmin
            .from('posts')
            .select('id, title, slug, status, claim_type, scheduled_post_time, image, excerpt, caption_override, image_settings, social_ids, youtube_video_id, youtube_url')
            .not('scheduled_post_time', 'is', null)
            .gte('scheduled_post_time', since)
            .lte('scheduled_post_time', until)
            .order('scheduled_post_time', { ascending: true })
            .limit(opts?.limit ?? 200);
        const now = Date.now();
        return (data || []).map((p: any) => {
            const is = p.image_settings || {};
            const urls = slideUrls(is);
            const videoUrl = isHttp(p.social_ids?.staged_video_url) ? p.social_ids.staged_video_url : null;
            // Mirrors the publisher's operator-reel exception (posts even in carousels-only mode).
            const isReel = is.reel_source === 'kumolab-reels' && !!videoUrl;
            const kind: ScheduleKind = urls.length >= 2 ? 'carousel' : (p.youtube_video_id || videoUrl) ? 'video' : 'image';
            const cover = kind === 'carousel' ? urls[0] : isHttp(p.image) ? p.image : null;
            const ig = typeof p.caption_override === 'string' && p.caption_override.trim() ? p.caption_override.trim() : null;
            const excerpt = typeof p.excerpt === 'string' && p.excerpt.trim() ? p.excerpt.trim() : null;
            const cap = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
            return {
            id: p.id,
            title: p.title,
            slug: p.slug,
            status: p.status ?? null,
            claim: p.claim_type ?? null,
            scheduledPostTime: p.scheduled_post_time,
            slotLabel: etSlotLabel(p.scheduled_post_time),
            dayLabel: etDayLabel(p.scheduled_post_time),
            isPeak: peakHours.size ? peakHours.has(etHour(p.scheduled_post_time)) : isPeakSlot(p.scheduled_post_time),
            isFuture: new Date(p.scheduled_post_time).getTime() > now,
            dayKey: etDayKey(p.scheduled_post_time),
            kind,
            slides: kind === 'carousel' ? urls : cover ? [cover] : [],
            cover,
            caption: ig ?? excerpt,
            captionIsExcerpt: !ig && !!excerpt,
            fbCaption: cap(is.captions?.facebook),
            threadsCaption: cap(is.captions?.threads),
            youtubeUrl: isHttp(p.youtube_url) ? p.youtube_url : p.youtube_video_id ? `https://www.youtube.com/watch?v=${p.youtube_video_id}` : null,
            videoUrl,
            platforms: derivePlatforms(kind, p.claim_type ?? null, isReel),
            };
        });
    } catch {
        return [];
    }
}
