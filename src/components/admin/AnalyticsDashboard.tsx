'use client';

import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Globe, Share2, Layers, Heart, MessageCircle } from 'lucide-react';

interface AnalyticsDashboardProps {
    websiteData: {
        views: number;
        chart: { date: string; views: number }[];
    };
    socialData: {
        views: number;
        likes: number;
        comments: number;
        breakdown?: {
            twitter: { views: number; likes: number; comments: number };
            instagram: { views: number; likes: number; comments: number };
            facebook: { views: number; likes: number; comments: number };
        };
    };
}

type ViewMode = 'WEBSITE' | 'SOCIAL' | 'TOTAL';

const MODE_CONFIG = {
    WEBSITE: { color: '#00d4ff', label: 'Website Traffic', icon: Globe, gradientId: 'gradCyan' },
    SOCIAL: { color: '#ff3cac', label: 'Social Reach', icon: Share2, gradientId: 'gradPink' },
    TOTAL: { color: '#7b61ff', label: 'Total Impact', icon: Layers, gradientId: 'gradPurple' },
};

export default function AnalyticsDashboard({ websiteData, socialData }: AnalyticsDashboardProps) {
    const [mode, setMode] = useState<ViewMode>('WEBSITE');
    const cfg = MODE_CONFIG[mode];

    const metrics = useMemo(() => {
        if (mode === 'WEBSITE') return { views: websiteData.views, likes: 0, comments: 0 };
        if (mode === 'SOCIAL') return { views: socialData.views, likes: socialData.likes, comments: socialData.comments };
        return { views: websiteData.views + socialData.views, likes: socialData.likes, comments: socialData.comments };
    }, [mode, websiteData, socialData]);

    const socialPlatforms = [
        { name: 'X (Twitter)', color: '#00d4ff', data: socialData.breakdown?.twitter },
        { name: 'Instagram', color: '#ff3cac', data: socialData.breakdown?.instagram },
        { name: 'Facebook', color: '#7b61ff', data: socialData.breakdown?.facebook },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Main Chart Card */}
            <div className="md:col-span-2 relative overflow-hidden rounded-2xl h-[400px] flex flex-col" style={{
                background: 'rgba(12,12,24,0.5)',
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(20px)',
            }}>
                {/* Ambient glow */}
                <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${cfg.color}12 0%, transparent 70%)` }} />

                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 pb-2 z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg" style={{ background: `${cfg.color}12`, border: `1px solid ${cfg.color}20` }}>
                            <cfg.icon size={18} style={{ color: cfg.color }} />
                        </div>
                        <div>
                            <div className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>{cfg.label}</div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)', color: cfg.color }}>{metrics.views.toLocaleString()}</span>
                                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Views</span>
                            </div>
                        </div>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {(['WEBSITE', 'SOCIAL', 'TOTAL'] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className="relative px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300"
                                style={{
                                    color: mode === m ? '#fff' : 'var(--text-muted)',
                                    background: mode === m ? `${MODE_CONFIG[m].color}20` : 'transparent',
                                    border: mode === m ? `1px solid ${MODE_CONFIG[m].color}40` : '1px solid transparent',
                                    fontFamily: 'var(--font-display)',
                                }}
                            >
                                {m === 'WEBSITE' ? 'Web' : m === 'SOCIAL' ? 'Social' : 'Total'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Chart */}
                <div className="flex-1 w-full min-h-0 px-2 pb-2 z-10">
                    {mode === 'SOCIAL' ? (
                        <div className="h-full grid grid-cols-3 gap-3 p-4 items-center">
                            {socialPlatforms.map((p) => (
                                <div key={p.name} className="flex flex-col items-center gap-3 p-4 rounded-xl text-center" style={{
                                    background: `${p.color}06`,
                                    border: `1px solid ${p.color}15`,
                                }}>
                                    <div className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: p.color, fontFamily: 'var(--font-display)' }}>{p.name}</div>
                                    <div className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                                        {(p.data?.views || 0).toLocaleString()}
                                    </div>
                                    <div className="text-[8px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Views</div>
                                    <div className="flex gap-4 mt-1">
                                        <div className="text-center">
                                            <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{(p.data?.likes || 0).toLocaleString()}</div>
                                            <div className="text-[7px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Likes</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{(p.data?.comments || 0).toLocaleString()}</div>
                                            <div className="text-[7px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Comments</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={websiteData.chart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="adminChartGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={cfg.color} stopOpacity={0.25} />
                                        <stop offset="50%" stopColor={cfg.color} stopOpacity={0.08} />
                                        <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 9, fontFamily: 'var(--font-display)' }}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={30}
                                />
                                <YAxis
                                    tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 9, fontFamily: 'var(--font-display)' }}
                                    tickLine={false}
                                    axisLine={false}
                                    allowDecimals={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'rgba(12,12,24,0.95)',
                                        border: `1px solid ${cfg.color}30`,
                                        borderRadius: '10px',
                                        color: '#fff',
                                        fontSize: '10px',
                                        fontFamily: 'var(--font-display)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        boxShadow: `0 10px 40px rgba(0,0,0,0.5), 0 0 20px ${cfg.color}10`,
                                        padding: '8px 12px',
                                    }}
                                    cursor={{ stroke: cfg.color, strokeDasharray: '4 4', strokeOpacity: 0.3 }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="views"
                                    stroke={cfg.color}
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#adminChartGrad)"
                                    animationDuration={1500}
                                    dot={false}
                                    activeDot={{ r: 4, fill: cfg.color, stroke: '#06060e', strokeWidth: 2 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Side Metric Cards */}
            <div className="flex flex-col gap-4">
                {/* Likes Card */}
                <div className="flex-1 relative overflow-hidden rounded-2xl p-5" style={{
                    background: 'rgba(12,12,24,0.5)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(20px)',
                }}>
                    <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,60,172,0.08) 0%, transparent 70%)' }} />
                    <div className="flex items-center gap-3 mb-3 relative z-10">
                        <div className="p-2 rounded-lg" style={{ background: 'rgba(255,60,172,0.08)', border: '1px solid rgba(255,60,172,0.15)' }}>
                            <Heart size={14} style={{ color: '#ff3cac' }} />
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Total Likes</span>
                    </div>
                    <div className="text-3xl font-black relative z-10" style={{ fontFamily: 'var(--font-display)', color: '#ff3cac' }}>
                        {metrics.likes.toLocaleString()}
                    </div>
                    <div className="mt-3 text-[9px] font-mono relative z-10" style={{ color: 'var(--text-muted)' }}>
                        {mode === 'WEBSITE' ? 'Not tracked on web' : 'From X, IG, FB'}
                    </div>
                </div>

                {/* Comments Card */}
                <div className="flex-1 relative overflow-hidden rounded-2xl p-5" style={{
                    background: 'rgba(12,12,24,0.5)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(20px)',
                }}>
                    <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)' }} />
                    <div className="flex items-center gap-3 mb-3 relative z-10">
                        <div className="p-2 rounded-lg" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)' }}>
                            <MessageCircle size={14} style={{ color: '#00d4ff' }} />
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Total Comments</span>
                    </div>
                    <div className="text-3xl font-black relative z-10" style={{ fontFamily: 'var(--font-display)', color: '#00d4ff' }}>
                        {metrics.comments.toLocaleString()}
                    </div>
                    <div className="mt-3 text-[9px] font-mono relative z-10" style={{ color: 'var(--text-muted)' }}>
                        {mode === 'WEBSITE' ? 'Not tracked on web' : 'From X, IG, FB'}
                    </div>
                </div>
            </div>
        </div>
    );
}
