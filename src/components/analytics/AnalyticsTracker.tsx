'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabase() {
    return createClient(supabaseUrl, supabaseAnonKey);
}
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function AnalyticsTracker() {
    const supabase = getSupabase();
    const pathname = usePathname();
    const isFirstRun = useRef(true);
    const lastTrackedPath = useRef<string | null>(null);

    useEffect(() => {
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
