'use client';

import { useState, FormEvent } from 'react';
import { trackEvent } from '@/lib/analytics/events';
import s from './Forecast.module.css';

type Status = 'idle' | 'loading' | 'done' | 'error';

const PERKS = [
    { label: 'Weekly drop roundup', d: 'M5 5h14v14H5zM5 9h14M9 3v4M15 3v4' },
    { label: 'New trailers and dates', d: 'M6 4h12v16H6zM10 9l5 3-5 3z' },
    { label: 'Confirmed premieres only', d: 'M4 6l8-3 8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9z' },
    { label: 'No spoilers, no spam', d: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18Z' },
];

export default function Forecast() {
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
            if (res.ok) trackEvent('email_signup', { meta: { source: 'homepage_forecast_v3' } });
        } catch {
            setStatus('error');
        }
    };

    return (
        <section id="forecast" className={s.wrap}>
            {/* Jose's reference band (mascot, clouds, plane, note), text removed; copy sits on top. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/home-v3/forecast-band.webp" alt="" className={s.band} loading="lazy" />
            <div className={s.inner}>
                <div className={s.art} aria-hidden="true" />

                <div className={s.copy}>
                    <p className={s.kicker}>The KumoLab Forecast</p>
                    <h2 className={s.title}>Tomorrow&apos;s Anime Weather,<br />In Your Inbox.</h2>
                    <p className={s.sub}>The best new trailers, releases and stories, handpicked and delivered every Sunday.</p>
                    {status === 'done' ? (
                        <p className={s.done}>You&apos;re on the list. Clear skies ahead.</p>
                    ) : (
                        <form className={s.form} onSubmit={submit}>
                            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" aria-label="Email address" className={s.input} />
                            <button type="submit" className={s.btn} disabled={status === 'loading'}>
                                {status === 'loading' ? 'Joining' : <>Join the forecast <span aria-hidden="true">→</span></>}
                            </button>
                        </form>
                    )}
                    {status === 'error' && <p className={s.err}>Something went wrong. Please try again in a moment.</p>}
                </div>

                <ul className={s.perks}>
                    {PERKS.map((p) => (
                        <li key={p.label}>
                            <span className={s.perkIcon}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={p.d} /></svg></span>
                            {p.label}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
