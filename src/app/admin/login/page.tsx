'use client';

import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import GalaxyBackground from '@/components/shared/GalaxyBackground';

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

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

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
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#06060e' }} className="flex items-center justify-center p-4">
            <GalaxyBackground />
            <div className="w-full max-w-sm relative z-10 p-8 rounded-2xl" style={{ background: 'rgba(12,12,24,0.7)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(30px)', boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }}>
                {/* Ambient glow */}
                <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(123,97,255,0.15) 0%, transparent 70%)' }} />

                <div className="mb-8 text-center relative">
                    <h1 className="text-2xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)', background: 'linear-gradient(135deg, #00d4ff 0%, #7b61ff 50%, #ff3cac 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        KUMOLAB
                    </h1>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] mt-1" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                        Restricted Access
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4 relative">
                    <div>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-neutral-500 outline-none transition-all focus:ring-1"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'var(--font-main)' }}
                            required
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-neutral-500 outline-none transition-all focus:ring-1"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'var(--font-main)' }}
                            required
                        />
                    </div>

                    {error && (
                        <div className="text-xs text-center py-2 px-3 rounded-lg" style={{ color: '#ff4444', background: 'rgba(255,60,60,0.06)', border: '1px solid rgba(255,60,60,0.1)' }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 font-bold rounded-xl text-sm uppercase tracking-wider transition-all disabled:opacity-50 hover:-translate-y-0.5"
                        style={{
                            background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,97,255,0.2))',
                            border: '1px solid rgba(123,97,255,0.3)',
                            color: '#fff',
                            fontFamily: 'var(--font-display)',
                            boxShadow: '0 4px 20px rgba(123,97,255,0.15)',
                        }}
                    >
                        {loading ? 'Authenticating...' : 'Enter'}
                    </button>
                </form>
            </div>
        </div>
    );
}
