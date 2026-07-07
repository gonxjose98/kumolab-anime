'use client';

import { useState, FormEvent } from 'react';
import styles from './Forecast.module.css';
import { useReveal } from './useReveal';

type Status = 'idle' | 'loading' | 'success' | 'error';

const Forecast = () => {
    const { ref, visible } = useReveal<HTMLElement>(0.25);
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<Status>('idle');

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!email || status === 'loading') return;
        setStatus('loading');
        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            if (res.ok) {
                setStatus('success');
                setEmail('');
            } else {
                setStatus('error');
            }
        } catch {
            setStatus('error');
        }
    };

    return (
        <section ref={ref} className={`${styles.section} ${visible ? styles.visible : ''}`}>
            <div className={styles.panel}>
                <div className={styles.panelGlow} aria-hidden="true" />

                <div className={styles.cloudIcon} aria-hidden="true">
                    <svg viewBox="0 0 64 40" width="56" height="35" fill="none">
                        <path
                            d="M50 34H16a10 10 0 1 1 2.3-19.7A14 14 0 0 1 45 12a11 11 0 0 1 5 22Z"
                            stroke="url(#fcst)"
                            strokeWidth="2.5"
                            strokeLinejoin="round"
                        />
                        <defs>
                            <linearGradient id="fcst" x1="0" y1="0" x2="64" y2="40">
                                <stop offset="0" stopColor="#8fe8ff" />
                                <stop offset="1" stopColor="#9a86ff" />
                            </linearGradient>
                        </defs>
                    </svg>
                </div>

                <div className={styles.eyebrow}>天気予報 · THE FORECAST</div>
                <h2 className={styles.title}>Tomorrow&apos;s anime weather, in your inbox</h2>
                <p className={styles.lede}>
                    One dispatch from above the clouds — confirmed dates, real
                    trailers, the drops that matter. Zero noise, ever.
                </p>

                {status === 'success' ? (
                    <div className={styles.success}>
                        <span className={styles.successDot} />
                        You&apos;re on the Forecast. See you above the clouds.
                    </div>
                ) : (
                    <form className={styles.form} onSubmit={handleSubmit}>
                        <input
                            type="email"
                            required
                            placeholder="you@earth.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className={styles.input}
                            aria-label="Email address"
                            disabled={status === 'loading'}
                        />
                        <button
                            type="submit"
                            className={styles.submit}
                            disabled={status === 'loading'}
                        >
                            {status === 'loading' ? 'Sending…' : 'Join the Forecast'}
                        </button>
                    </form>
                )}

                {status === 'error' && (
                    <p className={styles.error}>
                        Signal lost in the clouds — try again in a moment.
                    </p>
                )}

                <p className={styles.footnote}>Free forever · Unsubscribe anytime</p>
            </div>
        </section>
    );
};

export default Forecast;
