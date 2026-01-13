'use client';

import styles from './Manifesto.module.css';

const Manifesto = () => {
    return (
        <section className={styles.container}>
            <div className={styles.content}>
                <h2 className={styles.heading}>What KumoLab Is</h2>
                <div className={styles.textBlock}>
                    <p>We track what matters.</p>
                    <p>We ignore what doesn’t.</p>
                    <p>A daily feed of real anime updates, without the noise.</p>
                </div>

                <div className={styles.emailCapture}>
                    <p className={styles.emailText}>Get the latest anime updates before everyone else.</p>
                    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
                        <input
                            type="email"
                            placeholder="Enter your email"
                            className={styles.input}
                            required
                        />
                        <button type="submit" className={styles.submitBtn}>
                            Subscribe
                        </button>
                    </form>
                </div>
            </div>
        </section>
    );
};

export default Manifesto;
