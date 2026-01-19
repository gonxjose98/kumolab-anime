'use client';

import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Calendar, ChevronDown } from 'lucide-react';

interface AnalyticsDashboardProps {
    initialData: {
        date: string;
        views: number;
    }[];
}

type Timeframe = '30d' | '7d' | '24h' | 'all';

export default function AnalyticsDashboard({ initialData }: AnalyticsDashboardProps) {
    const [timeframe, setTimeframe] = useState<Timeframe>('30d');
    const [chartData, setChartData] = useState(initialData);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line
        setIsMounted(true);
    }, []);

    // Filter logic (simulated for now since we pass 30 days of data)
    // In a real app, this would fetch new data from an API route.
    useEffect(() => {
        if (!initialData) return;

        let filtered = [...initialData];
        const now = new Date();

        if (timeframe === '7d') {
            // Take last 7
            filtered = filtered.slice(-7);
        } else if (timeframe === '24h') {
            // Take last 1 (or real hourly data if we had it)
            filtered = filtered.slice(-1);
        } else if (timeframe === 'all') {
            // Just show all 30 for now, or fetch more?
            // For this demo, we assume initialData IS the max available set passed from server.
        }

        // eslint-disable-next-line
        setChartData(filtered);
    }, [timeframe, initialData]);

    if (!isMounted) return <div className="h-[300px] w-full flex items-center justify-center text-neutral-800">Loading Analytics...</div>;

    return (
        <div className="col-span-1 md:col-span-2 p-6 rounded-2xl bg-black/20 border border-white/5 backdrop-blur-xl h-[350px] flex flex-col group hover:border-white/10 transition-colors relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-bl from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/5 rounded-xl text-purple-400 border border-white/5 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                        <TrendingUp size={20} />
                    </div>
                    <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em]">Traffic Overview</h3>
                </div>

                {/* Timeframe Toggles */}
                <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                    {(['24h', '7d', '30d', 'all'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTimeframe(t)}
                            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${timeframe === t
                                ? 'bg-white/10 text-white shadow-sm border border-white/5'
                                : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                                }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 w-full min-h-0 relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                            dataKey="date"
                            stroke="#525252"
                            tick={{ fill: '#525252', fontSize: 10, fontFamily: 'monospace' }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={30}
                        />
                        <YAxis
                            stroke="#525252"
                            tick={{ fill: '#525252', fontSize: 10, fontFamily: 'monospace' }}
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
                            cursor={{ stroke: '#7c3aed', strokeDasharray: '4 4' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="views"
                            stroke="#7c3aed"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorViews)"
                            animationDuration={1500}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
