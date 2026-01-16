import Link from 'next/link';
import styles from './Footer.module.css';

const Footer = () => {
    return (
        <footer className={styles.footer}>
            <div className={`container ${styles.footerContainer}`}>
                <div className={styles.brand}>
                    <h2 className={styles.logo}>KUMOLAB</h2>
                    <p className={styles.tagline}>Anime Intelligence. Daily. v1.7</p>
                </div>
                <div className={styles.links}>
                    <div>
                        <h4>Platform</h4>
                        <ul>
                            <li><Link href="/">Home</Link></li>
                            <li><Link href="/blog">Blog</Link></li>
                            <li><Link href="/merch">Merch</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4>Company</h4>
                        <ul>
                            <li><Link href="/about">About</Link></li>
                            <li><Link href="/contact">Contact</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4>Socials</h4>
                        <ul>
                            <li><a href="#">Twitter</a></li>
                            <li><a href="#">Instagram</a></li>
                        </ul>
                    </div>
                </div>
            </div>
            <div className={styles.copyright}>
                &copy; {new Date().getFullYear()} KumoLab. All rights reserved.
            </div>
        </footer>
    );
};

export default Footer;
