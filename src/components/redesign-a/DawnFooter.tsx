import Link from 'next/link';
import styles from './DawnFooter.module.css';

const SOCIALS = [
    { name: 'X', href: 'https://x.com/kumolabanime', label: 'X (Twitter)' },
    { name: 'IG', href: 'https://instagram.com/kumolabanime', label: 'Instagram' },
    { name: 'TT', href: 'https://tiktok.com/@kumolabanime', label: 'TikTok' },
    { name: 'YT', href: 'https://youtube.com/@kumolabanime', label: 'YouTube' },
    { name: 'TH', href: 'https://threads.net/@kumolabanime', label: 'Threads' },
];

const LINKS = [
    { href: '/blog', label: 'The Feed' },
    { href: '/merch', label: 'Merch' },
    { href: '/about', label: 'About' },
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms' },
];

const DawnFooter = () => {
    return (
        <footer className={styles.footer}>
            <div className={styles.horizonLine} aria-hidden="true" />
            <div className={styles.inner}>
                <div className={styles.brand}>
                    <div className={styles.wordmark}>KUMOLAB</div>
                    <div className={styles.jp}>雲ラボ · Anime, above the noise.</div>
                </div>

                <nav className={styles.links} aria-label="Footer">
                    {LINKS.map((l) => (
                        <Link key={l.href} href={l.href} className={styles.link}>
                            {l.label}
                        </Link>
                    ))}
                </nav>

                <div className={styles.socials}>
                    <span className={styles.handle}>@kumolabanime</span>
                    <div className={styles.socialRow}>
                        {SOCIALS.map((s) => (
                            <a
                                key={s.name}
                                href={s.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={s.label}
                                className={styles.social}
                            >
                                {s.name}
                            </a>
                        ))}
                    </div>
                </div>
            </div>
            <div className={styles.legal}>
                © {new Date().getFullYear()} KumoLab. Crafted above the clouds.
            </div>
        </footer>
    );
};

export default DawnFooter;
