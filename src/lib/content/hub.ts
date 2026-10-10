import { supabaseAdmin } from '@/lib/supabase/admin';
import { loadPeakHours, toScheduleRow, type ScheduleRow, type SchedulePlatform } from '@/lib/schedule';

/*
 * Data for the merged Content tab (Content + Studio in one place).
 *
 * Every post lands in exactly one of four lists, by status:
 *   posted  published, newest first (placed at published_at)
 *   next    approved + scheduled, soonest first (placed at its slot)
 *   review  pending, newest first (placed at when it was found)
 *   drafts  draft, most recently edited first (placed at its last edit)
 */

export type ContentView = 'posted' | 'next' | 'review' | 'drafts';

export interface ContentRow extends ScheduleRow {
    view: ContentView;
    /** Went out to at least one social (IG/FB/Threads/X), not just the website. */
    social: boolean;
    /** Live links per platform, when the publisher saved them. */
    links: Partial<Record<'instagram' | 'facebook' | 'threads' | 'x', string>>;
    source: string | null;
    editedBy: string | null;
}

export interface ContentHubData {
    posted: ContentRow[];
    next: ContentRow[];
    review: ContentRow[];
    drafts: ContentRow[];
    error: string | null;
}

// image_settings is selected by path: video_project can be megabytes.
const COLUMNS = [
    'id, title, slug, status, claim_type, source, scheduled_post_time, published_at, timestamp, image, excerpt, caption_override',
    'slides:image_settings->slides, captions:image_settings->captions',
    'reel_source:image_settings->>reel_source, edited_at:image_settings->>studio_edited_at, edited_by:image_settings->>edited_by',
    'social_ids, youtube_video_id, youtube_url',
].join(', ');

const isHttp = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);

function toRow(p: any, view: ContentView, peak: Set<number>, now: number): ContentRow {
    const when =
        view === 'posted' ? p.published_at || p.scheduled_post_time || p.timestamp
        : view === 'next' ? p.scheduled_post_time
        : view === 'drafts' ? p.edited_at || p.timestamp
        : p.timestamp;
    const base = toScheduleRow(p, peak, now, when || new Date(now).toISOString());
    const sid = p.social_ids || {};
    const links: ContentRow['links'] = {};
    if (isHttp(sid.instagram_url)) links.instagram = sid.instagram_url;
    if (isHttp(sid.facebook_url)) links.facebook = sid.facebook_url;
    if (isHttp(sid.threads_url)) links.threads = sid.threads_url;
    if (isHttp(sid.x_url)) links.x = sid.x_url;
    const social = Object.keys(links).length > 0 || !!(sid.instagram_id || sid.facebook_id || sid.threads_id);
    // Posted rows show where they actually went, not where they were expected to go.
    const platforms: SchedulePlatform[] = view === 'posted'
        ? [...(['instagram', 'facebook', 'threads'] as const).filter((k) => links[k] || sid[`${k}_id`]), 'website']
        : base.platforms;
    return { ...base, platforms, view, social, links, source: p.source ?? null, editedBy: p.edited_by ?? null };
}

export async function getContentHub(): Promise<ContentHubData> {
    const now = Date.now();
    const soon = new Date(now - 3600_000).toISOString();
    const [peak, posted, next, review, drafts] = await Promise.all([
        loadPeakHours(),
        supabaseAdmin.from('posts').select(COLUMNS).eq('status', 'published').order('published_at', { ascending: false, nullsFirst: false }).limit(300),
        supabaseAdmin.from('posts').select(COLUMNS).eq('status', 'approved').not('scheduled_post_time', 'is', null).gte('scheduled_post_time', soon).order('scheduled_post_time', { ascending: true }).limit(150),
        supabaseAdmin.from('posts').select(COLUMNS).eq('status', 'pending').order('timestamp', { ascending: false }).limit(150),
        supabaseAdmin.from('posts').select(COLUMNS).eq('status', 'draft').order('timestamp', { ascending: false }).limit(100),
    ]);
    const error = posted.error?.message || next.error?.message || review.error?.message || drafts.error?.message || null;
    const map = (rows: any[] | null, view: ContentView) => (rows || []).map((p) => toRow(p, view, peak, now));
    const draftRows = map(drafts.data, 'drafts').sort((a, b) => b.scheduledPostTime.localeCompare(a.scheduledPostTime));
    return {
        posted: map(posted.data, 'posted'),
        next: map(next.data, 'next'),
        review: map(review.data, 'review'),
        drafts: draftRows,
        error,
    };
}
