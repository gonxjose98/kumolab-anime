'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import '../tokens.css';
import '../admin.css';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const supabase = useMemo(() => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) return null;
        return createBrowserClient(url, key);
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!supabase) {
            setError('Authentication service unavailable');
            return;
        }

        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            console.error('Login error:', error);
            setError(error.message);
            setLoading(false);
        } else {
            router.push('/admin/dashboard');
            router.refresh();
        }
    };

    return (
        <div className="admin-root ak-auth">
            <div className="ak-auth__clouds" aria-hidden="true" />
            <div className="ak-auth__card">
                <div className="ak-auth__brand">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="ak-auth__mark" src="/kumolab-cloud-mark-gold.png" alt="KumoLab" />
                    <span className="ak-auth__title">KumoLab</span>
                    <span className="ak-auth__sub">Admin Console</span>
                </div>

                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <label className="ak-field">
                        <span className="ak-field__label">Email</span>
                        <input
                            type="email"
                            className="ak-field__input"
                            placeholder="you@kumolab.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </label>
                    <label className="ak-field">
                        <span className="ak-field__label">Password</span>
                        <input
                            type="password"
                            className="ak-field__input"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </label>

                    {error && <div className="ak-auth__err">{error}</div>}

                    <button type="submit" disabled={loading} className="ak-btn ak-btn--primary ak-btn--block">
                        {loading ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
            </div>
        </div>
    );
}
