'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [password, setPassword] = useState('');
    const router = useRouter();
    const [error, setError] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/auth', {
            method: 'POST',
            body: JSON.stringify({ password }),
        });

        if (res.ok) {
            router.push('/admin/dashboard');
        } else {
            setError(true);
        }
    };

    return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '300px' }}>
                <h1 style={{ textAlign: 'center' }}>Admin Access</h1>
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ padding: '0.8rem', borderRadius: '4px', border: '1px solid #333', background: '#111', color: '#fff' }}
                />
                {error && <p style={{ color: 'red', fontSize: '0.9rem' }}>Invalid password</p>}
                <button type="submit" style={{ padding: '0.8rem', background: '#6d28d9', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Enter
                </button>
            </form>
        </div>
    );
}
