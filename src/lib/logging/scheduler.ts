
import { supabaseAdmin } from '../supabase/admin';

export type SchedulerStatus = 'success' | 'skipped' | 'error' | 'running';

export async function logSchedulerRun(
    slot: string,
    status: SchedulerStatus,
    message: string,
    details?: any
) {
    try {
        const { error } = await supabaseAdmin
            .from('scheduler_logs')
            .insert([{
                slot,
                status,
                message,
                details: details ? JSON.stringify(details) : null,
                timestamp: new Date().toISOString()
            }]);

        if (error) {
            console.error('[SchedulerLogger] DB Error:', error.message);
        } else {
            console.log(`[SchedulerLogger] Logged: ${slot} - ${status}`);
        }
    } catch (e) {
        console.error('[SchedulerLogger] Exception:', e);
    }
}

export async function getSchedulerLogs(limit = 50) {
    const { data, error } = await supabaseAdmin
        .from('scheduler_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}
