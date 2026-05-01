import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { createFingerprint } from '@/lib/engine/utils';

export const dynamic = 'force-dynamic';

// Public reads here are intentionally narrowed to status='published'. Admin
// callers (with a valid Supabase session) can pass arbitrary status / hidden
// filters; everyone else gets only the live blog.
async function isAuthenticatedAdmin(): Promise<boolean> {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
        );
        const { data, error } = await supabase.auth.getUser();
        return !error && !!data?.user;
    } catch {
        return false;
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const requestedStatus = searchParams.get('status');
        const type = searchParams.get('type');
        const limit = parseInt(searchParams.get('limit') || '50');
        const slug = searchParams.get('slug');
        const id = searchParams.get('id');

        const isAdmin = await isAuthenticatedAdmin();

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Single post by slug/id — public callers only see published posts.
        if (slug || id) {
            let query = supabase.from('posts').select('*');
            if (slug) query = query.eq('slug', slug);
            if (id) query = query.eq('id', id);
            if (!isAdmin) query = query.eq('is_published', true).eq('status', 'published');

            const { data, error } = await query.maybeSingle();

            if (error || !data) {
                return NextResponse.json({ error: 'Post not found' }, { status: 404 });
            }

            return NextResponse.json(data);
        }

        // List endpoint — public callers always get status='published'; admin
        // callers can request a different status via the query param.
        let query = supabase
            .from('posts')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (isAdmin && requestedStatus) {
            query = query.eq('status', requestedStatus);
        } else {
            query = query.eq('status', 'published').eq('is_published', true);
        }
        if (type) query = query.eq('type', type);

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'Post ID required' }, { status: 400 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Only allow safe fields to be updated
        const allowedFields = [
            'status', 'is_published', 'scheduled_post_time',
            'title', 'content', 'excerpt', 'image', 'type',
            'source_url', 'timestamp', 'claim_type',
        ];
        const safeUpdates: Record<string, any> = {};
        for (const key of allowedFields) {
            if (key in updates) {
                safeUpdates[key] = updates[key];
            }
        }

        if (Object.keys(safeUpdates).length === 0) {
            return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('posts')
            .update(safeUpdates)
            .eq('id', id)
            .select();

        if (error) {
            console.error('[API /posts PUT] Error:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
        }

        // Use supabaseAdmin to ensure service_role key (bypasses RLS)
        const { supabaseAdmin } = await import('@/lib/supabase/admin');

        // Fetch post BEFORE deleting — need title + source_url to build the
        // fingerprint that goes into seen_fingerprints (the v2 dedup memory).
        const { data: post } = await supabaseAdmin
            .from('posts')
            .select('id, title, slug, source, source_url, claim_type, anime_id')
            .eq('id', id)
            .single();

        // Record in seen_fingerprints (origin='declined') so the detection worker
        // never re-detects this. Replaces the old declined_posts table from v1.
        if (post && post.title && post.source_url) {
            const { error: trackError } = await supabaseAdmin
                .from('seen_fingerprints')
                .upsert({
                    fingerprint: createFingerprint(post.title, post.source_url),
                    anime_id: post.anime_id ?? null,
                    claim_type: post.claim_type ?? null,
                    origin: 'declined' as const,
                    source_url: post.source_url,
                    seen_at: new Date().toISOString(),
                }, { onConflict: 'fingerprint' });

            if (trackError) {
                console.warn('[API] Could not record fingerprint for deleted post:', trackError.message);
            }
        }

        const { data: deleted, error } = await supabaseAdmin
            .from('posts')
            .delete()
            .eq('id', id)
            .select('id');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!deleted || deleted.length === 0) {
            return NextResponse.json({ error: 'No rows deleted — post may not exist or RLS blocked the operation' }, { status: 404 });
        }

        const { revalidatePath } = await import('next/cache');
        revalidatePath('/admin/dashboard');

        return NextResponse.json({ success: true, message: 'Post deleted' });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
