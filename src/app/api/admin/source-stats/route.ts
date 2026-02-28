import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** GET — Returns post counts grouped by source, with time filtering */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const period = searchParams.get('period') || 'all'; // day, week, month, all

        // Calculate cutoff date
        let cutoff: string | null = null;
        const now = new Date();

        if (period === 'day') {
            cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        } else if (period === 'week') {
            cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (period === 'month') {
            cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        }

        // Fetch posts with source field
        let query = supabaseAdmin
            .from('posts')
            .select('source, timestamp, status');

        if (cutoff) {
            query = query.gte('timestamp', cutoff);
        }

        const { data: posts, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Group by source
        const counts: Record<string, { total: number; pending: number; approved: number; published: number }> = {};

        for (const post of posts || []) {
            const source = post.source || 'Unknown';
            if (!counts[source]) {
                counts[source] = { total: 0, pending: 0, approved: 0, published: 0 };
            }
            counts[source].total++;

            if (post.status === 'pending') counts[source].pending++;
            else if (post.status === 'approved') counts[source].approved++;
            else if (post.status === 'published') counts[source].published++;
        }

        // Sort by total (descending)
        const sorted = Object.entries(counts)
            .sort(([, a], [, b]) => b.total - a.total)
            .map(([source, stats]) => ({ source, ...stats }));

        return NextResponse.json({
            period,
            totalPosts: posts?.length || 0,
            sources: sorted,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
