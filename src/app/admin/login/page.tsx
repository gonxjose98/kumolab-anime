'use client';

import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    // Create client-side supabase client
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );


    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
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
            // Success -> Redirect to dashboard
            router.push('/admin/dashboard');
            router.refresh(); // Refresh middleware/server state
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'black' }} className="flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 p-8 rounded-lg shadow-2xl relative">
                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500">
                        KumoLab Access
                    </h1>
                    <p className="text-sm text-neutral-500 mt-2">Restricted Area</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded focus:border-purple-500 focus:outline-none transition-colors text-sm text-white placeholder-neutral-400"
                            required
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded focus:border-purple-500 focus:outline-none transition-colors text-sm text-white placeholder-neutral-400"
                            required
                        />
                    </div>

                    {error && (
                        <div className="text-red-500 text-xs text-center">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-white text-black font-semibold rounded hover:bg-neutral-200 transition-colors disabled:opacity-50 text-sm"
                    >
                        {loading ? 'Authenticating...' : 'Enter'}
                    </button>
                </form>
            </div>
        </div>
    );
}
