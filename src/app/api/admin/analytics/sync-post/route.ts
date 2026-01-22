
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchSocialMetrics } from '@/lib/social/analytics';

// Admin context
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

export async function POST(req: NextRequest) {
    try {
        const { postId } = await req.json();

        if (!postId) {
            return NextResponse.json({ success: false, error: 'Post ID required' }, { status: 400 });
        }

        // 1. Fetch Post (Social IDs)
        const { data: post, error } = await supabaseAdmin
            .from('posts')
            .select('*')
            .eq('id', postId)
            .single();

        if (error || !post) {
            return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
        }

        // 2. Fetch Fresh Metrics
        // IDs are stored in social_ids column (JSONB) or individual columns?
        // Based on our Types update, we expect social_ids JSON.
        // But DB might have snake_case keys or flat columns.
        // We'll adapt based on likely existing structure or what we just typed.
        // Assuming we need to support what's there.
        // If social_ids is null, check for flat columns (legacy support)
        const ids = post.social_ids || {
            twitter: post.twitter_id,
            instagram: post.instagram_id,
            facebook: post.facebook_id
        };

        const metrics = await fetchSocialMetrics(ids);

        // 3. Update DB
        const socialMetrics = {
            ...post.social_metrics,
            ...metrics,
            updatedAt: new Date().toISOString()
        };

        await supabaseAdmin
            .from('posts')
            .update({ social_metrics: socialMetrics })
            .eq('id', postId);

        return NextResponse.json({ success: true, metrics: socialMetrics });

    } catch (e: any) {
        console.error('Sync Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
