import { NextRequest, NextResponse } from 'next/server';
import { scanXAccounts, generateXPost, MONITORED_ACCOUNTS } from '@/lib/engine/x-monitor';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Manual X/Twitter scan endpoint.
 * Uses X API v2 (Nitter fallback removed 2026-03-12).
 */
export async function POST(req: NextRequest) {
    try {
        const { action, hoursBack = 6 } = await req.json();

        if (action === 'scan-twitter') {
            console.log(`[API] Manual X scan triggered for last ${hoursBack} hours...`);

            const candidates = await scanXAccounts(hoursBack);

            if (candidates.length === 0) {
                return NextResponse.json({
                    success: true,
                    message: 'No new X announcements found',
                    found: 0,
                    added: 0,
                    tweets: []
                });
            }

            // Add to pending
            const now = new Date();
            let addedCount = 0;

            for (const candidate of candidates) {
                const post = generateXPost(candidate, now);

                const { error } = await supabaseAdmin
                    .from('posts')
                    .insert([post]);

                if (!error) {
                    addedCount++;
                }
            }

            return NextResponse.json({
                success: true,
                message: `Found ${candidates.length} tweets, added ${addedCount} to pending`,
                found: candidates.length,
                added: addedCount,
                tweets: candidates.map(t => ({
                    text: t.text.substring(0, 100),
                    author: t.authorHandle,
                    url: t.url
                }))
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        console.error('[X API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        status: 'ok',
        message: 'X (Twitter) monitoring API is active (X API v2)',
        monitored_accounts: MONITORED_ACCOUNTS.map((a: { handle: string; name: string; tier: number }) => ({
            handle: a.handle,
            name: a.name,
            tier: a.tier
        }))
    });
}
