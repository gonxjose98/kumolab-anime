import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET - Fetch all tasks
export async function GET() {
    const { data, error } = await supabaseAdmin
        .from('tasks')
        .select('*, agents!tasks_assigned_to_fkey(name)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[Tasks API] Fetch error:', error);
        return NextResponse.json([], { status: 200 });
    }

    const tasks = (data || []).map((t: any) => ({
        ...t,
        agent_name: t.agents?.name || null,
        agents: undefined,
    }));

    return NextResponse.json(tasks);
}

// POST - Create a new task
export async function POST(req: NextRequest) {
    const body = await req.json();
    const { title, description, status, priority, assigned_to } = body;

    if (!title?.trim()) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const insert: any = {
        title: title.trim(),
        description: description?.trim() || null,
        status: status || 'backlog',
        priority: priority || 'medium',
    };

    if (assigned_to) insert.assigned_to = assigned_to;

    const { data, error } = await supabaseAdmin
        .from('tasks')
        .insert(insert)
        .select()
        .single();

    if (error) {
        console.error('[Tasks API] Insert error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// PUT - Update a task
export async function PUT(req: NextRequest) {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
        return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    // If completing, set completed_at
    if (updates.status === 'completed') {
        updates.completed_at = new Date().toISOString();
        if (!updates.completed_by) updates.completed_by = 'Admin';

        // Log to activity
        await supabaseAdmin.from('agent_activity_log').insert({
            agent_name: updates.completed_by,
            action: 'completed task',
            details: null,
            related_task_id: id,
        });
    } else if (updates.status && updates.status !== 'completed') {
        updates.completed_at = null;
        updates.completed_by = null;
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('[Tasks API] Update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// DELETE - Remove a task
export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
        .from('tasks')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('[Tasks API] Delete error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
