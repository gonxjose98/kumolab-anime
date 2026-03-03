import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Test minimal insert
        const testPost = {
            title: 'Test Post ' + Date.now(),
            slug: 'test-' + Date.now(),
            type: 'INTEL',
            claim_type: 'OTHER',
            content: 'Test content',
            excerpt: 'Test excerpt...',
            timestamp: new Date().toISOString(),
            status: 'pending'
        };
        
        console.log('[Test] Attempting insert:', testPost);
        
        const { data, error } = await supabaseAdmin
            .from('posts')
            .insert([testPost])
            .select();
        
        if (error) {
            console.error('[Test] Insert error:', error);
            return NextResponse.json({
                success: false,
                error: error.message,
                details: error
            }, { status: 500 });
        }
        
        return NextResponse.json({
            success: true,
            data: data
        });
        
    } catch (err: any) {
        console.error('[Test] Exception:', err);
        return NextResponse.json({
            success: false,
            error: err.message
        }, { status: 500 });
    }
}
