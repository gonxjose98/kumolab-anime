import Link from 'next/link';
import styles from './FooterB.module.css';

const SOCIALS = [
    {
        name: 'X',
        handle: '@KumoLabAnime',
        href: 'https://x.com/KumoLabAnime',
        icon: (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
        ),
    },
    {
        name: 'Instagram',
        handle: '@kumolabanime',
        href: 'https://instagram.com/kumolabanime',
        icon: (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
                <circle cx="12" cy="12" r="4.5" />
                <circle cx="17.6" cy="6.4" r="1.3" fill="currentColor" stroke="none" />
            </svg>
        ),
    },
    {
        name: 'TikTok',
        handle: '@kumolabanime',
        href: 'https://tiktok.com/@kumolabanime',
        icon: (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
            </svg>
        ),
    },
    {
        name: 'YouTube',
        handle: '@kumolabanime',
        href: 'https://youtube.com/@kumolabanime',
        icon: (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z" />
            </svg>
        ),
    },
];

const FooterB = () => {
    return (
        <footer className={styles.footer}>
            <div className={styles.horizon} aria-hidden="true" />

            <div className={styles.inner}>
                <div className={styles.brandBlock}>
                    <div className={styles.wordmark}>KUMOLAB</div>
                    <div className={styles.jp}>雲ラボ — アニメの空から</div>
                    <p className={styles.tagline}>
                        Anime intelligence from above the clouds.
                    </p>
                </div>

                <div className={styles.socials}>
                    {SOCIALS.map(s => (
                        <a
                            key={s.name}
                            href={s.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.socialLink}
                            aria-label={`${s.name} — ${s.handle}`}
                        >
                            {s.icon}
                            <span className={styles.socialName}>{s.name}</span>
                        </a>
                    ))}
                </div>

                <nav className={styles.nav}>
                    <Link href="/blog" className={styles.navLink}>The Feed</Link>
                    <Link href="/merch" className={styles.navLink}>Merch</Link>
                    <Link href="/about" className={styles.navLink}>About</Link>
                    <Link href="/privacy" className={styles.navLink}>Privacy</Link>
                    <Link href="/terms" className={styles.navLink}>Terms</Link>
                </nav>

                <div className={styles.bottom}>
                    <span>© {new Date().getFullYear()} KumoLab · @kumolabanime</span>
                    <span className={styles.bottomJp}>雲の上でお会いしましょう</span>
                </div>
            </div>
        </footer>
    );
};

export default FooterB;
