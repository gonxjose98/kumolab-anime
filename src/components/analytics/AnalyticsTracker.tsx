'use client';

import { createClient } from '@supabase/supabase-js';
import { useEffect, useRef, useMemo } from 'react';
import { usePathname } from 'next/navigation';

function getSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
        return null;
    }
    
    return createClient(supabaseUrl, supabaseAnonKey);
}

export function AnalyticsTracker() {
    const supabase = useMemo(() => getSupabase(), []);
    const pathname = usePathname();
    const isFirstRun = useRef(true);
    const lastTrackedPath = useRef<string | null>(null);

    useEffect(() => {
        // Skip if Supabase is not configured
        if (!supabase) return;
        
        // 1. SILENT: Detect Bots
        const userAgent = navigator.userAgent;
        const botRegex = /bot|google|baidu|bing|msn|teoma|slurp|yandex/i;
        const isBot = botRegex.test(userAgent);

        // 2. EXCLUSION: Ignore Admin Routes completely
        if (pathname?.startsWith('/admin')) {
            return;
        }

        // 3. EXCLUSION: Prevent Double-Counting (React Strict Mode safety)
        if (lastTrackedPath.current === pathname) {
            return;
        }

        // FIRE AND FORGET
        async function track() {
            if (!supabase) return;
            try {
                await supabase.from('page_views').insert({
                    path: pathname,
                    referrer: document.referrer || null,
                    user_agent: userAgent,
                    is_bot: isBot
                });
                lastTrackedPath.current = pathname;
            } catch (err) {
                // Fail silently - never block the user
            }
        }

        track();

    }, [pathname, supabase]);

    return null; // Render nothing
}
