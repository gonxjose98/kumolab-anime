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
        <div className="col-span-1 md:col-span-2 p-6 rounded-xl bg-neutral-900/50 border border-neutral-800 backdrop-blur-sm h-[350px] flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
                    <TrendingUp size={16} className="text-purple-400" />
                    Traffic Overview
                </h3>

                {/* Timeframe Toggles */}
                <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
                    {(['24h', '7d', '30d', 'all'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTimeframe(t)}
                            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${timeframe === t
                                ? 'bg-neutral-800 text-white shadow-sm'
                                : 'text-neutral-500 hover:text-neutral-300'
                                }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" />
                        <XAxis
                            dataKey="date"
                            stroke="#525252"
                            tick={{ fill: '#525252', fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={30}
                        />
                        <YAxis
                            stroke="#525252"
                            tick={{ fill: '#525252', fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#171717',
                                border: '1px solid #404040',
                                borderRadius: '6px',
                                color: '#fff',
                                fontSize: '12px'
                            }}
                            cursor={{ stroke: '#404040' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="views"
                            stroke="#7c3aed"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorViews)"
                            animationDuration={1000}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
