import type { Metadata } from 'next';
import SkyContentRoot from '@/components/sky-content';
import SkyFooter from '@/components/redesign-sky/SkyFooter';
import { getMediaKitData } from '@/lib/analytics/media-kit';
import styles from './MediaKit.module.css';

// Shareable sponsor asset, not an indexable page — Jose sends the link
// deliberately. Numbers refresh from live Instagram/site analytics hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
    title: 'KumoLab — Partnerships & Media Kit',
    description:
        'Partner with KumoLab — an anime media brand reaching hundreds of thousands of fans a month across Instagram, Facebook, Threads, and the web.',
    robots: { index: false, follow: false },
};

const PARTNER_EMAIL = 'kumolabanime@gmail.com';

/** 551610 → "551K", 1610 → "1,610", 1_200_000 → "1.2M" */
function fmt(n: number | null | undefined): string | null {
    if (n == null) return null;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 10_000) return Math.round(n / 1000) + 'K';
    return n.toLocaleString('en-US');
}

export default async function MediaKitPage() {
    const d = await getMediaKitData();

    // Headline stats — omit any metric that didn't come back so we never show a
    // zero to a sponsor. Order = strongest first.
    const stats: { value: string; label: string; note?: string }[] = [];
    const push = (n: number | null | undefined, label: string, note?: string) => {
        const v = fmt(n);
        if (v) stats.push({ value: v, label, note });
    };
    push(d.views30d, 'Views / month', 'Instagram, last 30 days');
    push(d.reach30d, 'Accounts reached', 'unique, per month');
    push(d.accountsEngaged30d, 'Accounts engaged', 'per month');
    push(d.interactions30d, 'Interactions', 'likes · comments · saves · shares');
    push(d.websiteViews30d, 'Website visits', 'per month');
    push(d.postsPer30d, 'Posts published', 'last 30 days · fully automated');

    const offerings: { glyph: string; title: string; body: string }[] = [
        {
            glyph: '▶',
            title: 'Dedicated sponsored Reel',
            body: 'A full Reel built around your title, game, or drop in KumoLab’s voice — published across Instagram, Facebook, and Threads.',
        },
        {
            glyph: '☁',
            title: 'Integrated placement',
            body: 'Your announcement woven into our daily anime-news coverage — the format the audience already shows up for.',
        },
        {
            glyph: '✉',
            title: 'Newsletter feature',
            body: 'A spotlight in the KumoLab email to our owned subscriber list — an audience the algorithm can’t take away.',
        },
        {
            glyph: '✦',
            title: 'Merch & campaign collabs',
            body: 'Co-branded drops, giveaways, and multi-post campaigns. Custom scope, built with you.',
        },
    ];

    const rateCard: { tier: string; price: string; detail: string }[] = [
        { tier: 'Integrated placement', price: 'from $120', detail: 'Your news inside a KumoLab Reel, all platforms' },
        { tier: 'Dedicated sponsored Reel', price: 'from $250', detail: 'Custom Reel + caption, all platforms' },
        { tier: 'Newsletter feature', price: 'from $80', detail: 'Spotlight to the owned email list' },
        { tier: 'Monthly bundle', price: 'from $600', detail: '3 Reels + newsletter, priority scheduling' },
    ];

    return (
        <SkyContentRoot>
            <header className={styles.hero}>
                <p className={styles.kicker}>提携 · Partnerships</p>
                <h1 className={styles.title}>KumoLab Media Kit</h1>
                <p className={styles.sub}>
                    An anime media brand the algorithm already loves. We reach hundreds of thousands of
                    fans a month, and we build sponsorships that read like content, not ads.
                </p>
                <a className={styles.heroCta} href={`mailto:${PARTNER_EMAIL}?subject=KumoLab%20partnership`}>
                    Start a conversation
                </a>
            </header>

            <main className={styles.main}>
                {/* ── Snapshot ─────────────────────────────────────────── */}
                {stats.length > 0 && (
                    <section className={styles.panel} aria-labelledby="snapshot">
                        <p className={styles.sectionKicker}>数字 · By the numbers</p>
                        <h2 id="snapshot" className={styles.sectionTitle}>The reach</h2>
                        <div className={styles.statGrid}>
                            {stats.map((s) => (
                                <div key={s.label} className={styles.stat}>
                                    <span className={styles.statValue}>{s.value}</span>
                                    <span className={styles.statLabel}>{s.label}</span>
                                    {s.note && <span className={styles.statNote}>{s.note}</span>}
                                </div>
                            ))}
                        </div>
                        <p className={styles.fineprint}>Figures pull live from platform analytics and refresh continuously.</p>
                    </section>
                )}

                {/* ── Audience ─────────────────────────────────────────── */}
                <section className={styles.panel} aria-labelledby="audience">
                    <p className={styles.sectionKicker}>読者 · The audience</p>
                    <h2 id="audience" className={styles.sectionTitle}>Who you reach</h2>
                    <div className={styles.prose}>
                        <p>
                            KumoLab is a fan-first anime brand — culturally fluent, fast-moving, and trusted
                            for real coverage of what’s dropping. Our audience is exactly who anime studios,
                            streamers, game publishers, and figure makers want in front of: engaged fans who
                            follow the shows, watch the trailers, and buy the merch.
                        </p>
                    </div>
                    <ul className={styles.channelList}>
                        <li className={styles.channelItem}>
                            <span className={styles.channelGlyph} aria-hidden="true">◎</span>
                            <span>
                                <strong>Instagram</strong> — the reach engine. Video-first, breakout Reels
                                regularly clear tens of thousands of views.
                            </span>
                        </li>
                        <li className={styles.channelItem}>
                            <span className={styles.channelGlyph} aria-hidden="true">☁</span>
                            <span><strong>Facebook &amp; Threads</strong> — every post fans out automatically for extra reach.</span>
                        </li>
                        <li className={styles.channelItem}>
                            <span className={styles.channelGlyph} aria-hidden="true">▶</span>
                            <span><strong>YouTube Shorts</strong> — edited vertical video, a growing surface.</span>
                        </li>
                        <li className={styles.channelItem}>
                            <span className={styles.channelGlyph} aria-hidden="true">✉</span>
                            <span><strong>Website &amp; newsletter</strong> — an owned audience for durable, on-site placements.</span>
                        </li>
                    </ul>
                </section>

                {/* ── Proof ────────────────────────────────────────────── */}
                {d.topReels.length > 0 && (
                    <section className={styles.panel} aria-labelledby="proof">
                        <p className={styles.sectionKicker}>実績 · Recent breakouts</p>
                        <h2 id="proof" className={styles.sectionTitle}>What performance looks like</h2>
                        <div className={styles.reelGrid}>
                            {d.topReels.map((r) => (
                                <a key={r.link} href={r.link} className={styles.reel}>
                                    {r.thumbnail ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={r.thumbnail} alt="" className={styles.reelThumb} loading="lazy" />
                                    ) : (
                                        <div className={styles.reelThumbFallback} aria-hidden="true">☁</div>
                                    )}
                                    <div className={styles.reelMeta}>
                                        <span className={styles.reelViews}>{fmt(r.views)} views</span>
                                        <span className={styles.reelTitle}>{r.title}</span>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── Offerings ────────────────────────────────────────── */}
                <section className={styles.panel} aria-labelledby="offer">
                    <p className={styles.sectionKicker}>提供 · Partner with us</p>
                    <h2 id="offer" className={styles.sectionTitle}>Ways to work together</h2>
                    <div className={styles.offerGrid}>
                        {offerings.map((o) => (
                            <div key={o.title} className={styles.offer}>
                                <span className={styles.offerGlyph} aria-hidden="true">{o.glyph}</span>
                                <h3 className={styles.offerTitle}>{o.title}</h3>
                                <p className={styles.offerBody}>{o.body}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Rate card ────────────────────────────────────────── */}
                <section className={styles.panel} aria-labelledby="rates">
                    <p className={styles.sectionKicker}>料金 · Rate card</p>
                    <h2 id="rates" className={styles.sectionTitle}>Starting rates</h2>
                    <div className={styles.rateList}>
                        {rateCard.map((r) => (
                            <div key={r.tier} className={styles.rate}>
                                <div className={styles.rateHead}>
                                    <span className={styles.rateTier}>{r.tier}</span>
                                    <span className={styles.ratePrice}>{r.price}</span>
                                </div>
                                <span className={styles.rateDetail}>{r.detail}</span>
                            </div>
                        ))}
                    </div>
                    <p className={styles.fineprint}>Rates are starting points — bundles, campaigns, and revenue-share collabs are negotiable.</p>
                </section>

                {/* ── CTA ──────────────────────────────────────────────── */}
                <section className={`${styles.panel} ${styles.ctaPanel}`} aria-labelledby="cta">
                    <h2 id="cta" className={styles.ctaTitle}>Let’s build something</h2>
                    <p className={styles.ctaSub}>Tell us the title, the drop, or the campaign — we’ll come back with a plan.</p>
                    <a className={styles.ctaBtn} href={`mailto:${PARTNER_EMAIL}?subject=KumoLab%20partnership`}>
                        {PARTNER_EMAIL}
                    </a>
                </section>
            </main>

            <SkyFooter />
        </SkyContentRoot>
    );
}
