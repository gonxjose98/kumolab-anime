import Link from 'next/link';
import { Cormorant_Garamond } from 'next/font/google';
import { BlogPost, Product } from '@/types';
import Forecast from './Forecast';
import TrendingRow from './TrendingRow';
import s from './HomeV3.module.css';

const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['600', '700'], variable: '--hv3-serif' });

export interface TrendingShow {
    id: number;
    title: string;
    image: string | null;
    popularity: number;
    nextAiringAt: string | null;
    nextEpisode: number | null;
    status: string | null;
    url: string | null;
}

const IG = 'https://www.instagram.com/kumolabanime/';
const SOCIALS = [
    { name: 'X', href: 'https://x.com/KumoLabAnime', path: 'M18.9 2H22l-7.4 8.5L23 22h-6.8l-5.3-6.9L4.8 22H1.7l7.9-9.1L1 2h7l4.8 6.3L18.9 2Zm-1.2 18h1.9L6.4 3.9H4.4L17.7 20Z' },
    { name: 'Instagram', href: IG, path: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4ZM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM12 2c-2.7 0-3 0-4.1.1C4.3 2.3 2.3 4.3 2.1 7.9 2 9 2 9.3 2 12s0 3 .1 4.1c.2 3.6 2.2 5.6 5.8 5.8 1.1.1 1.4.1 4.1.1s3 0 4.1-.1c3.6-.2 5.6-2.2 5.8-5.8.1-1.1.1-1.4.1-4.1s0-3-.1-4.1c-.2-3.6-2.2-5.6-5.8-5.8C15 2 14.7 2 12 2Z' },
    { name: 'YouTube', href: 'https://www.youtube.com/@kumolabanime', path: 'M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1c.4-1.6.5-4.8.5-4.8s0-3.2-.5-4.8ZM9.7 15V9l5.8 3-5.8 3Z' },
    { name: 'TikTok', href: 'https://www.tiktok.com/@kumolabanime', path: 'M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.3v12.4a2.6 2.6 0 1 1-1.8-2.5V9.6a5.9 5.9 0 1 0 5.1 5.8V9.1a7.5 7.5 0 0 0 4.4 1.4V7.2a4.3 4.3 0 0 1-3.3-1.4Z' },
    { name: 'Threads', href: 'https://www.threads.net/@kumolabanime', path: 'M16.7 11.1c-.1 0-.2-.1-.3-.1-.2-3-1.8-4.7-4.6-4.7h-.1c-1.6 0-3 .7-3.9 2l1.5 1c.6-.9 1.6-1.1 2.4-1.1 1 0 1.7.3 2.2.9.3.4.6 1 .7 1.7a12 12 0 0 0-2.8-.1c-2.8.2-4.6 1.8-4.5 4.1.1 1.2.7 2.2 1.6 2.8.8.5 1.9.8 3 .7 1.4-.1 2.6-.6 3.4-1.6.6-.8 1-1.8 1.2-3 .7.4 1.2.9 1.4 1.6.5 1.1.5 3-1 4.4-1.3 1.3-2.8 1.8-5.1 1.9-2.6 0-4.5-.9-5.8-2.5C4.9 17.9 4.3 15.4 4.2 12c.1-3.4.7-5.9 1.9-7.4C7.4 3 9.3 2.1 11.9 2.1c2.6 0 4.6.9 5.9 2.5.7.8 1.1 1.8 1.5 3l1.7-.5c-.4-1.4-1-2.7-1.9-3.7C17.5 1.4 15.1.3 11.9.3 8.8.3 6.4 1.4 4.8 3.4 3.3 5.2 2.6 8.1 2.5 12c.1 3.9.8 6.8 2.3 8.6 1.6 2 4 3.1 7.1 3.1 2.8 0 4.7-.8 6.3-2.4 2.1-2.1 2-4.7 1.3-6.3-.5-1.2-1.5-2.2-2.8-2.9Zm-4.8 4.6c-1.2.1-2.4-.5-2.5-1.5 0-.8.6-1.6 2.6-1.7h.7c.7 0 1.4.1 2 .2-.2 2.4-1.5 2.9-2.8 3Z' },
];

function ago(iso?: string) {
    if (!iso) return '';
    const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
}

// Chip label + tone from the post's claim type. Plain words, no jargon.
function chip(p: BlogPost): { label: string; tone: string } {
    const c = String(p.claimType || '').toUpperCase();
    if (c.includes('TRAILER')) return { label: 'Trailer', tone: 'gold' };
    if (c.includes('SEASON') || c.includes('DATE') || c.includes('PREMIERE')) return { label: 'Release', tone: 'blue' };
    if (Array.isArray(p.image_settings?.slides) && p.image_settings!.slides!.length > 1) return { label: 'Feature', tone: 'sky' };
    if (p.type === 'DROP') return { label: 'Daily drop', tone: 'blue' };
    return { label: 'News', tone: 'green' };
}

function airLine(t: TrendingShow): string {
    if (t.nextAiringAt) {
        const days = Math.round((new Date(t.nextAiringAt).getTime() - Date.now()) / 86400000);
        const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
        return t.nextEpisode && t.nextEpisode > 1 ? `Episode ${t.nextEpisode} airs ${when}` : `Premieres ${when}`;
    }
    return t.status === 'FINISHED' ? 'Finished airing' : 'Airing now';
}

const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

const EXPLORE = [
    { title: 'Carousels', line: 'Curated lists, rankings and story spotlights.', img: '/home-v3/card-train.webp', href: IG, icon: 'M4 5h16v14H4zM8 3v4M16 3v4' },
    { title: 'Fan Reels', line: 'Our favorite scenes, cut by fans for fans.', img: '/home-v3/card-sunset.webp', href: `${IG}reels/`, icon: 'M3 7h13v10H3zM16 10l5-3v10l-5-3' },
    { title: 'News Reels', line: 'The week in anime, in 30 seconds.', img: '/home-v3/card-railing.webp', href: `${IG}reels/`, icon: 'M5 4h11l3 3v13H5zM8 10h8M8 14h8M8 18h5' },
    { title: 'Website News', line: 'Every announcement, verified first.', img: '/home-v3/card-town.webp', href: '/blog', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18' },
];

const HERO_PILLS = [
    { label: 'Daily Drops', href: '/latest-daily-drop', icon: 'M5 5h14v15H5zM5 9h14M9 3v4M15 3v4M8 13h3M8 16h6' },
    { label: 'Trailers', href: '/blog', icon: 'M3 6h18v12H3zM10 9.5l5 2.5-5 2.5z' },
    { label: 'Reels', href: `${IG}reels/`, icon: 'M5 4h14v16H5zM5 8h14M9 4l2 4M14 4l2 4M10 12l5 3-5 3z' },
    { label: 'News', href: '/blog', icon: 'M5 4h11l3 3v13H5zM8 10h8M8 14h8M8 18h5' },
    { label: 'Weekly Forecast', href: '#forecast', icon: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18Z' },
];

function Wave({ flip = false }: { flip?: boolean }) {
    return (
        <svg className={`${s.wave} ${flip ? s.waveFlip : ''}`} viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 40c120 26 240 30 360 14S600 6 720 18s240 44 360 40 240-34 360-30v62H0Z" fill="rgba(255,255,255,.55)" />
            <path d="M0 58c140 18 260 18 380 4s230-34 350-22 250 40 370 36 220-24 340-22v36H0Z" fill="#fff" fillOpacity=".9" />
        </svg>
    );
}

export default function HomeV3({ posts, products, trending }: { posts: BlogPost[]; products: Product[]; trending: TrendingShow[] }) {
    const drops = posts.filter((p) => p.image).slice(0, 4);
    const social = posts
        .filter((p) => p.image && (p.social_ids as any)?.instagram_url)
        .slice(0, 6);
    const merch = products.filter((p) => p.isVisible !== false).slice(0, 3);

    return (
        <div className={`${s.page} ${serif.variable}`}>
            {/* The storefront locks html/body to 100vh for the old scroll journey; this page uses normal flow. */}
            <style>{`html,body{height:auto!important;min-height:100%;overflow-y:visible!important;overflow-x:clip!important;background:#4f9ae6}`}</style>
            {/* ── Nav ─────────────────────────────────────────── */}
            <header className={s.nav}>
                <Link href="/" className={s.brand}>KUMOLAB</Link>
                <nav className={s.links} aria-label="Main">
                    <a href="#trending">Discover</a>
                    <Link href="/blog">News</Link>
                    <Link href="/blog">Trailers</Link>
                    <a href="#explore">Features</a>
                    <Link href="/merch">Shop</Link>
                </nav>
                <Link href="/blog" className={s.search} aria-label="Search the feed">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                </Link>
                <a href="#forecast" className={s.navCta}>Join</a>
            </header>

            {/* ── Hero ────────────────────────────────────────── */}
            <section className={s.hero}>
                <picture>
                    <source media="(max-width: 760px)" srcSet="/home-v3/hero-m.webp" />
                    <source media="(max-width: 1500px)" srcSet="/home-v3/hero-1440x.webp" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/home-v3/hero.webp" alt="" className={s.heroImg} fetchPriority="high" />
                </picture>
                <div className={s.heroInner}>
                    <svg viewBox="0 0 32 24" className={s.heroCloud} aria-hidden="true"><path d="M9 21h15a6 6 0 0 0 .6-12A8 8 0 0 0 9.2 7.5 6.8 6.8 0 0 0 9 21Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                    <p className={s.kicker}>Anime, above the noise.</p>
                    <h1 className={s.wordmark}>KUMOLAB</h1>
                    <p className={s.tagline}>Your daily anime destination.</p>
                    <p className={s.heroSub}>Fresh drops. New trailers. Real talk. A brighter view on what to watch next.</p>
                    <div className={s.heroCtas}>
                        <a href="#drops" className={s.btnGold}>Explore today&apos;s drops <span aria-hidden="true">→</span></a>
                        <a href="#forecast" className={s.btnGhost}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                            Join the forecast
                        </a>
                    </div>
                    <div className={s.heroPills}>
                        {HERO_PILLS.map((pl) => (
                            <a key={pl.label} href={pl.href} className={s.heroPill} {...(pl.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d={pl.icon} /></svg>{pl.label}
                            </a>
                        ))}
                    </div>
                </div>
                <p className={s.heroNote} aria-hidden="true">Same sky.<br />More to explore.</p>
                <div className={s.heroJp} aria-hidden="true">
                    <span className={s.heroJpBig}>雲の上へ</span>
                    <span>Anime<br />community<br />culture<br />and beyond.</span>
                </div>
            </section>

            <div className={s.sky}>
                {/* ── Today's Drops ────────────────────────────── */}
                <section id="drops" className={s.section}>
                    <div className={s.head}>
                        <div>
                            <h2 className={s.h2}><CloudIcon />Today&apos;s Drops</h2>
                            <p className={s.sub}>Fresh anime news, trailers and releases, updated daily.</p>
                        </div>
                        <Link href="/blog" className={s.pill}>See all drops →</Link>
                    </div>
                    <div className={s.dropGrid}>
                        {drops.map((p) => {
                            const c = chip(p);
                            return (
                                <Link key={p.slug} href={`/blog/${p.slug}`} className={s.drop}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={p.image} alt="" loading="lazy" className={s.dropImg} />
                                    <div className={s.dropBody}>
                                        <div className={s.dropMeta}><span className={`${s.chip} ${s[`tone_${c.tone}`]}`}>{c.label}</span><span>{ago(p.published_at || p.timestamp)}</span></div>
                                        <h3 className={s.dropTitle}>{p.title}</h3>
                                        {p.excerpt && <p className={s.dropEx}>{p.excerpt}</p>}
                                        <span className={s.arrow} aria-hidden="true">→</span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </section>

                {/* ── Trending Now ─────────────────────────────── */}
                {trending.length > 0 && (
                    <section id="trending" className={s.section}>
                        <div className={s.head}>
                            <div>
                                <h2 className={s.h2}><span className={s.flame} aria-hidden="true">🔥</span>Trending Now</h2>
                                <p className={s.sub}>The most-followed anime on AniList this week.</p>
                            </div>
                        </div>
                        <TrendingRow
                            items={trending.map((t, i) => ({
                                rank: i + 1,
                                title: t.title,
                                image: t.image,
                                line: airLine(t),
                                members: `${fmtK(t.popularity)} fans on AniList`,
                                href: t.url || '#',
                            }))}
                        />
                    </section>
                )}

                {/* ── Explore ──────────────────────────────────── */}
                <section id="explore" className={s.section}>
                    <div className={s.head}>
                        <div>
                            <h2 className={s.h2}><CloudIcon />Explore Anime Your Way</h2>
                            <p className={s.sub}>Different stories. Same beautiful sky.</p>
                        </div>
                    </div>
                    <div className={s.exploreGrid}>
                        {EXPLORE.map((e) => (
                            <a key={e.title} href={e.href} className={s.explore} {...(e.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={e.img} alt="" loading="lazy" className={s.exploreImg} />
                                <div className={s.exploreBody}>
                                    <svg viewBox="0 0 24 24" className={s.exploreIcon} aria-hidden="true"><path d={e.icon} /></svg>
                                    <h3>{e.title}</h3>
                                    <p>{e.line}</p>
                                </div>
                            </a>
                        ))}
                    </div>
                </section>
            </div>

            {/* ── Email capture ───────────────────────────────── */}
            <Forecast />

            <div className={`${s.sky} ${s.skyClouds}`}>
                {/* ── Merch ────────────────────────────────────── */}
                {merch.length > 0 && (
                    <section className={s.section}>
                        <div className={s.head}>
                            <div>
                                <h2 className={s.h2}><CloudIcon />The Cloud Collection</h2>
                                <p className={s.sub}>Wear the anime weather.</p>
                            </div>
                            <Link href="/merch" className={s.pill}>Shop all →</Link>
                        </div>
                        <div className={s.merchGrid}>
                            {merch.map((m, i) => (
                                <Link key={m.id} href={`/merch/${m.id}`} className={s.merch}>
                                    {(m.label || m.isFeatured || i === 0) && (
                                        <span className={`${s.badge} ${m.isFeatured || i === 0 ? s.badgeGold : s.badgeBlue}`}>{m.label || 'The flagship'}</span>
                                    )}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={m.image} alt={m.name} loading="lazy" className={s.merchImg} />
                                    <div className={s.merchBody}>
                                        <h3>{m.name}</h3>
                                        <p className={s.price}>${m.price.toFixed(2)}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── Join the Conversation ────────────────────── */}
                <section className={s.section}>
                    <div className={s.head}>
                        <div>
                            <h2 className={s.h2}><CloudIcon />Join the Conversation</h2>
                            <p className={s.sub}>Anime lives here too.</p>
                        </div>
                    </div>
                    <div className={s.convo}>
                        <div className={s.socialStrip}>
                            {social.map((p) => (
                                <a key={p.slug} href={(p.social_ids as any).instagram_url} target="_blank" rel="noopener noreferrer" className={s.socialTile} title={p.title}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={p.image} alt={p.title} loading="lazy" />
                                </a>
                            ))}
                        </div>
                        <div className={s.follow}>
                            <h3>Follow KumoLab</h3>
                            <p>News, clips and community, everywhere.</p>
                            <div className={s.icons}>
                                {SOCIALS.map((x) => (
                                    <a key={x.name} href={x.href} target="_blank" rel="noopener noreferrer" aria-label={x.name} className={s.icon}>
                                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={x.path} /></svg>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            {/* ── Footer ──────────────────────────────────────── */}
            <footer className={s.footer}>
                <Wave flip />
                <div className={s.footInner}>
                    <div>
                        <div className={s.footBrand}>KUMOLAB</div>
                        <div className={s.footTag}>Anime, above the noise.</div>
                    </div>
                    <nav className={s.footLinks} aria-label="Footer">
                        <Link href="/blog">Latest</Link>
                        <Link href="/merch">Shop</Link>
                        <Link href="/about">About</Link>
                        <Link href="/privacy">Privacy</Link>
                        <Link href="/terms">Terms</Link>
                    </nav>
                </div>
                <p className={s.copy}>© {new Date().getFullYear()} KumoLab. Crafted above the clouds.</p>
            </footer>
        </div>
    );
}

function CloudIcon() {
    return (
        <svg viewBox="0 0 32 24" className={s.cloudIcon} aria-hidden="true">
            <path d="M9 21h15a6 6 0 0 0 .6-12A8 8 0 0 0 9.2 7.5 6.8 6.8 0 0 0 9 21Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
    );
}
