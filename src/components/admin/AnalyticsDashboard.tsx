'use client';

import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Globe, Share2, Layers, Heart, MessageCircle, Eye } from 'lucide-react';

interface AnalyticsDashboardProps {
    websiteData: {
        views: number;
        chart: { date: string; views: number }[];
    };
    socialData: {
        views: number;
        likes: number;
        comments: number;
    };
}

type ViewMode = 'WEBSITE' | 'SOCIAL' | 'TOTAL';

export default function AnalyticsDashboard({ websiteData, socialData }: AnalyticsDashboardProps) {
    const [mode, setMode] = useState<ViewMode>('WEBSITE');

    // Calculate displayed metrics based on mode
    const metrics = useMemo(() => {
        const base = {
            views: 0,
            likes: 0,
            comments: 0,
            label: ''
        };

        if (mode === 'WEBSITE') {
            base.views = websiteData.views;
            base.likes = 0; // Website native likes not tracked yet
            base.comments = 0; // Website native comments not tracked yet
            base.label = 'Website Traffic';
        } else if (mode === 'SOCIAL') {
            base.views = socialData.views;
            base.likes = socialData.likes;
            base.comments = socialData.comments;
            base.label = 'Social Reach';
        } else {
            base.views = websiteData.views + socialData.views;
            base.likes = socialData.likes;
            base.comments = socialData.comments;
            base.label = 'Total Impact';
        }

        return base;
    }, [mode, websiteData, socialData]);

    return (
        <div className="col-span-1 md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* 1. CONTROL PANEL & MAIN STATS */}
            <div className="md:col-span-2 p-6 rounded-2xl bg-white/60 dark:bg-black/20 border border-gray-200 dark:border-white/5 backdrop-blur-xl flex flex-col h-[400px] relative overflow-hidden shadow-xl shadow-purple-900/5 dark:shadow-none">

                {/* Header / Toggle */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 z-10">
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl border shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-colors ${mode === 'WEBSITE' ? 'bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20' :
                                mode === 'SOCIAL' ? 'bg-pink-50 dark:bg-pink-900/10 text-pink-600 dark:text-pink-400 border-pink-100 dark:border-pink-500/20' :
                                    'bg-purple-50 dark:bg-purple-900/10 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-500/20'
                            }`}>
                            {mode === 'WEBSITE' && <Globe size={20} />}
                            {mode === 'SOCIAL' && <Share2 size={20} />}
                            {mode === 'TOTAL' && <Layers size={20} />}
                        </div>
                        <div>
                            <h3 className="text-xs font-black text-slate-500 dark:text-neutral-500 uppercase tracking-widest">{metrics.label}</h3>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">
                                    {metrics.views.toLocaleString()}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Views</span>
                            </div>
                        </div>
                    </div>

                    {/* Toggle Switch */}
                    <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-xl border border-gray-200 dark:border-white/5">
                        <button
                            onClick={() => setMode('WEBSITE')}
                            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${mode === 'WEBSITE'
                                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300'
                                }`}
                        >
                            Website
                        </button>
                        <button
                            onClick={() => setMode('SOCIAL')}
                            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${mode === 'SOCIAL'
                                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300'
                                }`}
                        >
                            Socials
                        </button>
                        <button
                            onClick={() => setMode('TOTAL')}
                            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${mode === 'TOTAL'
                                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300'
                                }`}
                        >
                            Total
                        </button>
                    </div>
                </div>

                {/* Chart Area */}
                <div className="flex-1 w-full min-h-0 relative z-10">
                    {mode === 'SOCIAL' ? (
                        <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 dark:text-neutral-600 gap-2 border-2 border-dashed border-gray-100 dark:border-white/5 rounded-2xl">
                            <TrendingUp size={24} className="opacity-50" />
                            <span className="text-xs font-mono uppercase tracking-widest">Timeline Data Not Available for Socials</span>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={websiteData.chart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={mode === 'TOTAL' ? '#a855f7' : '#3b82f6'} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={mode === 'TOTAL' ? '#a855f7' : '#3b82f6'} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="date"
                                    stroke="#525252"
                                    tick={{ fill: '#737373', fontSize: 9, fontFamily: 'monospace' }}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={30}
                                />
                                <YAxis
                                    stroke="#525252"
                                    tick={{ fill: '#737373', fontSize: 9, fontFamily: 'monospace' }}
                                    tickLine={false}
                                    axisLine={false}
                                    allowDecimals={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#0a0a0a',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        color: '#fff',
                                        fontSize: '10px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                                    }}
                                    cursor={{ stroke: mode === 'TOTAL' ? '#a855f7' : '#3b82f6', strokeDasharray: '4 4' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="views"
                                    stroke={mode === 'TOTAL' ? '#a855f7' : '#3b82f6'}
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorViews)"
                                    animationDuration={1500}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* 2. SECONDARY METRICS (Likes / Comments) */}
            <div className="flex flex-col gap-6">
                {/* Engagement Card 1: Likes */}
                <div className="flex-1 p-6 rounded-2xl bg-white/60 dark:bg-black/20 border border-gray-200 dark:border-white/5 backdrop-blur-xl relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-red-50 dark:bg-red-900/10 rounded-lg text-red-500">
                            <Heart size={16} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 dark:text-neutral-500 uppercase tracking-widest">Total Likes</span>
                    </div>
                    <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">
                        {metrics.likes.toLocaleString()}
                    </div>
                    <div className="mt-4 text-[10px] text-slate-400 font-mono">
                        {mode === 'WEBSITE' ? 'Not tracked on web' : 'From X, IG, FB'}
                    </div>
                </div>

                {/* Engagement Card 2: Comments */}
                <div className="flex-1 p-6 rounded-2xl bg-white/60 dark:bg-black/20 border border-gray-200 dark:border-white/5 backdrop-blur-xl relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-green-50 dark:bg-green-900/10 rounded-lg text-green-500">
                            <MessageCircle size={16} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 dark:text-neutral-500 uppercase tracking-widest">Total Comments</span>
                    </div>
                    <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">
                        {metrics.comments.toLocaleString()}
                    </div>
                    <div className="mt-4 text-[10px] text-slate-400 font-mono">
                        {mode === 'WEBSITE' ? 'Not tracked on web' : 'From X, IG, FB'}
                    </div>
                </div>
            </div>
        </div>
    );
}
