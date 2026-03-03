import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
    try {
        // Hide all posts that are LIVE but shouldn't be (no approval)
        // This fixes the auto-publishing bug
        
        const { data, error } = await supabaseAdmin
            .from('posts')
            .update({ 
                is_published: false,
                status: 'pending'
            })
            .eq('is_published', true)
            .eq('status', 'pending')  // These were auto-published without approval
            .select();
        
        if (error) {
            console.error('[HideUnapproved] Error:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        
        console.log(`[HideUnapproved] Hidden ${data?.length || 0} unauthorized posts`);
        return NextResponse.json({ 
            success: true, 
            message: `Hidden ${data?.length || 0} unauthorized posts`,
            posts: data?.map(p => ({ id: p.id, title: p.title }))
        });
    } catch (e: any) {
        console.error('[HideUnapproved] Fatal error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
