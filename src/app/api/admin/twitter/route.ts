import { NextRequest, NextResponse } from 'next/server';
import { scanTwitterAccounts, generateTwitterPost } from '@/lib/engine/twitter-monitor';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { action, hoursBack = 6 } = await req.json();
        
        if (action === 'scan-twitter') {
            console.log(`[API] Manual Twitter scan triggered for last ${hoursBack} hours...`);
            
            const candidates = await scanTwitterAccounts(hoursBack);
            
            if (candidates.length === 0) {
                return NextResponse.json({
                    success: true,
                    message: 'No new Twitter announcements found',
                    found: 0,
                    added: 0,
                    tweets: []
                });
            }
            
            // Add to pending
            const now = new Date();
            let addedCount = 0;
            
            for (const candidate of candidates) {
                const post = generateTwitterPost(candidate, now);
                
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
        console.error('[Twitter API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        status: 'ok',
        message: 'Twitter monitoring API is active',
        monitored_accounts: [
            'Crunchyroll', 'FUNimation', 'AniplexUSA', 'MAPPA_Info',
            'kyoani', 'ufotable', 'toho_animation', 'KadokawaAnime'
        ]
    });
}
