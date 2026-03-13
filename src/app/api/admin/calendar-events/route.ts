import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET - Fetch calendar events for a given month
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

    const events: any[] = [];

    // 1. Scheduled posts
    const { data: posts } = await supabaseAdmin
        .from('posts')
        .select('id, title, status, scheduled_post_time, type')
        .not('scheduled_post_time', 'is', null)
        .gte('scheduled_post_time', `${startDate}T00:00:00`)
        .lte('scheduled_post_time', `${endDate}T23:59:59`)
        .order('scheduled_post_time', { ascending: true });

    if (posts) {
        for (const post of posts) {
            const dt = new Date(post.scheduled_post_time);
            events.push({
                id: `post-${post.id}`,
                title: post.title,
                type: post.status === 'pending' ? 'pending_review' : 'scheduled_post',
                date: post.scheduled_post_time.split('T')[0],
                time: dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }),
                status: post.status,
                color: post.status === 'published' ? '#00ff88' : post.status === 'approved' ? '#00d4ff' : '#7b61ff',
            });
        }
    }

    // 2. Tasks with due dates
    const { data: tasks } = await supabaseAdmin
        .from('tasks')
        .select('id, title, status, due_date, priority')
        .not('due_date', 'is', null)
        .gte('due_date', `${startDate}T00:00:00`)
        .lte('due_date', `${endDate}T23:59:59`);

    if (tasks) {
        for (const task of tasks) {
            const dt = new Date(task.due_date);
            events.push({
                id: `task-${task.id}`,
                title: task.title,
                type: 'task_due',
                date: task.due_date.split('T')[0],
                time: dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }),
                status: task.status,
                color: '#ff3cac',
            });
        }
    }

    // 3. Daily drops indicator (every day at 6 AM)
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        events.push({
            id: `cron-drop-${d}`,
            title: 'Daily Drops (AniList)',
            type: 'daily_drop',
            date: dateStr,
            time: '06:00 AM',
            color: '#ffaa00',
        });
    }

    return NextResponse.json(events);
}
