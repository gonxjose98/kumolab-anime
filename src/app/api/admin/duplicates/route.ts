import { NextRequest, NextResponse } from 'next/server';
import { checkExistingDuplicates } from '@/lib/engine/duplicate-checker';
import { getDuplicateStats } from '@/lib/engine/duplicate-prevention';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const action = searchParams.get('action') || 'stats';
        
        if (action === 'scan') {
            // Full duplicate scan
            const results = await checkExistingDuplicates();
            return NextResponse.json(results);
        }
        
        if (action === 'stats') {
            // Quick stats
            const stats = await getDuplicateStats();
            return NextResponse.json(stats);
        }
        
        if (action === 'pending') {
            // Check pending duplicates
            const { data: pendingPosts } = await supabaseAdmin
                .from('posts')
                .select('*')
                .eq('status', 'pending')
                .eq('is_duplicate', true);
            
            return NextResponse.json({
                pendingDuplicates: pendingPosts || [],
                count: pendingPosts?.length || 0
            });
        }
        
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        
    } catch (error: any) {
        console.error('[Duplicates API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { action, postId, originalId } = await req.json();
        
        if (action === 'mark-duplicate') {
            await supabaseAdmin
                .from('posts')
                .update({
                    is_duplicate: true,
                    duplicate_of: originalId,
                    status: 'declined',
                    decline_reason: 'Marked as duplicate'
                })
                .eq('id', postId);
            
            return NextResponse.json({ success: true });
        }
        
        if (action === 'merge-duplicates') {
            // Keep the most recent/verified post, decline others
            const { data: duplicates } = await supabaseAdmin
                .from('posts')
                .select('*')
                .eq('duplicate_of', originalId)
                .neq('id', originalId);
            
            if (duplicates && duplicates.length > 0) {
                for (const dup of duplicates) {
                    await supabaseAdmin
                        .from('posts')
                        .update({
                            status: 'declined',
                            decline_reason: `Merged into ${originalId}`
                        })
                        .eq('id', dup.id);
                }
            }
            
            return NextResponse.json({ 
                success: true, 
                merged: duplicates?.length || 0 
            });
        }
        
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        
    } catch (error: any) {
        console.error('[Duplicates API] POST Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
