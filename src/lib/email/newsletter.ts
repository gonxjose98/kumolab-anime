import { supabaseAdmin } from '@/lib/supabase/admin';

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

const esc = (s: string): string =>
    (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

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
    const subject = 'The Forecast: this week in anime';

    const htmlSections: string[] = [];
    const textSections: string[] = [];

    for (const section of SECTIONS) {
        const items = posts.filter((p) => p.claim_type === section.claimType);
        if (items.length === 0) continue;

        const links = items
            .map((p) => {
                const url = `${BASE}/blog/${encodeURIComponent(p.slug)}`;
                return (
                    `<li style="padding:5px 0;">` +
                    `<a href="${url}" style="color:#16324f;font-weight:600;text-decoration:none;border-bottom:1px solid #c3e0fb;">${esc(p.title)}</a>` +
                    `</li>`
                );
            })
            .join('');
        htmlSections.push(
            `<h2 style="font-size:13px;margin:22px 0 6px;color:#8aa3bd;text-transform:uppercase;letter-spacing:.08em;">${section.heading}</h2>` +
            `<ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;">${links}</ul>`,
        );

        textSections.push(
            `${section.heading.toUpperCase()}\n` +
            items.map((p) => `  - ${p.title}\n    ${BASE}/blog/${encodeURIComponent(p.slug)}`).join('\n'),
        );
    }

    const html = `
<div style="background:#eef5fc;padding:32px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(24,70,120,.12);">
    <div style="background:linear-gradient(135deg,#8fc2f1 0%,#c3e0fb 55%,#fff5e2 100%);padding:26px 32px;text-align:center;">
      <img src="https://kumolabanime.com/kumolab-cloud-mark-gold.png" width="58" height="auto" alt="" style="display:inline-block;margin-bottom:4px;" />
      <div style="font-size:24px;font-weight:800;color:#16324f;letter-spacing:-.02em;">The Forecast</div>
      <div style="font-size:13px;color:#46688c;margin-top:2px;">by KumoLab</div>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:15px;line-height:1.6;color:#46688c;">
        One calm email. Here is everything confirmed this week: drops, dates, and trailers, no rumors.
      </p>
      ${htmlSections.join('\n')}
      <p style="margin:26px 0 0;font-size:14px;line-height:1.6;color:#46688c;">
        See you next Sunday. The cloud sees everything first.
      </p>
    </div>
    <div style="padding:16px 32px;text-align:center;font-size:12px;color:#8aa3bd;background:#f6fafe;">
      KumoLab &middot; the cloud sees everything first<br />
      You joined The Forecast at kumolabanime.com, so this lands once a week.
    </div>
  </div>
</div>`.trim();

    const text =
        `THE FORECAST, by KumoLab\n\n` +
        `One calm email. Here is everything confirmed this week: drops, dates, and trailers, no rumors.\n\n` +
        textSections.join('\n\n') +
        `\n\nSee you next Sunday. The cloud sees everything first.\n\n` +
        `You joined The Forecast at kumolabanime.com, so this lands once a week.`;

    return { subject, html, text, itemCount: posts.length };
}
