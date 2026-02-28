import { NextRequest, NextResponse } from 'next/server';
import { scanRSSFeeds, generateRSSPost } from '@/lib/engine/expanded-rss';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { detectDuplicate } from '@/lib/engine/duplicate-prevention';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { action, hoursBack = 6 } = await req.json();
        
        if (action === 'scan-rss') {
            console.log(`[API] Manual RSS scan triggered for last ${hoursBack} hours...`);
            
            const candidates = await scanRSSFeeds(hoursBack);
            
            if (candidates.length === 0) {
                return NextResponse.json({
                    success: true,
                    message: 'No new RSS articles found',
                    found: 0,
                    added: 0,
                    articles: []
                });
            }
            
            // Add to pending (with duplicate check)
            const now = new Date();
            let addedCount = 0;
            const articles = [];
            
            for (const candidate of candidates) {
                const post = generateRSSPost(candidate, now);
                
                // Check duplicates
                const dupCheck = await detectDuplicate(post, { checkWindow: 24 });
                if (dupCheck.action === 'BLOCK') {
                    console.log(`[API] Skipping duplicate: ${post.title}`);
                    continue;
                }
                
                const { error } = await supabaseAdmin
                    .from('posts')
                    .insert([post]);
                
                if (!error) {
                    addedCount++;
                    articles.push({
                        title: post.title,
                        source: candidate.sourceName,
                        language: candidate.language
                    });
                }
            }
            
            return NextResponse.json({
                success: true,
                message: `Found ${candidates.length} articles, added ${addedCount} to pending`,
                found: candidates.length,
                added: addedCount,
                articles
            });
        }
        
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        
    } catch (error: any) {
        console.error('[RSS API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const view = searchParams.get('view');
    
    // View rejection logs
    if (view === 'rejection-logs') {
        const hours = parseInt(searchParams.get('hours') || '24');
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        
        const { data, error } = await supabaseAdmin
            .from('rejection_logs')
            .select('*')
            .gte('timestamp', cutoff)
            .order('timestamp', { ascending: false })
            .limit(100);
        
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        
        // Group by reason
        const byReason = data?.reduce((acc, log) => {
            acc[log.reason] = (acc[log.reason] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        return NextResponse.json({
            total: data?.length || 0,
            byReason,
            logs: data
        });
    }
    
    // Default: return source status
    return NextResponse.json({
        status: 'ok',
        message: 'RSS monitoring API is active',
        sources: [
            { name: 'MyAnimeList News', language: 'EN', tier: 2 },
            { name: 'OtakuNews', language: 'EN', tier: 2 },
            { name: 'Anime News Network', language: 'EN', tier: 2 },
            { name: 'Natalie.mu Anime', language: 'JP', tier: 1 },
            { name: 'Oricon Anime', language: 'JP', tier: 1 },
        ],
        endpoints: {
            scan: 'POST /api/admin/rss { action: "scan-rss", hoursBack: 6 }',
            logs: 'GET /api/admin/rss?view=rejection-logs&hours=24'
        }
    });
}
