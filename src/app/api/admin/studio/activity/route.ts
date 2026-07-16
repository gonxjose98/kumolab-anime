/**
 * /api/admin/studio/activity — per-user Studio production counts.
 *
 *   GET → { success, stats: [{ name, videos: { last30, allTime },
 *                                    photos: { last30, allTime } }] }
 *
 * Aggregates studio_activity (one row per video finalize / photo Save —
 * autosaves never write rows) by user_name + kind, all-time and last 30
 * days, sorted by all-time output. Uses supabaseAdmin (service role);
 * middleware gates /api/admin/studio/* by session + the 'studio' perm.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface KindCounts { last30: number; allTime: number; }
interface UserStats { name: string; videos: KindCounts; photos: KindCounts; }

export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('studio_activity')
            .select('user_name, kind, created_at')
            .order('created_at', { ascending: false })
            .limit(20000);
        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        const cutoff = Date.now() - 30 * 86_400_000;
        const byUser = new Map<string, UserStats>();
        for (const row of data ?? []) {
            const name = (row.user_name as string) || 'Unknown';
            let u = byUser.get(name);
            if (!u) {
                u = { name, videos: { last30: 0, allTime: 0 }, photos: { last30: 0, allTime: 0 } };
                byUser.set(name, u);
            }
            const bucket = row.kind === 'video' ? u.videos : u.photos;
            bucket.allTime += 1;
            if (row.created_at && new Date(row.created_at).getTime() >= cutoff) bucket.last30 += 1;
        }

        const stats = [...byUser.values()].sort(
            (a, b) => (b.videos.allTime + b.photos.allTime) - (a.videos.allTime + a.photos.allTime));
        return NextResponse.json({ success: true, stats });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
