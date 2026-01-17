import styles from './about.module.css';

export default function AboutPage() {
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>About KumoLab</h1>
                <p className={styles.subtitle}>Your trusted source for anime culture and premium merchandise</p>
            </header>

            <div className={styles.section}>
                <h2>Our Story</h2>
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

            <div className={styles.section}>
                <h2>What We Offer</h2>
                <ul className={styles.offerList}>
                    <li>Latest anime news and industry updates</li>
                    <li>In-depth reviews and analysis</li>
                    <li>Exclusive merchandise and collectibles</li>
                    <li>Community-driven content</li>
                </ul>
            </div>

            <div className={styles.contact}>
                <h2>Contact Us</h2>
                <form className={styles.form}>
                    <div className={styles.formGroup}>
                        <label htmlFor="name">Name</label>
                        <input type="text" id="name" required />
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="email">Email</label>
                        <input type="email" id="email" required />
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="message">Message</label>
                        <textarea id="message" rows={5} required></textarea>
                    </div>
                    <button type="submit" className={styles.submitBtn}>Send Message</button>
                </form>
            </div>
        </div>
    );
}
