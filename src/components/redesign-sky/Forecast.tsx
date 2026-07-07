'use client';

import { useState, FormEvent } from 'react';
import { Reveal } from './motion';
import { CelCloud } from './art';
import styles from './Forecast.module.css';

type Status = 'idle' | 'loading' | 'done' | 'error';

const Forecast = () => {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<Status>('idle');

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!email || status === 'loading') return;
        setStatus('loading');
        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            setStatus(res.ok ? 'done' : 'error');
        } catch {
            setStatus('error');
        }
    };

    return (
        <section className={styles.section}>
            <div className={styles.glow} aria-hidden="true" />
            <Reveal className={styles.cardWrap}>
                <div className={styles.card}>
                    <CelCloud id="forecast-a" className={styles.cloudLeft} />
                    <CelCloud id="forecast-b" className={styles.cloudRight} />
                    <div className={styles.kicker}>天気予報 · The Forecast</div>
                    <h2 className={styles.title}>
                        Tomorrow&apos;s anime weather,
                        <br />
                        in your inbox.
                    </h2>
                    <p className={styles.sub}>
                        One calm email. The week&apos;s confirmed drops, dates, and trailers.
                        No spoilers, no spam, no noise.
                    </p>

                    {status === 'done' ? (
                        <div className={styles.success}>
                            <span className={styles.successKanji}>晴</span>
                            You&apos;re on the list. Clear skies ahead. See you above the clouds.
                        </div>
                    ) : (
                        <form className={styles.form} onSubmit={submit}>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className={styles.input}
                                aria-label="Email address"
                            />
                            <button
                                type="submit"
                                className={styles.button}
                                disabled={status === 'loading'}
                            >
                                {status === 'loading' ? 'Joining…' : 'Join The Forecast'}
                            </button>
                        </form>
                    )}

                    {status === 'error' && (
                        <p className={styles.error}>
                            The sky hiccuped. Please try again in a moment.
                        </p>
                    )}

                    <p className={styles.fine}>Free forever. Unsubscribe anytime.</p>
                </div>
            </Reveal>
        </section>
    );
};

export default Forecast;
