import Link from 'next/link';
import PageShell from '../PageShell';
import { SOCIALS } from '../HomeV3';
import s from '../HomeV3.module.css';
import p from '../Pages.module.css';

const OFFER = [
    { tone: 'gold', title: 'Daily anime news', line: 'Announcements, trailers and release dates, checked every morning.', d: 'M5 4h11l3 3v13H5zM8 10h8M8 14h8M8 18h5' },
    { tone: 'pink', title: 'Carousels and reels', line: 'Lists, rankings and favorite scenes, made by fans for fans.', d: 'M3 7h13v10H3zM16 10l5-3v10l-5-3' },
    { tone: 'mint', title: 'The Forecast', line: 'One email every Sunday with the week in anime.', d: 'M3 5h18v14H3zM3 7l9 6 9-6' },
    { tone: 'sky', title: 'The Cloud Collection', line: 'Small-batch KumoLab apparel in limited runs.', d: 'M5 8h14l-1 12H6L5 8ZM9 8V7a3 3 0 0 1 6 0v1' },
];

export default function AboutPage() {
    return (
        <PageShell title="About KumoLab" sub="Anime news and culture, kept simple." active="/about">
            <div className={p.wrap}>
                <div className={p.aboutGrid}>
                    <section className={p.card} data-reveal>
                        <h2 className={p.cardTitle}>Our story</h2>
                        <div className={p.prose}>
                            <p>KumoLab started because keeping up with anime got noisy. Big news was buried under rumors, reposts and clickbait.</p>
                            <p>So we built one calm place to check each day: what was announced, what&apos;s airing, and what fans are talking about. We&apos;re fans too, so we keep it honest and fun.</p>
                            <p>Find us here on the website, in your inbox every Sunday, and across social media.</p>
                        </div>
                    </section>
                    <section className={p.offer}>
                        {OFFER.map((o, i) => (
                            <div key={o.title} className={p.offerItem} data-reveal data-reveal-i={i}>
                                <span className={`${p.offerIcon} ${p[`t_${o.tone}`]}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={o.d} /></svg></span>
                                <h3>{o.title}</h3>
                                <p>{o.line}</p>
                            </div>
                        ))}
                    </section>
                </div>

                <div className={p.aboutRow}>
                    <div className={`${p.card} ${p.ctaCard}`} data-reveal data-reveal-i={0}>
                        <h2 className={p.cardTitle}>Get the Forecast</h2>
                        <p>The week&apos;s best trailers, releases and stories, every Sunday. No spoilers, no spam.</p>
                        <Link href="/#forecast" className={p.ctaBtn}>Join for free</Link>
                    </div>
                    <div className={`${p.card} ${p.ctaCard}`} data-reveal data-reveal-i={1}>
                        <h2 className={p.cardTitle}>Say hello</h2>
                        <p>Questions, ideas or partnerships? We read every message.</p>
                        <a href="mailto:kumolabanime@gmail.com" className={p.mail}>kumolabanime@gmail.com</a>
                    </div>
                    <div className={s.follow} data-reveal data-reveal-i={2}>
                        <h3>Follow KumoLab</h3>
                        <p>Fresh anime every day, wherever you scroll.</p>
                        <ul className={s.followList}>
                            {SOCIALS.map((x) => (
                                <li key={x.name}>
                                    <a href={x.href} target="_blank" rel="noopener noreferrer" className={s.followRow}>
                                        <span className={`${s.followIcon} ${s[`brand_${x.name.toLowerCase()}`]}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={x.path} /></svg></span>
                                        <span className={s.followText}>
                                            <span className={s.followName}>{x.name}</span>
                                            <span className={s.followHandle}>{(x as { handle?: string }).handle || '@kumolabanime'}</span>
                                        </span>
                                        <span className={s.followArrow} aria-hidden="true">→</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </PageShell>
    );
}
