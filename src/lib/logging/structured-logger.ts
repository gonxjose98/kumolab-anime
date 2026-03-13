/**
 * Structured Logger — Central logging for all KumoLab operations
 *
 * 3 log channels:
 * 1. Action Logs   — post lifecycle (approved, rejected, published, deleted, hidden)
 * 2. Scraper Logs  — every detection/processing decision with 1-5 word reason
 * 3. Error Logs    — system errors from any source
 *
 * Also writes to agent_activity_log for agent-specific actions.
 */

import { supabaseAdmin } from '../supabase/admin';

// ── Action Log ──────────────────────────────────────────────

export type ActionType =
    | 'approved' | 'auto_approved' | 'declined' | 'published'
    | 'deleted' | 'hidden' | 'reverted' | 'scheduled'
    | 'created' | 'updated';

export async function logAction(params: {
    action: ActionType;
    entityType?: string;
    entityId?: string;
    entityTitle?: string;
    actor?: string;
    reason?: string;
    details?: Record<string, any>;
}) {
    try {
        await supabaseAdmin.from('action_logs').insert({
            action: params.action,
            entity_type: params.entityType || 'post',
            entity_id: params.entityId || null,
            entity_title: params.entityTitle || null,
            actor: params.actor || 'system',
            reason: params.reason || null,
            details: params.details || null,
            created_at: new Date().toISOString(),
        });
    } catch (e) {
        console.error('[ActionLog] Failed to write:', e);
    }
}

// ── Scraper Log ─────────────────────────────────────────────

export type ScraperDecision =
    | 'accepted_pending' | 'accepted_auto'
    | 'rejected_duplicate' | 'rejected_score'
    | 'rejected_no_image' | 'rejected_error' | 'retry';

export async function logScraperDecision(params: {
    candidateTitle: string;
    sourceName?: string;
    sourceTier?: number;
    sourceUrl?: string;
    decision: ScraperDecision;
    reason: string;
    score?: number;
    scoreBreakdown?: Record<string, any>;
    duplicateOf?: string;
}) {
    try {
        await supabaseAdmin.from('scraper_logs').insert({
            candidate_title: params.candidateTitle,
            source_name: params.sourceName || null,
            source_tier: params.sourceTier || null,
            source_url: params.sourceUrl || null,
            decision: params.decision,
            reason: params.reason,
            score: params.score ?? null,
            score_breakdown: params.scoreBreakdown || null,
            duplicate_of: params.duplicateOf || null,
            created_at: new Date().toISOString(),
        });
    } catch (e) {
        console.error('[ScraperLog] Failed to write:', e);
    }
}

// ── Error Log ───────────────────────────────────────────────

export async function logError(params: {
    source: string;
    errorMessage: string;
    stackTrace?: string;
    context?: Record<string, any>;
}) {
    try {
        await supabaseAdmin.from('error_logs').insert({
            source: params.source,
            error_message: params.errorMessage,
            stack_trace: params.stackTrace || null,
            context: params.context || null,
            created_at: new Date().toISOString(),
        });
    } catch (e) {
        console.error('[ErrorLog] Failed to write:', e);
    }
}

// ── Agent Activity Log ──────────────────────────────────────

export async function logAgentAction(params: {
    agentName: string;
    action: string;
    details?: string;
    relatedTaskId?: string;
    relatedPostId?: string;
}) {
    try {
        await supabaseAdmin.from('agent_activity_log').insert({
            agent_name: params.agentName,
            action: params.action,
            details: params.details || null,
            related_task_id: params.relatedTaskId || null,
            related_post_id: params.relatedPostId || null,
            created_at: new Date().toISOString(),
        });
    } catch (e) {
        console.error('[AgentLog] Failed to write:', e);
    }
}
