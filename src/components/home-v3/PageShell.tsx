import Link from 'next/link';
import { Cormorant_Garamond } from 'next/font/google';
import Reveal from './Reveal';
import BackButton from './BackButton';
import s from './HomeV3.module.css';
import p from './Pages.module.css';

const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['600', '700'], variable: '--hv3-serif' });

const NAV = [
    { href: '/blog', label: 'Latest' },
    { href: '/merch', label: 'Shop' },
    { href: '/about', label: 'About' },
];

/**
 * Shared frame for every inner page (Latest, Shop, About, Privacy, Terms):
 * the homepage nav, a short band of the same painted sky + sea with the page
 * title, the soft cloud sky behind the content, and the homepage footer.
 */
export default function PageShell({
    title,
    sub,
    active,
    children,
}: {
    title: string;
    sub?: string;
    active?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={`${s.page} ${serif.variable}`}>
            <style>{`html,body{height:auto!important;min-height:100%;overflow-y:visible!important;overflow-x:clip!important;background:#4f9ae6}`}</style>
            <Reveal />
            <header className={s.nav}>
                <Link href="/" className={s.brand} aria-label="KumoLab home">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/home-v3/logo-white.webp" alt="KumoLab" className={s.brandLogo} />
                </Link>
                <nav className={p.navLinks} aria-label="Main">
                    {NAV.map((n) => (
                        <Link key={n.href} href={n.href} className={`${p.navLink} ${active === n.href ? p.navActive : ''}`}>{n.label}</Link>
                    ))}
                </nav>
                <Link href="/#forecast" className={s.navCta}>Join</Link>
            </header>

            <div className={p.skyWrap}>
            <section className={p.band}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/home-v3/hero-1440-s3.webp" alt="" className={p.bandImg} />
                <div className={p.bandInner}>
                    <BackButton />
                    <h1 className={p.bandTitle}>{title}</h1>
                    {sub && <p className={p.bandSub}>{sub}</p>}
                </div>
            </section>

            <div className={p.body}>{children}</div>
            </div>

            <footer className={s.footer}>
                <svg className={`${s.wave} ${s.waveFlip}`} viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M0 40c120 26 240 30 360 14S600 6 720 18s240 44 360 40 240-34 360-30v62H0Z" fill="rgba(255,255,255,.55)" />
                    <path d="M0 58c140 18 260 18 380 4s230-34 350-22 250 40 370 36 220-24 340-22v36H0Z" fill="#fff" fillOpacity=".9" />
                </svg>
                <div className={s.footInner}>
                    <div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/home-v3/logo-white.webp" alt="KumoLab" className={s.footLogo} />
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
