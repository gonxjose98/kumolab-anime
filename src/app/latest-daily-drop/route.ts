import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Hero "View Today's Drops" CTA target. Redirects to the most recent
// published Daily Drop post; falls back to /blog only when no drop has
// ever been published. Uses the service-role client because public RLS
// on `posts` is service-role-only (per architecture) — the previous
// anon-key client read returned zero rows for unauthenticated visitors,
// which is why the button was always landing on /blog.
export async function GET(request: Request) {
    const { data: latestDrop } = await supabaseAdmin
        .from('posts')
        .select('slug')
        .eq('type', 'DROP')
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .single();

    const url = new URL(request.url);
    if (latestDrop?.slug) {
        return NextResponse.redirect(new URL(`/blog/${latestDrop.slug}`, url.origin));
    }
    return NextResponse.redirect(new URL('/blog', url.origin));
}
