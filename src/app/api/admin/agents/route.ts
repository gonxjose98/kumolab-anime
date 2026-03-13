import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET - Fetch all agents
export async function GET() {
    const { data, error } = await supabaseAdmin
        .from('agents')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[Agents API] Fetch error:', error);
        return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(data || []);
}
