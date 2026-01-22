
'use client';

import { useState, useMemo } from 'react';
import { Globe, Share2, Layers, RefreshCw, Twitter, Instagram, Facebook } from 'lucide-react';

interface PostAnalyticsProps {
    postId: string;
    websiteViews: number;
    initialSocialMetrics: any;
}

type ViewMode = 'WEBSITE' | 'SOCIAL' | 'TOTAL';

export default function PostAnalytics({ postId, websiteViews, initialSocialMetrics }: PostAnalyticsProps) {
    const [mode, setMode] = useState<ViewMode>('WEBSITE');
    const [socialMetrics, setSocialMetrics] = useState(initialSocialMetrics || { twitter: {}, instagram: {}, facebook: {} });
    const [syncing, setSyncing] = useState(false);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/admin/analytics/sync-post', {
                method: 'POST',
                body: JSON.stringify({ postId }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                setSocialMetrics(data.metrics);
            }
        } catch (e) {
            console.error('Failed to sync', e);
        } finally {
            setSyncing(false);
        }
    };

    const aggregated = useMemo(() => {
        const tw = socialMetrics.twitter || {};
        const ig = socialMetrics.instagram || {};
        const fb = socialMetrics.facebook || {};

        return {
            views: (tw.views || 0) + (ig.views || 0) + (fb.views || 0),
            likes: (tw.likes || 0) + (ig.likes || 0) + (fb.likes || 0),
            comments: (tw.comments || 0) + (ig.comments || 0) + (fb.comments || 0)
        };
    }, [socialMetrics]);

    const display = useMemo(() => {
        if (mode === 'WEBSITE') {
            return { views: websiteViews, likes: 0, comments: 0 };
        } else if (mode === 'SOCIAL') {
            return aggregated;
        } else {
            return {
                views: websiteViews + aggregated.views,
                likes: aggregated.likes,
                comments: aggregated.comments
            };
        }
    }, [mode, websiteViews, aggregated]);

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 mb-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        Performance Analytics
                        <button
                            onClick={handleSync}
                            disabled={syncing}
                            className={`p-1.5 rounded-full hover:bg-white/10 transition-all ${syncing ? 'animate-spin text-purple-500' : 'text-neutral-500'}`}
                            title="Sync live data from Social APIs"
                        >
                            <RefreshCw size={14} />
                        </button>
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1">Live data aggregation</p>
                </div>

                {/* Toggle */}
                <div className="flex bg-neutral-950 p-1 rounded-lg border border-neutral-800">
                    <button
                        onClick={() => setMode('WEBSITE')}
                        className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${mode === 'WEBSITE' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                    >
                        <Globe size={12} /> Website
                    </button>
                    <button
                        onClick={() => setMode('SOCIAL')}
                        className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${mode === 'SOCIAL' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                    >
                        <Share2 size={12} /> Socials
                    </button>
                    <button
                        onClick={() => setMode('TOTAL')}
                        className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${mode === 'TOTAL' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                    >
                        <Layers size={12} /> Total
                    </button>
                </div>
            </div>

            {/* Main Metrics Grid */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-black/50 rounded border border-white/5">
                    <div className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Total Views</div>
                    <div className="text-2xl font-black text-white">{display.views.toLocaleString()}</div>
                </div>
                <div className="p-4 bg-black/50 rounded border border-white/5">
                    <div className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Total Likes</div>
                    <div className="text-2xl font-black text-white">{display.likes.toLocaleString()}</div>
                </div>
                <div className="p-4 bg-black/50 rounded border border-white/5">
                    <div className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Total Comments</div>
                    <div className="text-2xl font-black text-white">{display.comments.toLocaleString()}</div>
                </div>
            </div>

            {/* Platform Breakdown (Only visible if Social involved) */}
            {(mode === 'SOCIAL' || mode === 'TOTAL') && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
                    {/* X (Twitter) */}
                    <div className="flex items-center justify-between p-3 bg-neutral-950 rounded border border-neutral-800">
                        <div className="flex items-center gap-2 text-neutral-400">
                            <Twitter size={14} /> <span className="text-xs font-bold">X</span>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-bold text-white">{(socialMetrics.twitter?.likes || 0).toLocaleString()} <span className="text-[10px] text-neutral-600 font-normal">LIKES</span></div>
                            <div className="text-[10px] text-neutral-500">{(socialMetrics.twitter?.views || 0).toLocaleString()} views</div>
                        </div>
                    </div>

                    {/* Instagram */}
                    <div className="flex items-center justify-between p-3 bg-neutral-950 rounded border border-neutral-800">
                        <div className="flex items-center gap-2 text-neutral-400">
                            <Instagram size={14} /> <span className="text-xs font-bold">IG</span>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-bold text-white">{(socialMetrics.instagram?.likes || 0).toLocaleString()} <span className="text-[10px] text-neutral-600 font-normal">LIKES</span></div>
                            <div className="text-[10px] text-neutral-500">{(socialMetrics.instagram?.views || 0).toLocaleString()} views</div>
                        </div>
                    </div>

                    {/* Facebook */}
                    <div className="flex items-center justify-between p-3 bg-neutral-950 rounded border border-neutral-800">
                        <div className="flex items-center gap-2 text-neutral-400">
                            <Facebook size={14} /> <span className="text-xs font-bold">FB</span>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-bold text-white">{(socialMetrics.facebook?.likes || 0).toLocaleString()} <span className="text-[10px] text-neutral-600 font-normal">LIKES</span></div>
                            <div className="text-[10px] text-neutral-500">{(socialMetrics.facebook?.views || 0).toLocaleString()} views</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
