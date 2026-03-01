'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ─────────────────────────────────────────────────────

interface ConnectionStatus {
    x: boolean;
    instagram: boolean;
    facebook: boolean;
    threads: boolean;
    youtube: boolean;
    reddit: boolean;
}

interface SourceStat {
    source: string;
    total: number;
    pending: number;
    approved: number;
    published: number;
}

interface ScraperSources {
    x: { handle: string; name: string; tier: number; id?: string }[];
    youtube: { name: string; tier: number }[];
    reddit: { name: string; url: string; type: string }[];
    rss: { name: string; url: string; tier?: number; lang?: string }[];
}

// ─── Component ─────────────────────────────────────────────────

export default function ConnectionsPanel() {
    const [connections, setConnections] = useState<ConnectionStatus>({
        x: false, instagram: false, facebook: false, threads: false, youtube: false, reddit: false,
    });
    const [loading, setLoading] = useState(true);
    const [sources, setSources] = useState<ScraperSources | null>(null);
    const [sourceStats, setSourceStats] = useState<SourceStat[]>([]);
    const [statsPeriod, setStatsPeriod] = useState<'day' | 'week' | 'month' | 'all'>('week');
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        x_scrape: true, youtube: true, reddit: true, rss: true,
    });
    const [addMode, setAddMode] = useState<string | null>(null); // which platform is in "add" mode
    const [addInput, setAddInput] = useState('');
    const [addName, setAddName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Fetch connection status
    useEffect(() => {
        async function checkConnections() {
            try {
                const res = await fetch('/api/admin/connections/status');
                if (res.ok) setConnections(await res.json());
            } catch { /* Connection check failed */ }
            finally { setLoading(false); }
        }
        checkConnections();
    }, []);

    // Fetch scraper sources
    useEffect(() => {
        async function fetchSources() {
            try {
                const res = await fetch('/api/admin/scraper-sources');
                if (res.ok) setSources(await res.json());
            } catch { /* Fall back to defaults shown below */ }
        }
        fetchSources();
    }, []);

    // Fetch source stats
    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`/api/admin/source-stats?period=${statsPeriod}`);
            if (res.ok) {
                const data = await res.json();
                setSourceStats(data.sources || []);
            }
        } catch { /* Stats unavailable */ }
    }, [statsPeriod]);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    const toggleSection = (key: string) => {
        setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const tierLabel = (t: number) => {
        if (t === 1) return { text: 'T1', color: '#ff3cac' };
        if (t === 2) return { text: 'T2', color: '#7b61ff' };
        if (t === 3) return { text: 'T3', color: '#00d4ff' };
        return { text: `T${t}`, color: 'var(--text-muted)' };
    };

    /** Get post count for a source name (fuzzy match) */
    const getSourceCount = (name: string): number => {
        const stat = sourceStats.find(s =>
            s.source.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(s.source.toLowerCase())
        );
        return stat?.total || 0;
    };

    /** Add a new source */
    const handleAdd = async (platform: string) => {
        if (!addInput.trim()) return;
        setIsSaving(true);

        let source: any = {};
        if (platform === 'x') {
            const handle = addInput.replace('@', '').trim();
            source = { handle, name: addName.trim() || handle, tier: 2 };
        } else if (platform === 'youtube') {
            source = { name: addInput.trim(), tier: 3 };
        } else if (platform === 'reddit') {
            const sub = addInput.startsWith('r/') ? addInput : `r/${addInput}`;
            source = { name: sub, url: `reddit.com/${sub}`, type: 'Top daily posts' };
        } else if (platform === 'rss') {
            source = { name: addName.trim() || addInput, url: addInput.trim(), tier: 2, lang: 'EN' };
        }

        try {
            const res = await fetch('/api/admin/scraper-sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform, source }),
            });
            const data = await res.json();
            if (data.success && data.config) {
                setSources(data.config);
                setAddMode(null);
                setAddInput('');
                setAddName('');
            } else {
                alert(data.error || 'Failed to add source');
            }
        } catch (err: any) {
            alert('Error: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    /** Remove a source */
    const handleRemove = async (platform: string, identifier: string) => {
        if (!confirm(`Remove "${identifier}" from ${platform} sources?`)) return;

        try {
            const res = await fetch('/api/admin/scraper-sources', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform, identifier }),
            });
            const data = await res.json();
            if (data.success && data.config) {
                setSources(data.config);
            } else {
                alert(data.error || 'Failed to remove source');
            }
        } catch (err: any) {
            alert('Error: ' + err.message);
        }
    };

    // ─── Sub-Components ────────────────────────────────────────

    const StatusDot = ({ connected }: { connected: boolean }) => (
        <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{
                background: connected ? '#00ff88' : '#ff4444',
                boxShadow: connected ? '0 0 8px rgba(0,255,136,0.4)' : '0 0 8px rgba(255,60,60,0.3)',
                animation: connected ? 'livePulse 2s ease-in-out infinite' : 'none',
            }} />
            <span className="text-[8px] font-bold uppercase tracking-wider" style={{
                color: connected ? '#00ff88' : '#ff4444',
                fontFamily: 'var(--font-display)',
            }}>
                {loading ? 'Checking...' : connected ? 'Connected' : 'Disconnected'}
            </span>
        </div>
    );

    const SectionHeader = ({ icon, title, subtitle, connected, sectionKey, count, platform }: {
        icon: React.ReactNode; title: string; subtitle: string; connected: boolean; sectionKey: string; count: number; platform: string;
    }) => (
        <div className="flex items-center gap-2">
            <button
                onClick={() => toggleSection(sectionKey)}
                className="flex-1 flex items-center justify-between p-4 rounded-xl transition-all hover:scale-[1.005]"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg" style={{
                        background: connected ? 'rgba(0,255,136,0.06)' : 'rgba(255,60,60,0.06)',
                        border: `1px solid ${connected ? 'rgba(0,255,136,0.12)' : 'rgba(255,60,60,0.12)'}`,
                    }}>
                        {icon}
                    </div>
                    <div className="text-left">
                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{title}</div>
                        <div className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <StatusDot connected={connected} />
                    <div className="px-2 py-0.5 rounded text-[8px] font-bold" style={{ background: 'rgba(123,97,255,0.08)', color: '#7b61ff', border: '1px solid rgba(123,97,255,0.15)' }}>
                        {count}
                    </div>
                    <svg
                        className="w-4 h-4 transition-transform duration-300"
                        style={{ color: 'var(--text-muted)', transform: expandedSections[sectionKey] ? 'rotate(180deg)' : 'rotate(0)' }}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>
            {/* Add button */}
            <button
                onClick={() => { setAddMode(addMode === platform ? null : platform); setAddInput(''); setAddName(''); }}
                className="p-2.5 rounded-lg transition-all hover:scale-105"
                style={{
                    background: addMode === platform ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${addMode === platform ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    color: addMode === platform ? '#00d4ff' : 'var(--text-muted)',
                }}
                title={`Add ${title} source`}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
            </button>
        </div>
    );

    /** Add source input form */
    const AddForm = ({ platform }: { platform: string }) => {
        if (addMode !== platform) return null;
        const needsName = platform === 'x' || platform === 'rss';
        const placeholder = platform === 'x' ? '@handle' : platform === 'youtube' ? 'Channel name' : platform === 'reddit' ? 'r/subreddit' : 'RSS feed URL';

        return (
            <div className="ml-2 pl-4 py-2 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200" style={{ borderLeft: '2px solid rgba(0,212,255,0.2)' }}>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={addInput}
                        onChange={(e) => setAddInput(e.target.value)}
                        placeholder={placeholder}
                        className="flex-1 px-3 py-1.5 rounded-lg text-[11px] outline-none"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(platform); if (e.key === 'Escape') setAddMode(null); }}
                    />
                    {needsName && (
                        <input
                            type="text"
                            value={addName}
                            onChange={(e) => setAddName(e.target.value)}
                            placeholder="Display name"
                            className="w-32 px-3 py-1.5 rounded-lg text-[11px] outline-none"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(platform); }}
                        />
                    )}
                    <button
                        onClick={() => handleAdd(platform)}
                        disabled={isSaving || !addInput.trim()}
                        className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all"
                        style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.2)', opacity: isSaving || !addInput.trim() ? 0.5 : 1 }}
                    >
                        {isSaving ? '...' : 'Add'}
                    </button>
                    <button
                        onClick={() => setAddMode(null)}
                        className="px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    };

    const SourceItem = ({ name, handle, tier, lang, count, platform, identifier }: {
        name: string; handle?: string; tier?: number; lang?: string; count?: number; platform: string; identifier: string;
    }) => {
        const t = tier ? tierLabel(tier) : null;
        const postCount = count ?? (handle ? getSourceCount(name) : getSourceCount(name));
        return (
            <div className="flex items-center justify-between py-2 px-3 rounded-lg transition-all group/item hover:scale-[1.005]" style={{
                background: 'rgba(255,255,255,0.015)',
                borderBottom: '1px solid rgba(255,255,255,0.02)',
            }}>
                <div className="flex items-center gap-2 min-w-0">
                    {handle && (
                        <span className="text-[10px] font-bold" style={{ color: '#00d4ff', fontFamily: 'var(--font-display)' }}>@{handle}</span>
                    )}
                    <span className="text-[10px] truncate" style={{ color: handle ? 'var(--text-muted)' : 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>{name}</span>
                    {lang && (
                        <span className="text-[7px] font-bold uppercase px-1 py-0.5 rounded" style={{
                            background: lang === 'JP' ? 'rgba(255,60,172,0.08)' : 'rgba(0,212,255,0.08)',
                            color: lang === 'JP' ? '#ff3cac' : '#00d4ff',
                            border: `1px solid ${lang === 'JP' ? 'rgba(255,60,172,0.15)' : 'rgba(0,212,255,0.15)'}`,
                        }}>{lang}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* Post count */}
                    {postCount > 0 && (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{
                            background: 'rgba(0,212,255,0.06)',
                            color: '#00d4ff',
                            border: '1px solid rgba(0,212,255,0.12)',
                        }}>{postCount} posts</span>
                    )}
                    {t && (
                        <span className="text-[7px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{
                            background: `${t.color}10`,
                            color: t.color,
                            border: `1px solid ${t.color}20`,
                        }}>{t.text}</span>
                    )}
                    {/* Remove button */}
                    <button
                        onClick={() => handleRemove(platform, identifier)}
                        className="opacity-0 group-hover/item:opacity-100 p-1 rounded transition-all hover:scale-110"
                        style={{ color: '#ff4444' }}
                        title="Remove source"
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>
        );
    };

    // ─── Platform Icons ────────────────────────────────────────
    const XIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#00d4ff' }}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
    const YTIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#ff3cac' }}><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>;
    const RedditIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#ff8c00' }}><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>;
    const RSSIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#7b61ff' }}><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>;

    // ─── Derived data ──────────────────────────────────────────
    const xSources = sources?.x || [];
    const ytSources = sources?.youtube || [];
    const redditSources = sources?.reddit || [];
    const rssSources = sources?.rss || [];

    // ─── Posting Section ───────────────────────────────────────
    const PostingPlatforms = () => (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(12,12,24,0.4)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
            <div className="p-5 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', background: 'linear-gradient(135deg, #00d4ff, #7b61ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Posting Connections
                </h3>
                <p className="text-[9px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>Platforms KumoLab can publish content to</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                {[
                    { name: 'X (Twitter)', connected: connections.x, icon: XIcon, color: '#00d4ff' },
                    { name: 'Instagram', connected: connections.instagram, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff3cac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>, color: '#ff3cac' },
                    { name: 'Facebook', connected: connections.facebook, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="#7b61ff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>, color: '#7b61ff' },
                    { name: 'Threads', connected: connections.threads, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-muted)"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.083.718 5.496 2.057 7.164 1.432 1.784 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.31-1.595-1.696-.089 1.188-.396 2.163-.936 2.887-.648.871-1.564 1.414-2.724 1.618-1.03.18-2.095.088-2.992-.263-1.052-.41-1.862-1.146-2.278-2.07-.356-.79-.432-1.735-.216-2.656.43-1.829 1.933-3.153 3.926-3.462.922-.143 1.843-.1 2.735.126.025-.68.01-1.37-.044-2.054l2.04-.177c.075.936.087 1.887.032 2.827 1.065.578 1.882 1.429 2.373 2.502.72 1.574.761 4.29-1.309 6.317-1.793 1.756-4.003 2.513-7.14 2.536zm-.664-8.462c-1.2.187-2.09.92-2.327 1.928-.12.512-.074 1.017.131 1.471.255.567.774.985 1.463 1.254.612.239 1.313.3 2.034.178.77-.135 1.381-.5 1.82-1.088.455-.61.691-1.46.713-2.557-.57-.17-1.17-.278-1.794-.314a8.423 8.423 0 0 0-2.04.128z"/></svg>, color: 'var(--text-muted)' },
                ].map((p) => (
                    <div key={p.name} className="flex flex-col items-center gap-2 p-4 rounded-xl text-center transition-all" style={{
                        background: `${p.color}04`,
                        border: `1px solid ${p.color}12`,
                    }}>
                        {p.icon}
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>{p.name}</span>
                        <StatusDot connected={p.connected} />
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="space-y-5 animate-in fade-in duration-700">
            {/* Page Header */}
            <div className="space-y-1">
                <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase" style={{
                    fontFamily: 'var(--font-display)',
                    background: 'linear-gradient(135deg, #00d4ff 0%, #7b61ff 40%, #ff3cac 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                }}>
                    Connections
                </h2>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                    Social Media & Source Monitoring
                </p>
            </div>

            {/* Posting Connections */}
            <PostingPlatforms />

            {/* Time Period Filter */}
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                    Post counts:
                </span>
                {(['day', 'week', 'month', 'all'] as const).map((p) => (
                    <button
                        key={p}
                        onClick={() => setStatsPeriod(p)}
                        className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all"
                        style={{
                            background: statsPeriod === p ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.02)',
                            color: statsPeriod === p ? '#00d4ff' : 'var(--text-muted)',
                            border: `1px solid ${statsPeriod === p ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.04)'}`,
                            fontFamily: 'var(--font-display)',
                        }}
                    >
                        {p === 'all' ? 'All Time' : p}
                    </button>
                ))}
            </div>

            {/* Scraping Sources */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(12,12,24,0.4)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
                <div className="p-5 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <h3 className="text-sm font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', background: 'linear-gradient(135deg, #ff3cac, #7b61ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Scraping Sources
                    </h3>
                    <p className="text-[9px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>Where KumoLab sources content from — add or remove sources below</p>
                </div>

                <div className="p-4 space-y-3">
                    {/* X / Twitter Scraping */}
                    <SectionHeader icon={XIcon} title="X (Twitter)" subtitle="Monitoring anime studio & news accounts" connected={connections.x} sectionKey="x_scrape" count={xSources.length} platform="x" />
                    <AddForm platform="x" />
                    {expandedSections.x_scrape && (
                        <div className="ml-2 space-y-0.5 pl-4 animate-in fade-in slide-in-from-top-2 duration-300" style={{ borderLeft: '2px solid rgba(0,212,255,0.1)' }}>
                            {xSources.map((acc) => (
                                <SourceItem key={acc.handle} name={acc.name} handle={acc.handle} tier={acc.tier} platform="x" identifier={acc.handle} />
                            ))}
                        </div>
                    )}

                    {/* YouTube */}
                    <SectionHeader icon={YTIcon} title="YouTube" subtitle="Studio channels, trailers & PVs" connected={connections.youtube} sectionKey="youtube" count={ytSources.length} platform="youtube" />
                    <AddForm platform="youtube" />
                    {expandedSections.youtube && (
                        <div className="ml-2 space-y-0.5 pl-4 animate-in fade-in slide-in-from-top-2 duration-300" style={{ borderLeft: '2px solid rgba(255,60,172,0.1)' }}>
                            {ytSources.map((ch) => (
                                <SourceItem key={ch.name} name={ch.name} tier={ch.tier} platform="youtube" identifier={ch.name} />
                            ))}
                        </div>
                    )}

                    {/* Reddit */}
                    <SectionHeader icon={RedditIcon} title="Reddit" subtitle="Top daily posts from anime subreddits" connected={connections.reddit} sectionKey="reddit" count={redditSources.length} platform="reddit" />
                    <AddForm platform="reddit" />
                    {expandedSections.reddit && (
                        <div className="ml-2 space-y-0.5 pl-4 animate-in fade-in slide-in-from-top-2 duration-300" style={{ borderLeft: '2px solid rgba(255,140,0,0.1)' }}>
                            {redditSources.map((sub) => (
                                <SourceItem key={sub.name} name={`${sub.name} — ${sub.type}`} platform="reddit" identifier={sub.name} />
                            ))}
                        </div>
                    )}

                    {/* KumoLab Scraper (RSS/Website) */}
                    <SectionHeader icon={RSSIcon} title="KumoLab Scraper" subtitle="Official anime sites & news via RSS feeds" connected={true} sectionKey="rss" count={rssSources.length} platform="rss" />
                    <AddForm platform="rss" />
                    {expandedSections.rss && (
                        <div className="ml-2 space-y-0.5 pl-4 animate-in fade-in slide-in-from-top-2 duration-300" style={{ borderLeft: '2px solid rgba(123,97,255,0.1)' }}>
                            {rssSources.map((site) => (
                                <SourceItem key={site.name} name={`${site.name}${site.url ? ` (${site.url})` : ''}`} tier={site.tier} lang={site.lang} platform="rss" identifier={site.name} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
