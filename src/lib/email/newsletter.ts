import { supabaseAdmin } from '@/lib/supabase/admin';
import {
    getEmailCopy,
    renderForecast,
    forecastSectionHtml,
    forecastSectionText,
} from '@/lib/email/templates';

/**
 * The Forecast (B5): the weekly newsletter the homepage promises.
 * "One calm email. The week's confirmed drops, dates, and trailers."
 *
 * composeForecast() builds the email from the last 7 days of published
 * confirmed-news posts (trailers, dates, key visuals, new seasons) and
 * returns { subject, html, text, itemCount }. It does NOT send anything:
 * the cron worker decides whether to broadcast (sendBroadcast already
 * appends the per-recipient unsubscribe link + List-Unsubscribe header,
 * so this template must not hardcode one).
 *
 * The framing copy (subject, intro, sign-off, footer) is admin-editable on
 * /admin/email via getEmailCopy('forecast'); the per-post sections stay
 * auto-generated. Layout lives in templates.ts.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://kumolabanime.com';
const MAX_ITEMS = 15;

/** claim_type values that count as calm, confirmed news. */
const FORECAST_CLAIM_TYPES = [
    'TRAILER_DROP',
    'DATE_ANNOUNCED',
    'NEW_KEY_VISUAL',
    'NEW_SEASON_CONFIRMED',
] as const;

const SECTIONS: { claimType: (typeof FORECAST_CLAIM_TYPES)[number]; heading: string }[] = [
    { claimType: 'TRAILER_DROP', heading: 'Trailers' },
    { claimType: 'DATE_ANNOUNCED', heading: 'Release dates' },
    { claimType: 'NEW_KEY_VISUAL', heading: 'Key visuals' },
    { claimType: 'NEW_SEASON_CONFIRMED', heading: 'New seasons' },
];

interface ForecastPost {
    title: string;
    slug: string;
    claim_type: string;
    published_at: string;
}

export interface ForecastEmail {
    subject: string;
    html: string;
    text: string;
    itemCount: number;
}

/** Build this week's Forecast email. Queries but never sends. */
export async function composeForecast(): Promise<ForecastEmail> {
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('title, slug, claim_type, published_at')
        .eq('status', 'published')
        .in('claim_type', [...FORECAST_CLAIM_TYPES])
        .neq('type', 'DROP')
        .gte('published_at', sinceIso)
        .order('published_at', { ascending: false })
        .limit(MAX_ITEMS);
    if (error) throw new Error(`Could not load posts for The Forecast: ${error.message}`);

    const posts = ((data ?? []) as ForecastPost[]).filter((p) => p.slug && p.title);

    const htmlSections: string[] = [];
    const textSections: string[] = [];

    for (const section of SECTIONS) {
        const items = posts
            .filter((p) => p.claim_type === section.claimType)
            .map((p) => ({ title: p.title, url: `${BASE}/blog/${encodeURIComponent(p.slug)}` }));
        if (items.length === 0) continue;
        htmlSections.push(forecastSectionHtml(section.heading, items));
        textSections.push(forecastSectionText(section.heading, items));
    }

    // Admin-editable framing copy; never throws (defaults win on any failure).
    const copy = await getEmailCopy('forecast');
    const { subject, html, text } = renderForecast(copy, { htmlSections, textSections });

    return { subject, html, text, itemCount: posts.length };
}
