'use client';

import { useEffect, useState } from 'react';
import {
    Area,
    AreaChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

interface TrafficChartProps {
    data: {
        date: string;
        views: number;
        bots: number;
    }[];
}

export default function TrafficChart({ data }: TrafficChartProps) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line
        setIsMounted(true);
    }, []);

    if (!isMounted) return <div className="h-[300px] w-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>Loading Chart...</div>;

    if (!data || data.length === 0) {
        return <div className="h-64 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>No data available for chart.</div>;
    }

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#7b61ff" stopOpacity={0.25} />
                            <stop offset="50%" stopColor="#7b61ff" stopOpacity={0.08} />
                            <stop offset="95%" stopColor="#7b61ff" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                    <XAxis
                        dataKey="date"
                        tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 9, fontFamily: 'var(--font-display)' }}
                        tickLine={false}
                        axisLine={false}
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
                            border: '1px solid rgba(123,97,255,0.3)',
                            borderRadius: '10px',
                            color: '#fff',
                            fontSize: '10px',
                            fontFamily: 'var(--font-display)',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                            padding: '8px 12px',
                        }}
                        cursor={{ stroke: '#7b61ff', strokeDasharray: '4 4', strokeOpacity: 0.3 }}
                    />
                    <Area
                        type="monotone"
                        dataKey="views"
                        stroke="#7b61ff"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorViews)"
                        dot={false}
                        activeDot={{ r: 4, fill: '#7b61ff', stroke: '#06060e', strokeWidth: 2 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
