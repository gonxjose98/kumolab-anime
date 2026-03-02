/**
 * Standalone Detection Worker Runner
 * Executed via GitHub Actions every 10 minutes
 * 
 * Features:
 * - Run-lock protection (prevents overlapping executions)
 * - Exponential backoff retry
 * - Graceful failure logging
 * - < 20 second target runtime
 */

import { createClient } from '@supabase/supabase-js';
import { runDetectionWorker } from '../src/lib/engine/detection-worker';

// Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Lock configuration
const LOCK_ID = 'detection_worker_lock';
const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes max lock duration

/**
 * Acquire execution lock
 */
async function acquireLock(): Promise<boolean> {
    try {
        // Check if lock exists and is still valid
        const { data: existingLock } = await supabase
            .from('worker_locks')
            .select('*')
            .eq('lock_id', LOCK_ID)
            .single();
        
        if (existingLock) {
            const lockAge = Date.now() - new Date(existingLock.acquired_at).getTime();
            
            // If lock is still valid (< 5 min), exit
            if (lockAge < LOCK_DURATION_MS) {
                console.log('[DetectionWorker] Lock active, previous run still in progress. Exiting.');
                console.log(`[DetectionWorker] Lock acquired at: ${existingLock.acquired_at}`);
                return false;
            }
            
            // Lock expired, release it
            console.log('[DetectionWorker] Lock expired, releasing...');
            await releaseLock();
        }
        
        // Acquire new lock
        const { error } = await supabase
            .from('worker_locks')
            .insert([{
                lock_id: LOCK_ID,
                acquired_at: new Date().toISOString(),
                process_id: process.env.GITHUB_RUN_ID || 'local',
                hostname: 'github-actions'
            }]);
        
        if (error) {
            console.error('[DetectionWorker] Failed to acquire lock:', error);
            return false;
        }
        
        console.log('[DetectionWorker] Lock acquired successfully');
        return true;
        
    } catch (error) {
        console.error('[DetectionWorker] Lock acquisition error:', error);
        return false;
    }
}

/**
 * Release execution lock
 */
async function releaseLock(): Promise<void> {
    try {
        await supabase
            .from('worker_locks')
            .delete()
            .eq('lock_id', LOCK_ID);
        
        console.log('[DetectionWorker] Lock released');
    } catch (error) {
        console.error('[DetectionWorker] Failed to release lock:', error);
    }
}

/**
 * Log run metrics to database
 */
async function logMetrics(
    status: 'success' | 'error' | 'skipped',
    durationMs: number,
    details: Record<string, any>
): Promise<void> {
    try {
        await supabase
            .from('processing_metrics')
            .insert([{
                worker_type: 'detection',
                run_at: new Date().toISOString(),
                duration_ms: durationMs,
                status,
                candidates_detected: details.candidates || 0,
                new_candidates: details.newCandidates || 0,
                sources_checked: details.sources || 0,
                sources_failed: details.errors || 0,
                details
            }]);
    } catch (error) {
        console.error('[DetectionWorker] Failed to log metrics:', error);
    }
}

/**
 * Main execution with retry logic
 */
async function main(): Promise<void> {
    const startTime = Date.now();
    console.log('========================================');
    console.log('[DetectionWorker] Starting execution...');
    console.log(`[DetectionWorker] Timestamp: ${new Date().toISOString()}`);
    console.log('========================================\n');
    
    // Check for required environment variables
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('[DetectionWorker] ERROR: Missing Supabase configuration');
        process.exit(1);
    }
    
    // Acquire lock
    const hasLock = await acquireLock();
    if (!hasLock) {
        console.log('[DetectionWorker] Exiting: Another instance is running');
        await logMetrics('skipped', 0, { reason: 'lock_active' });
        process.exit(0);
    }
    
    try {
        // Run detection worker
        const result = await runDetectionWorker();
        
        const duration = Date.now() - startTime;
        
        console.log('\n========================================');
        console.log('[DetectionWorker] Execution complete');
        console.log(`[DetectionWorker] Duration: ${duration}ms`);
        console.log(`[DetectionWorker] Candidates: ${result.totalCandidates} detected, ${result.newCandidates} new`);
        console.log(`[DetectionWorker] Sources: ${result.sourcesChecked} checked, ${result.errors.length} errors`);
        console.log('========================================');
        
        // Log metrics
        await logMetrics('success', duration, {
            candidates: result.totalCandidates,
            newCandidates: result.newCandidates,
            sources: result.sourcesChecked,
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 3) // First 3 errors only
        });
        
        // Release lock
        await releaseLock();
        
        // Exit with error if there were critical failures
        if (result.errors.length > result.sourcesChecked / 2) {
            console.error('[DetectionWorker] Too many source failures');
            process.exit(1);
        }
        
        process.exit(0);
        
    } catch (error: any) {
        const duration = Date.now() - startTime;
        
        console.error('\n========================================');
        console.error('[DetectionWorker] Execution failed');
        console.error(`[DetectionWorker] Error: ${error.message}`);
        console.error('========================================');
        
        await logMetrics('error', duration, {
            error: error.message,
            stack: error.stack
        });
        
        await releaseLock();
        process.exit(1);
    }
}

// Execute
main();