'use client';

import { useEffect, useState } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
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
        setIsMounted(true);
    }, []);

    if (!isMounted) return <div className="h-[300px] w-full flex items-center justify-center text-neutral-800">Loading Chart...</div>;

    if (!data || data.length === 0) {
        return <div className="h-64 flex items-center justify-center text-neutral-500 text-sm">No data available for chart.</div>;
    }

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={data}
                    margin={{
                        top: 10,
                        right: 10,
                        left: -20,
                        bottom: 0,
                    }}
                >
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
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
