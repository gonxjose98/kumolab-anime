import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET - Fetch recent agent activity
export async function GET() {
    const { data, error } = await supabaseAdmin
        .from('agent_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('[Activity API] Fetch error:', error);
        // Fallback: build activity from scheduler_logs and processing_metrics
        return await getFallbackActivity();
    }

    // If the dedicated table is empty, also try fallback
    if (!data || data.length === 0) {
        return await getFallbackActivity();
    }

    return NextResponse.json(data);
}

async function getFallbackActivity() {
    const activities: any[] = [];

    // Pull from scheduler_logs
    const { data: logs } = await supabaseAdmin
        .from('scheduler_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(30);

    if (logs) {
        for (const log of logs) {
            activities.push({
                id: log.id,
                agent_name: log.slot === '06:00' ? 'Publisher' : 'Scraper',
                action: `ran ${log.slot} cron — ${log.status}`,
                details: log.message,
                created_at: log.timestamp,
            });
        }
    }

    // Pull from processing_metrics
    const { data: metrics } = await supabaseAdmin
        .from('processing_metrics')
        .select('*')
        .order('run_at', { ascending: false })
        .limit(20);

    if (metrics) {
        for (const m of metrics) {
            const agent = m.worker_type === 'detection' ? 'Scraper' : 'Publisher';
            activities.push({
                id: m.id,
                agent_name: agent,
                action: `${m.worker_type} worker completed`,
                details: m.worker_type === 'detection'
                    ? `Detected ${m.candidates_detected || 0} candidates from ${m.sources_checked || 0} sources`
                    : `Processed ${m.candidates_processed || 0}, accepted ${m.accepted_posts || 0}`,
                created_at: m.run_at,
            });
        }
    }

    // Sort by date
    activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json(activities.slice(0, 50));
}
