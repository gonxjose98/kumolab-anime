import Link from 'next/link';
import styles from './Footer.module.css';

const Footer = () => {
    return (
        <footer className={styles.footer}>
            <Link href="/" className={styles.brand}>
                <div className={styles.hexIcon}>
                    <span className={styles.hexLetter}>K</span>
                </div>
                <span className={styles.brandName}>KUMOLAB</span>
                <span className={styles.brandJp}>クモラボ</span>
            </Link>
            <p className={styles.tagline}>
                Your Anime Intelligence Hub — Verified · Real-Time · Always On
            </p>
            <div className={styles.copyright}>
                &copy; {new Date().getFullYear()} KumoLab. All rights reserved.
            </div>
        </footer>
    );
};

export default Footer;
