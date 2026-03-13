import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getSchedulerLogs } from '@/lib/logging/scheduler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/logs?type=action|scraper|error|agent|scheduler&limit=50
 * Unified log viewer endpoint — serves all 4 log channels
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'scheduler';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    try {
        if (type === 'scheduler') {
            // Legacy: original scheduler logs
            const logs = await getSchedulerLogs(limit);
            return NextResponse.json({ success: true, logs });
        }

        if (type === 'action') {
            const { data } = await supabaseAdmin.from('action_logs').select('*').order('created_at', { ascending: false }).limit(limit);
            return NextResponse.json(data || []);
        }

        if (type === 'scraper') {
            const { data } = await supabaseAdmin.from('scraper_logs').select('*').order('created_at', { ascending: false }).limit(limit);
            return NextResponse.json(data || []);
        }

        if (type === 'error') {
            const { data } = await supabaseAdmin.from('error_logs').select('*').order('created_at', { ascending: false }).limit(limit);
            return NextResponse.json(data || []);
        }

        if (type === 'agent') {
            const { data } = await supabaseAdmin.from('agent_activity_log').select('*').order('created_at', { ascending: false }).limit(limit);
            return NextResponse.json(data || []);
        }

        return NextResponse.json({ error: 'Invalid type. Use: scheduler, action, scraper, error, agent' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
