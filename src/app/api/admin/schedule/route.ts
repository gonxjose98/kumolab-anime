
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
    try {
        const { postId, scheduledTime } = await req.json();

        if (!postId || !scheduledTime) {
            return NextResponse.json({ success: false, error: 'postId and scheduledTime are required' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('posts')
            .update({
                scheduled_post_time: new Date(scheduledTime).toISOString()
            })
            .eq('id', postId);

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
