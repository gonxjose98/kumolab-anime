/**
 * Daily Pipeline Report Card Generator
 *
 * Runs nightly (11 PM EST) to compile the day's pipeline metrics,
 * content quality distribution, and agent performance into a single report.
 *
 * This is the "Oracle Report" — the accountability backbone of KumoLab.
 */

import { supabaseAdmin } from '../supabase/admin';
import { logAgentAction } from '../logging/structured-logger';

export interface DailyReport {
    report_date: string;
    sources_checked: number;
    candidates_found: number;
    candidates_accepted: number;
    candidates_rejected: number;
    candidates_duplicate: number;
    posts_created: number;
    posts_published: number;
    posts_approved: number;
    posts_declined: number;
    errors_count: number;
    retries_count: number;
    avg_content_score: number;
    avg_quality_grade: string;
    grade_distribution: Record<string, number>;
    agent_scores: Record<string, any>;
    headline: string;
    issues: string[];
    highlights: string[];
}

export async function generateDailyReport(): Promise<DailyReport> {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const dayStart = `${dateStr}T00:00:00`;
    const dayEnd = `${dateStr}T23:59:59`;

    // ── Gather scraper logs for the day ──
    const { data: scraperLogs } = await supabaseAdmin
        .from('scraper_logs')
        .select('decision, score, source_tier')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);

    const logs = scraperLogs || [];
    const accepted = logs.filter(l => l.decision?.startsWith('accepted'));
    const rejected = logs.filter(l => l.decision?.startsWith('rejected'));
    const duplicates = logs.filter(l => l.decision === 'rejected_duplicate');
    const retries = logs.filter(l => l.decision === 'retry');
    const scores = logs.filter(l => l.score != null).map(l => l.score);
    const avgScore = scores.length > 0
        ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 100) / 100
        : 0;

    // ── Gather error logs ──
    const { count: errorCount } = await supabaseAdmin
        .from('error_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);

    // ── Gather action logs ──
    const { data: actionLogs } = await supabaseAdmin
        .from('action_logs')
        .select('action')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);

    const actions = actionLogs || [];
    const published = actions.filter(a => a.action === 'published').length;
    const approved = actions.filter(a => a.action === 'approved' || a.action === 'auto_approved').length;
    const declined = actions.filter(a => a.action === 'declined').length;
    const created = actions.filter(a => a.action === 'created').length;

    // ── Posts quality grades ──
    const { data: gradedPosts } = await supabaseAdmin
        .from('posts')
        .select('quality_grade')
        .not('quality_grade', 'is', null)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);

    const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const p of (gradedPosts || [])) {
        if (p.quality_grade && gradeDistribution[p.quality_grade] !== undefined) {
            gradeDistribution[p.quality_grade]++;
        }
    }

    const totalGraded = Object.values(gradeDistribution).reduce((a, b) => a + b, 0);
    let avgGrade = 'N/A';
    if (totalGraded > 0) {
        const gradeValues: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
        const gpa = Object.entries(gradeDistribution)
            .reduce((sum, [g, count]) => sum + (gradeValues[g] || 0) * count, 0) / totalGraded;
        if (gpa >= 3.5) avgGrade = 'A';
        else if (gpa >= 2.5) avgGrade = 'B';
        else if (gpa >= 1.5) avgGrade = 'C';
        else if (gpa >= 0.5) avgGrade = 'D';
        else avgGrade = 'F';
    }

    // ── Source health check ──
    const { data: sourceHealth } = await supabaseAdmin
        .from('source_health')
        .select('source_name, consecutive_failures, last_success')
        .gt('consecutive_failures', 2);

    // ── Agent performance ──
    const agentScores: Record<string, any> = {};

    // Scraper agent
    agentScores['Scraper'] = {
        candidates_found: logs.length,
        accepted: accepted.length,
        rejected: rejected.length,
        duplicates: duplicates.length,
        error_rate: logs.length > 0
            ? Math.round((logs.filter(l => l.decision === 'rejected_error').length / logs.length) * 100)
            : 0,
        score: Math.min(100, Math.round(
            (accepted.length > 0 ? 40 : 0) +
            (logs.length >= 10 ? 20 : logs.length * 2) +
            (duplicates.length < logs.length * 0.5 ? 20 : 5) +
            ((errorCount || 0) === 0 ? 20 : Math.max(0, 20 - (errorCount || 0) * 5))
        )),
    };

    // Publisher agent
    agentScores['Publisher'] = {
        posts_published: published,
        posts_approved: approved,
        on_time: true, // would need scheduled vs actual comparison for real tracking
        score: Math.min(100, published * 25 + approved * 10),
    };

    // ── Generate headline & insights ──
    const issues: string[] = [];
    const highlights: string[] = [];

    if (logs.length === 0) {
        issues.push('No candidates detected today — scraper may be down');
    }
    if (accepted.length === 0 && logs.length > 0) {
        issues.push('All candidates rejected — scoring may be too aggressive');
    }
    if ((errorCount || 0) > 5) {
        issues.push(`${errorCount} errors logged — investigate error_logs table`);
    }
    if (sourceHealth && sourceHealth.length > 0) {
        const failedSources = sourceHealth.map((s: any) => s.source_name).join(', ');
        issues.push(`Unhealthy sources: ${failedSources}`);
    }
    if (duplicates.length > logs.length * 0.6) {
        issues.push('Over 60% of candidates are duplicates — sources may be overlapping');
    }

    if (published > 0) {
        highlights.push(`${published} post${published > 1 ? 's' : ''} published today`);
    }
    if (gradeDistribution.A > 0) {
        highlights.push(`${gradeDistribution.A} A-grade content piece${gradeDistribution.A > 1 ? 's' : ''} created`);
    }
    if (accepted.length > 5) {
        highlights.push(`Strong detection day: ${accepted.length} candidates accepted`);
    }
    if ((errorCount || 0) === 0 && logs.length > 0) {
        highlights.push('Zero errors — clean pipeline run');
    }

    let headline: string;
    if (issues.length === 0 && highlights.length > 0) {
        headline = `Great day — ${highlights[0]}`;
    } else if (issues.length > 0 && highlights.length === 0) {
        headline = `Needs attention — ${issues[0]}`;
    } else if (logs.length === 0) {
        headline = 'Quiet day — no pipeline activity detected';
    } else {
        headline = `Mixed results: ${accepted.length} accepted, ${rejected.length} rejected, ${errorCount || 0} errors`;
    }

    const report: DailyReport = {
        report_date: dateStr,
        sources_checked: logs.length, // approximate
        candidates_found: logs.length,
        candidates_accepted: accepted.length,
        candidates_rejected: rejected.length,
        candidates_duplicate: duplicates.length,
        posts_created: created,
        posts_published: published,
        posts_approved: approved,
        posts_declined: declined,
        errors_count: errorCount || 0,
        retries_count: retries.length,
        avg_content_score: avgScore,
        avg_quality_grade: avgGrade,
        grade_distribution: gradeDistribution,
        agent_scores: agentScores,
        headline,
        issues,
        highlights,
    };

    // ── Persist to DB ──
    await supabaseAdmin.from('daily_reports').upsert(report, { onConflict: 'report_date' });

    // ── Save agent performance snapshots ──
    for (const [agentName, metrics] of Object.entries(agentScores)) {
        await supabaseAdmin.from('agent_performance').upsert({
            agent_name: agentName,
            report_date: dateStr,
            items_processed: (metrics as any).candidates_found || (metrics as any).posts_published || 0,
            errors: agentName === 'Scraper' ? (errorCount || 0) : 0,
            quality_score: (metrics as any).score || 0,
            details: metrics,
        }, { onConflict: 'agent_name,report_date' });
    }

    // ── Log agent activity ──
    await logAgentAction({
        agentName: 'Oracle',
        action: 'generated daily report',
        details: `${headline} | ${accepted.length} accepted, ${rejected.length} rejected, ${published} published`,
    });

    return report;
}
