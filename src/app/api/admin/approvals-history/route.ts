import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET - Fetch approval history (approved + published + declined posts)
export async function GET() {
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('id, title, image, status, type, approved_at, approved_by, scheduled_post_time, source_tier, is_published, timestamp')
        .in('status', ['approved', 'published', 'declined'])
        .order('approved_at', { ascending: false, nullsFirst: false })
        .order('timestamp', { ascending: false })
        .limit(200);

    if (error) {
        console.error('[Approvals History API] Error:', error);
        return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(data || []);
}
