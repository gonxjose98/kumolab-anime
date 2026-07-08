'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark';

/**
 * Light / dark switch for the admin. Writes the choice to
 * <html data-admin-theme> (which drives every token via tokens.css) and
 * remembers it in localStorage. The pre-paint script in admin/layout.tsx sets
 * the attribute on load so there's no flash.
 */
export default function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>('light');

    useEffect(() => {
        const cur = (document.documentElement.dataset.adminTheme as Theme) || 'light';
        setTheme(cur);
    }, []);

    const apply = (t: Theme) => {
        document.documentElement.dataset.adminTheme = t;
        try { localStorage.setItem('kumolab-admin-theme', t); } catch { /* ignore */ }
        setTheme(t);
    };

    return (
        <div className="ak-themetoggle" role="group" aria-label="Theme">
            <button className={theme === 'light' ? 'is-active' : ''} onClick={() => apply('light')} aria-pressed={theme === 'light'}>
                <Sun size={13} /> Light
            </button>
            <button className={theme === 'dark' ? 'is-active' : ''} onClick={() => apply('dark')} aria-pressed={theme === 'dark'}>
                <Moon size={13} /> Dark
            </button>
        </div>
    );
}
