'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminPageHeader from './AdminSubLayout';

interface Task {
    id: string;
    title: string;
    description: string | null;
    status: 'recurring' | 'backlog' | 'in_progress' | 'review' | 'completed';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    assigned_to: string | null;
    agent_name?: string;
    due_date: string | null;
    completed_by: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

interface ActivityItem {
    id: string;
    agent_name: string;
    action: string;
    details: string | null;
    created_at: string;
}

const COLUMNS = [
    { key: 'recurring', label: 'Recurring', color: '#ffaa00', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
    { key: 'backlog', label: 'Backlog', color: '#7878a0', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { key: 'in_progress', label: 'In Progress', color: '#00d4ff', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { key: 'review', label: 'Review', color: '#7b61ff', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' },
] as const;

const PRIORITY_COLORS: Record<string, string> = {
    urgent: '#ff4444',
    high: '#ff8800',
    medium: '#ffaa00',
    low: '#7878a0',
};

export default function TasksPageClient() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newTask, setNewTask] = useState({ title: '', description: '', status: 'backlog', priority: 'medium', assigned_to: '' });
    const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

    const fetchData = useCallback(async () => {
        try {
            const [tasksRes, activityRes, agentsRes] = await Promise.all([
                fetch('/api/admin/tasks'),
                fetch('/api/admin/activity'),
                fetch('/api/admin/agents'),
            ]);
            if (tasksRes.ok) setTasks(await tasksRes.json());
            if (activityRes.ok) setActivity(await activityRes.json());
            if (agentsRes.ok) setAgents(await agentsRes.json());
        } catch (e) {
            console.error('Failed to fetch tasks data:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleAddTask = async () => {
        if (!newTask.title.trim()) return;
        try {
            const res = await fetch('/api/admin/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTask),
            });
            if (res.ok) {
                setShowAddModal(false);
                setNewTask({ title: '', description: '', status: 'backlog', priority: 'medium', assigned_to: '' });
                fetchData();
            }
        } catch (e) {
            console.error('Failed to add task:', e);
        }
    };

    const handleToggleComplete = async (task: Task) => {
        const newStatus = task.status === 'completed' ? 'backlog' : 'completed';
        try {
            await fetch('/api/admin/tasks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: task.id,
                    status: newStatus,
                    completed_by: newStatus === 'completed' ? 'Admin' : null,
                }),
            });
            fetchData();
        } catch (e) {
            console.error('Failed to update task:', e);
        }
    };

    const handleDeleteTask = async (id: string) => {
        try {
            await fetch(`/api/admin/tasks?id=${id}`, { method: 'DELETE' });
            fetchData();
        } catch (e) {
            console.error('Failed to delete task:', e);
        }
    };

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const completedTasks = tasks.filter(t => t.status === 'completed');

    return (
        <div className="max-w-7xl mx-auto">
            <AdminPageHeader
                title="Tasks"
                subtitle="Manage recurring jobs, backlog, and track agent work"
                accentColor="#00d4ff"
                icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />

            {/* Add Task Button */}
            <div className="flex justify-end mb-4">
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:scale-105"
                    style={{
                        background: 'rgba(0,212,255,0.1)',
                        border: '1px solid rgba(0,212,255,0.25)',
                        color: '#00d4ff',
                        fontFamily: 'var(--font-display)',
                    }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add Task
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} />
                </div>
            ) : (
                <div className="flex gap-4 overflow-x-auto pb-4">
                    {/* Kanban Columns */}
                    <div className="flex gap-4 flex-1 min-w-0">
                        {COLUMNS.map((col) => {
                            const colTasks = tasks.filter(t => t.status === col.key);
                            return (
                                <div
                                    key={col.key}
                                    className="flex-1 min-w-[220px] rounded-xl overflow-hidden"
                                    style={{ background: 'rgba(12,12,24,0.5)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}
                                >
                                    {/* Column Header */}
                                    <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div className="flex items-center gap-2">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={col.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d={col.icon} />
                                            </svg>
                                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: col.color }}>
                                                {col.label}
                                            </span>
                                        </div>
                                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${col.color}15`, color: col.color }}>
                                            {colTasks.length}
                                        </span>
                                    </div>
                                    {/* Tasks */}
                                    <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto hide-scrollbar">
                                        {colTasks.length === 0 ? (
                                            <div className="text-center py-8 text-[10px]" style={{ color: 'var(--text-muted)' }}>No tasks</div>
                                        ) : colTasks.map((task) => (
                                            <div
                                                key={task.id}
                                                className="p-3 rounded-lg transition-all hover:scale-[1.01] group"
                                                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <button
                                                        onClick={() => handleToggleComplete(task)}
                                                        className="mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all hover:scale-110"
                                                        style={{ borderColor: `${col.color}50`, background: 'transparent' }}
                                                    >
                                                        {task.status === 'completed' && (
                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={col.color} strokeWidth="3">
                                                                <path d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-medium leading-tight" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-main)' }}>
                                                            {task.title}
                                                        </p>
                                                        {task.description && (
                                                            <p className="text-[9px] mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{task.description}</p>
                                                        )}
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${PRIORITY_COLORS[task.priority]}15`, color: PRIORITY_COLORS[task.priority], fontFamily: 'var(--font-display)' }}>
                                                                {task.priority}
                                                            </span>
                                                            {task.agent_name && (
                                                                <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(123,97,255,0.1)', color: '#7b61ff' }}>
                                                                    {task.agent_name}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteTask(task.id)}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] p-1 rounded hover:bg-red-500/10"
                                                        style={{ color: '#ff4444' }}
                                                    >
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Live Activity Sidebar */}
                    <div
                        className="w-72 flex-shrink-0 rounded-xl overflow-hidden"
                        style={{ background: 'rgba(12,12,24,0.5)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}
                    >
                        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00ff88', animation: 'livePulse 2s ease-in-out infinite' }} />
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: '#00ff88' }}>
                                Live Activity
                            </span>
                        </div>
                        <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto hide-scrollbar">
                            {/* Completed tasks shown as activity */}
                            {completedTasks.map((task) => (
                                <div key={`done-${task.id}`} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(0,255,136,0.03)' }}>
                                    <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: 'rgba(0,255,136,0.15)' }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] leading-tight" style={{ color: 'var(--text-secondary)' }}>
                                            <span style={{ color: '#00d4ff', fontWeight: 600 }}>{task.completed_by || 'Unknown'}</span> completed
                                        </p>
                                        <p className="text-[10px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{task.title}</p>
                                        {task.completed_at && (
                                            <p className="text-[8px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatTime(task.completed_at)}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {/* Agent activity log */}
                            {activity.map((item) => (
                                <div key={item.id} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(123,97,255,0.03)' }}>
                                    <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: 'rgba(123,97,255,0.15)' }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7b61ff" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] leading-tight" style={{ color: 'var(--text-secondary)' }}>
                                            <span style={{ color: '#7b61ff', fontWeight: 600 }}>{item.agent_name}</span> {item.action}
                                        </p>
                                        {item.details && (
                                            <p className="text-[9px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.details}</p>
                                        )}
                                        <p className="text-[8px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatTime(item.created_at)}</p>
                                    </div>
                                </div>
                            ))}
                            {completedTasks.length === 0 && activity.length === 0 && (
                                <div className="text-center py-8 text-[10px]" style={{ color: 'var(--text-muted)' }}>No recent activity</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Task Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                    <div
                        className="w-full max-w-md rounded-xl p-6"
                        style={{ background: 'rgba(12,12,24,0.98)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 25px 80px rgba(0,0,0,0.5)' }}
                    >
                        <h2 className="text-sm font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Add New Task</h2>

                        <div className="space-y-3">
                            <div>
                                <label className="text-[9px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Title</label>
                                <input
                                    value={newTask.title}
                                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg text-[12px] outline-none transition-all focus:ring-1"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)' }}
                                    placeholder="Task title..."
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Description</label>
                                <textarea
                                    value={newTask.description}
                                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none h-20 transition-all focus:ring-1"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)', fontFamily: 'var(--font-main)' }}
                                    placeholder="Optional description..."
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-[9px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Status</label>
                                    <select
                                        value={newTask.status}
                                        onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}
                                        className="w-full px-2 py-2 rounded-lg text-[11px] outline-none"
                                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}
                                    >
                                        <option value="recurring">Recurring</option>
                                        <option value="backlog">Backlog</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="review">Review</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Priority</label>
                                    <select
                                        value={newTask.priority}
                                        onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                                        className="w-full px-2 py-2 rounded-lg text-[11px] outline-none"
                                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="urgent">Urgent</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Assign To</label>
                                    <select
                                        value={newTask.assigned_to}
                                        onChange={(e) => setNewTask({ ...newTask, assigned_to: e.target.value })}
                                        className="w-full px-2 py-2 rounded-lg text-[11px] outline-none"
                                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}
                                    >
                                        <option value="">Unassigned</option>
                                        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-5">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                style={{ color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'var(--font-display)' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddTask}
                                className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-105"
                                style={{ background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff', fontFamily: 'var(--font-display)' }}
                            >
                                Create Task
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
