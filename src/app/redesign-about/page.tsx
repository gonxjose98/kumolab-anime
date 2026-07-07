import type { Metadata } from 'next';
import SkyContentRoot from '@/components/sky-content';
import SkyFooter from '@/components/redesign-sky/SkyFooter';
import styles from './SkyAbout.module.css';

export const metadata: Metadata = {
    title: 'KumoLab — About (Redesign Preview: Content Sky)',
    description:
        'Preview of the KumoLab about page on the content-page sky theme — the real Our Story, What We Offer, and Contact Us content restyled on the cel-shaded sky.',
    robots: { index: false, follow: false },
};

/**
 * /redesign-about — non-destructive themed preview of the about page.
 * Real copy from src/app/about/page.tsx, restyled on the content sky
 * (SkyContentRoot). Never touches /about.
 */
export default function RedesignAboutPage() {
    return (
        <SkyContentRoot>
            <header className={styles.hero}>
                <p className={styles.kicker}>私たちについて · Above the Clouds</p>
                <h1 className={styles.title}>About KumoLab</h1>
                <p className={styles.sub}>
                    Your trusted source for anime culture and premium merchandise.
                </p>
            </header>

            <main className={styles.main}>
                <section className={styles.panel} aria-labelledby="our-story">
                    <p className={styles.sectionKicker}>物語 · Our Story</p>
                    <h2 id="our-story" className={styles.sectionTitle}>Our Story</h2>
                    <div className={styles.prose}>
                        <p>
                            KumoLab was born from a passion for anime culture and the desire to create a platform where fans
                            can discover the latest news, reviews, and exclusive merchandise from their favorite series.
                        </p>
                        <p>
                            Founded by anime enthusiasts for anime enthusiasts, we curate the most exciting content and
                            handpick premium collectibles that celebrate the artistry and storytelling that makes anime special.
                        </p>
                        <p>
                            Whether you&apos;re seeking the latest industry news, in-depth reviews, or that perfect addition to
                            your collection, KumoLab is your gateway to the vibrant world of anime.
                        </p>
                    </div>
                </section>

                <section className={styles.panel} aria-labelledby="what-we-offer">
                    <p className={styles.sectionKicker}>提供 · What We Offer</p>
                    <h2 id="what-we-offer" className={styles.sectionTitle}>What We Offer</h2>
                    <ul className={styles.offerList}>
                        <li className={styles.offerItem}>
                            <span className={styles.offerGlyph} aria-hidden="true">☁</span>
                            Latest anime news and industry updates
                        </li>
                        <li className={styles.offerItem}>
                            <span className={styles.offerGlyph} aria-hidden="true">☁</span>
                            In-depth reviews and analysis
                        </li>
                        <li className={styles.offerItem}>
                            <span className={styles.offerGlyph} aria-hidden="true">☁</span>
                            Exclusive merchandise and collectibles
                        </li>
                        <li className={styles.offerItem}>
                            <span className={styles.offerGlyph} aria-hidden="true">☁</span>
                            Community-driven content
                        </li>
                    </ul>
                </section>

                <section className={styles.panel} aria-labelledby="contact-us">
                    <p className={styles.sectionKicker}>連絡 · Contact Us</p>
                    <h2 id="contact-us" className={styles.sectionTitle}>Contact Us</h2>
                    {/* Non-functional, exactly like the original about page (no handler). */}
                    <form className={styles.form}>
                        <div className={styles.formGroup}>
                            <label htmlFor="name" className={styles.label}>Name</label>
                            <input type="text" id="name" required className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="email" className={styles.label}>Email</label>
                            <input type="email" id="email" required className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="message" className={styles.label}>Message</label>
                            <textarea id="message" rows={5} required className={styles.textarea}></textarea>
                        </div>
                        <button type="submit" className={styles.submitBtn}>Send Message</button>
                    </form>
                </section>
            </main>

            <SkyFooter />
        </SkyContentRoot>
    );
}
