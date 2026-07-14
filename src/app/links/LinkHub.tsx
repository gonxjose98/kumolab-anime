'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/lib/analytics/events';
import styles from './LinkHub.module.css';

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function LinkHub({ latest }: { latest: { slug: string; title: string } | null }) {
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
            if (res.ok) trackEvent('email_signup', { meta: { source: 'link_hub' } });
        } catch {
            setStatus('error');
        }
    };

    return (
        <main className={styles.hub}>
            <div className={styles.inner}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.mark} src="/kumolab-cloud-mark-gold.png" alt="" />
                <h1 className={styles.word}>KumoLab</h1>
                <p className={styles.tag}>the cloud sees everything first</p>

                <div className={styles.links}>
                    {latest && (
                        <Link
                            href={`/blog/${latest.slug}`}
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            onClick={() => trackEvent('cta_click', { meta: { hub: 'latest_drop', slug: latest.slug } })}
                        >
                            <span className={styles.btnKicker}>Today&apos;s latest drop</span>
                            <span className={styles.btnMain}>{latest.title}</span>
                        </Link>
                    )}
                    <Link
                        href="/blog"
                        className={styles.btn}
                        onClick={() => trackEvent('cta_click', { meta: { hub: 'all_drops' } })}
                    >
                        Browse all drops
                    </Link>
                    <Link
                        href="/merch"
                        className={styles.btn}
                        onClick={() => trackEvent('cta_click', { meta: { hub: 'shop' } })}
                    >
                        Shop the collection
                    </Link>
                </div>

                <div className={styles.news}>
                    <div className={styles.newsKicker}>天気予報 · The Forecast</div>
                    <p className={styles.newsSub}>One calm email a week. Verified drops, no spam.</p>
                    {status === 'done' ? (
                        <div className={styles.success}>
                            <span className={styles.successKanji}>晴</span> You&apos;re on the list.
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
                            <button type="submit" className={styles.newsBtn} disabled={status === 'loading'}>
                                {status === 'loading' ? 'Joining…' : 'Join'}
                            </button>
                        </form>
                    )}
                    {status === 'error' && <p className={styles.err}>Please try again in a moment.</p>}
                </div>

                <Link
                    href="/"
                    className={styles.explore}
                    onClick={() => trackEvent('cta_click', { meta: { hub: 'home' } })}
                >
                    Explore the full site →
                </Link>
            </div>
        </main>
    );
}
