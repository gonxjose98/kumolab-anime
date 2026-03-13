'use client';

import { useState, useEffect } from 'react';
import AdminPageHeader from './AdminSubLayout';

interface Agent {
    id: string;
    name: string;
    specialization: string;
    avatar_color: string;
    is_active: boolean;
    created_at: string;
}

interface ActivityItem {
    id: string;
    agent_name: string;
    action: string;
    details: string | null;
    created_at: string;
}

export default function AgentsPageClient() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const [agentsRes, activityRes] = await Promise.all([
                    fetch('/api/admin/agents'),
                    fetch('/api/admin/activity'),
                ]);
                if (agentsRes.ok) setAgents(await agentsRes.json());
                if (activityRes.ok) setActivity(await activityRes.json());
            } catch (e) {
                console.error('Failed to fetch agents data:', e);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getAgentActivity = (agentName: string) =>
        activity.filter(a => a.agent_name.toLowerCase() === agentName.toLowerCase()).slice(0, 20);

    return (
        <div className="max-w-7xl mx-auto">
            <AdminPageHeader
                title="Agents"
                subtitle="KumoLab agent registry and activity logs"
                accentColor="#7b61ff"
                icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#7b61ff', borderTopColor: 'transparent' }} />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {agents.map((agent) => {
                        const agentActivity = getAgentActivity(agent.name);
                        const isExpanded = expandedAgent === agent.id;

                        return (
                            <div
                                key={agent.id}
                                className="rounded-xl overflow-hidden transition-all duration-300"
                                style={{
                                    background: 'rgba(12,12,24,0.5)',
                                    border: `1px solid ${agent.is_active ? `${agent.avatar_color}20` : 'rgba(255,255,255,0.05)'}`,
                                    backdropFilter: 'blur(20px)',
                                }}
                            >
                                {/* Agent Header */}
                                <div className="p-4 flex items-start gap-3">
                                    <div
                                        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
                                        style={{
                                            background: `${agent.avatar_color}15`,
                                            border: `1px solid ${agent.avatar_color}30`,
                                            color: agent.avatar_color,
                                            fontFamily: 'var(--font-display)',
                                        }}
                                    >
                                        {agent.name[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                                                {agent.name}
                                            </h3>
                                            <div
                                                className="w-1.5 h-1.5 rounded-full"
                                                style={{
                                                    background: agent.is_active ? '#00ff88' : '#ff4444',
                                                    boxShadow: agent.is_active ? '0 0 6px rgba(0,255,136,0.5)' : 'none',
                                                }}
                                            />
                                        </div>
                                        <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                            {agent.specialization}
                                        </p>
                                    </div>
                                </div>

                                {/* Activity Toggle */}
                                <button
                                    onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                                    className="w-full px-4 py-2 flex items-center justify-between transition-colors"
                                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                                >
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                                        Recent Activity ({agentActivity.length})
                                    </span>
                                    <svg
                                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
                                        className="transition-transform duration-200"
                                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                                    >
                                        <path d="M6 9l6 6 6-6" />
                                    </svg>
                                </button>

                                {/* Activity Log */}
                                {isExpanded && (
                                    <div className="px-4 pb-3 space-y-1.5 max-h-64 overflow-y-auto hide-scrollbar">
                                        {agentActivity.length === 0 ? (
                                            <p className="text-[10px] text-center py-4" style={{ color: 'var(--text-muted)' }}>No recorded activity yet</p>
                                        ) : agentActivity.map((item) => (
                                            <div key={item.id} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                                <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: agent.avatar_color }} />
                                                <div className="min-w-0">
                                                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{item.action}</p>
                                                    {item.details && (
                                                        <p className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>{item.details}</p>
                                                    )}
                                                    <p className="text-[8px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatTime(item.created_at)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {agents.length === 0 && (
                        <div className="col-span-2 text-center py-20 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            No agents registered. Run the migration to seed default agents.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
