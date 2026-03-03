import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Get first pending candidate
        const { data: candidates, error: fetchError } = await supabaseAdmin
            .from('detection_candidates')
            .select('*')
            .eq('status', 'pending_processing')
            .limit(1);
        
        if (fetchError) {
            return NextResponse.json({ error: fetchError }, { status: 500 });
        }
        
        if (!candidates || candidates.length === 0) {
            return NextResponse.json({ message: 'No pending candidates' });
        }
        
        const candidate = candidates[0];
        
        // Try to create post with exact same logic as Processing Worker
        const now = new Date().toISOString();
        const post = {
            title: candidate.title.substring(0, 200),
            slug: `debug-${Date.now().toString(36)}`,
            type: 'INTEL',
            claim_type: 'OTHER',
            content: candidate.content,
            excerpt: candidate.content ? candidate.content.substring(0, 200) + '...' : '',
            image: candidate.media_urls && candidate.media_urls.length > 0 ? candidate.media_urls[0] : null,
            source_url: candidate.canonical_url || candidate.source_url,
            source: candidate.source_name,
            source_tier: candidate.source_tier || 2,
            timestamp: now,
            status: 'pending',
            scraped_at: candidate.detected_at || now,
            fingerprint: candidate.fingerprint,
            headline: candidate.title.substring(0, 100)
        };
        
        const { data, error } = await supabaseAdmin
            .from('posts')
            .insert([post])
            .select();
        
        if (error) {
            return NextResponse.json({
                success: false,
                candidate: candidate.id,
                error: error,
                post_data: post
            }, { status: 500 });
        }
        
        return NextResponse.json({
            success: true,
            post: data
        });
        
    } catch (err: any) {
        return NextResponse.json({
            success: false,
            error: err.message,
            stack: err.stack
        }, { status: 500 });
    }
}
