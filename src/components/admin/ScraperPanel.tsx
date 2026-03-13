'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────

interface ScraperFeed {
  cutoff: string;
  summary: {
    totalCandidates: number;
    youtubeVideos: number;
    rssArticles: number;
    newsroomItems: number;
    postsCreated: number;
    postsPending: number;
    postsPublished: number;
  };
  youtube: {
    items: ScraperItem[];
    channels: { name: string; count: number; bestGrade: number; bestTitle: string }[];
  };
  rss: {
    items: ScraperItem[];
    sources: { name: string; count: number }[];
  };
  newsroom: {
    items: ScraperItem[];
  };
  posts: any[];
  health: { name: string; score: number; enabled: boolean; lastSuccess: string; failures: number }[];
  lastRuns: {
    detection: { at: string; status: string } | null;
    processing: { at: string; status: string } | null;
    dailyDrops: { at: string; status: string } | null;
  };
}

interface ScraperItem {
  id: string;
  title: string;
  source: string;
  url: string;
  detected_at: string;
  status: string;
  tier: number;
  media?: string[];
  content_grade?: number;
  content_category?: string;
  content_label?: string;
  channel_name?: string;
}

// ─── Constants ───────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  TRAILER: '#ff3c3c',
  TEASER: '#ff6b35',
  SEASON_ANNOUNCEMENT: '#ff3cac',
  KEY_VISUAL: '#7b61ff',
  THEME_SONG: '#00d4ff',
  RELEASE_DATE: '#00ff88',
  ANNOUNCEMENT: '#00d4ff',
  CAST: '#ffaa00',
  CM: '#888',
  PREVIEW: '#666',
  EPISODE: '#555',
  GENERAL: '#444',
  OTHER: '#333',
};

const TIER_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'T1', color: '#00ff88' },
  2: { label: 'T2', color: '#00d4ff' },
  3: { label: 'T3', color: '#ffaa00' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
}

// ─── Sub-components ──────────────────────────────────────────

function StatCard({ label, value, accent, sub }: { label: string; value: number | string; accent: string; sub?: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12,
      padding: '16px 20px',
      flex: '1 1 140px',
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-display)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function GradeBadge({ grade, category }: { grade: number; category: string }) {
  const color = GRADE_COLORS[category] || '#555';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: `${color}18`,
      color,
      border: `1px solid ${color}30`,
      borderRadius: 6,
      padding: '2px 8px',
      fontSize: 10,
      fontWeight: 700,
      fontFamily: 'var(--font-display)',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, opacity: 0.8 }} />
      {grade}/10
    </span>
  );
}

function TierBadge({ tier }: { tier: number }) {
  const info = TIER_LABELS[tier] || { label: `T${tier}`, color: '#555' };
  return (
    <span style={{
      display: 'inline-block',
      background: `${info.color}15`,
      color: info.color,
      border: `1px solid ${info.color}25`,
      borderRadius: 4,
      padding: '1px 6px',
      fontSize: 9,
      fontWeight: 700,
      fontFamily: 'var(--font-display)',
    }}>
      {info.label}
    </span>
  );
}

function HealthDot({ score, enabled }: { score: number; enabled: boolean }) {
  if (!enabled) return <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff3c3c', display: 'inline-block' }} title="Disabled" />;
  const color = score >= 80 ? '#00ff88' : score >= 50 ? '#ffaa00' : '#ff3c3c';
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} title={`Health: ${score}`} />;
}

function SectionHeader({ icon, title, count, accent }: { icon: React.ReactNode; title: string; count: number; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${accent}15`, border: `1px solid ${accent}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: accent,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f8', fontFamily: 'var(--font-display)' }}>{title}</div>
        <div style={{ fontSize: 11, color: '#666' }}>{count} items detected today</div>
      </div>
    </div>
  );
}

// ─── YouTube Section ─────────────────────────────────────────

function YouTubeSection({ data }: { data: ScraperFeed['youtube'] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? data.items : data.items.slice(0, 6);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: 24,
    }}>
      <SectionHeader
        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><polygon fill="#fff" points="9.545,15.568 15.818,12 9.545,8.432"/></svg>}
        title="YouTube Channels"
        count={data.items.length}
        accent="#ff3c3c"
      />

      {/* Channel Summary Cards */}
      {data.channels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {data.channels.map(ch => (
            <div key={ch.name} style={{
              background: 'rgba(255,60,60,0.06)',
              border: '1px solid rgba(255,60,60,0.12)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
            }}>
              <div style={{ color: '#e8e8f8', fontWeight: 600, fontFamily: 'var(--font-display)' }}>{ch.name}</div>
              <div style={{ color: '#888', fontSize: 11 }}>
                {ch.count} video{ch.count !== 1 ? 's' : ''}
                {ch.bestGrade >= 7 && <span style={{ color: '#ff3cac', marginLeft: 6 }}>★ {ch.bestGrade}/10</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video List */}
      {visibleItems.length === 0 ? (
        <div style={{ color: '#555', fontSize: 13, fontStyle: 'italic', padding: '12px 0' }}>
          No YouTube videos detected today yet. Scanning runs 6 AM — 9 PM EST.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibleItems.map(item => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: 10,
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,60,60,0.2)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.04)';
              }}
            >
              {/* Thumbnail */}
              {item.media?.[0] && (
                <div style={{
                  width: 80, height: 45, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                  background: 'rgba(0,0,0,0.3)',
                }}>
                  <img src={item.media[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  color: '#e8e8f8', fontSize: 13, fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ color: '#888', fontSize: 11 }}>{item.channel_name || item.source}</span>
                  <TierBadge tier={item.tier} />
                  {item.content_grade && item.content_category && (
                    <GradeBadge grade={item.content_grade} category={item.content_category} />
                  )}
                </div>
              </div>

              {/* Time */}
              <div style={{ color: '#555', fontSize: 11, flexShrink: 0 }}>
                {timeAgo(item.detected_at)}
              </div>
            </a>
          ))}
        </div>
      )}

      {data.items.length > 6 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none', border: 'none', color: '#00d4ff', fontSize: 12,
            cursor: 'pointer', padding: '8px 0', fontFamily: 'var(--font-display)',
          }}
        >
          {expanded ? 'Show less' : `Show all ${data.items.length} videos`}
        </button>
      )}
    </div>
  );
}

// ─── RSS Section ─────────────────────────────────────────────

function RSSSection({ data }: { data: ScraperFeed['rss'] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? data.items : data.items.slice(0, 8);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: 24,
    }}>
      <SectionHeader
        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>}
        title="RSS News & Articles"
        count={data.items.length}
        accent="#00d4ff"
      />

      {/* Source Summary */}
      {data.sources.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {data.sources.map(src => (
            <div key={src.name} style={{
              background: 'rgba(0,212,255,0.06)',
              border: '1px solid rgba(0,212,255,0.12)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
            }}>
              <span style={{ color: '#e8e8f8', fontWeight: 600, fontFamily: 'var(--font-display)' }}>{src.name}</span>
              <span style={{ color: '#00d4ff', marginLeft: 6, fontWeight: 700 }}>{src.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Article List */}
      {visibleItems.length === 0 ? (
        <div style={{ color: '#555', fontSize: 13, fontStyle: 'italic', padding: '12px 0' }}>
          No RSS articles detected today yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {visibleItems.map(item => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: 8,
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,212,255,0.15)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.04)';
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  color: '#e8e8f8', fontSize: 13, fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <span style={{ color: '#888', fontSize: 11 }}>{item.source}</span>
                  <TierBadge tier={item.tier} />
                  <span style={{ color: '#555', fontSize: 10 }}>{formatTime(item.detected_at)}</span>
                </div>
              </div>
              <div style={{ color: '#555', fontSize: 11, flexShrink: 0 }}>
                {timeAgo(item.detected_at)}
              </div>
            </a>
          ))}
        </div>
      )}

      {data.items.length > 8 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none', border: 'none', color: '#00d4ff', fontSize: 12,
            cursor: 'pointer', padding: '8px 0', fontFamily: 'var(--font-display)',
          }}
        >
          {expanded ? 'Show less' : `Show all ${data.items.length} articles`}
        </button>
      )}
    </div>
  );
}

// ─── Detection Timeline ──────────────────────────────────────

function DetectionTimeline({ items }: { items: ScraperItem[] }) {
  if (items.length === 0) return null;

  // Group by hour
  const byHour: Record<string, ScraperItem[]> = {};
  for (const item of items) {
    const hour = formatTime(item.detected_at).replace(/:\d{2}/, ':00');
    if (!byHour[hour]) byHour[hour] = [];
    byHour[hour].push(item);
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: 24,
    }}>
      <SectionHeader
        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
        title="Detection Timeline"
        count={items.length}
        accent="#7b61ff"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.entries(byHour).map(([hour, hourItems]) => (
          <div key={hour}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', background: '#7b61ff',
                boxShadow: '0 0 8px rgba(123,97,255,0.4)',
              }} />
              <span style={{ color: '#7b61ff', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                {hour} EST
              </span>
              <span style={{ color: '#555', fontSize: 11 }}>
                ({hourItems.length} item{hourItems.length !== 1 ? 's' : ''})
              </span>
            </div>
            <div style={{ marginLeft: 16, borderLeft: '1px solid rgba(123,97,255,0.15)', paddingLeft: 16 }}>
              {hourItems.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                  fontSize: 12, color: '#aaa',
                }}>
                  <span style={{ color: '#e8e8f8', fontWeight: 500 }}>{item.title.substring(0, 60)}{item.title.length > 60 ? '...' : ''}</span>
                  <span style={{ color: '#666', fontSize: 10 }}>{item.source}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Source Health Grid ──────────────────────────────────────

function SourceHealthGrid({ health }: { health: ScraperFeed['health'] }) {
  if (health.length === 0) return null;

  const ytSources = health.filter(h => h.name.startsWith('YouTube_'));
  const rssSources = health.filter(h => !h.name.startsWith('YouTube_'));

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: 24,
    }}>
      <SectionHeader
        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>}
        title="Source Health"
        count={health.length}
        accent="#00ff88"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {[...rssSources, ...ytSources].map(src => (
          <div key={src.name} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
            borderRadius: 8,
          }}>
            <HealthDot score={src.score} enabled={src.enabled} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                color: src.enabled ? '#ccc' : '#666',
                fontSize: 11, fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {src.name.replace('YouTube_', 'YT: ')}
              </div>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-display)',
              color: src.score >= 80 ? '#00ff88' : src.score >= 50 ? '#ffaa00' : '#ff3c3c',
            }}>
              {src.score}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Scraper Panel ──────────────────────────────────────

export default function ScraperPanel() {
  const [feed, setFeed] = useState<ScraperFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchFeed = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/admin/scraper-feed');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFeed(data);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchFeed, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{
          width: 32, height: 32, border: '2px solid rgba(0,212,255,0.2)',
          borderTop: '2px solid #00d4ff', borderRadius: '50%',
          animation: 'spin 1s linear infinite', margin: '0 auto 12px',
        }} />
        <div style={{ color: '#666', fontSize: 13 }}>Loading scraper intelligence...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'rgba(255,60,60,0.06)',
        border: '1px solid rgba(255,60,60,0.15)',
        borderRadius: 16, padding: 24, textAlign: 'center',
      }}>
        <div style={{ color: '#ff3c3c', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Failed to load scraper feed</div>
        <div style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>{error}</div>
        <button
          onClick={() => { setLoading(true); fetchFeed(); }}
          style={{
            background: 'rgba(255,60,60,0.1)', color: '#ff3c3c', border: '1px solid rgba(255,60,60,0.2)',
            padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!feed) return null;

  // Combine all items for the timeline
  const allItems = [
    ...feed.youtube.items,
    ...feed.rss.items,
    ...feed.newsroom.items,
  ].sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h2 style={{
            fontSize: 20, fontWeight: 700, color: '#e8e8f8',
            fontFamily: 'var(--font-display)', margin: 0,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: '#00d4ff' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            Scraper Intelligence
          </h2>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
            Daily feed starting 6:00 AM EST &middot; Last refresh: {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
          </div>
        </div>

        <button
          onClick={() => { setLoading(true); fetchFeed(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(0,212,255,0.08)', color: '#00d4ff',
            border: '1px solid rgba(0,212,255,0.2)',
            padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
            fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-display)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,255,0.15)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,255,0.08)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><polyline points="21 3 21 9 15 9"/></svg>
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <StatCard label="Total Detected" value={feed.summary.totalCandidates} accent="#e8e8f8" />
        <StatCard label="YouTube" value={feed.summary.youtubeVideos} accent="#ff3c3c" sub={`${feed.youtube.channels.length} channels`} />
        <StatCard label="RSS News" value={feed.summary.rssArticles} accent="#00d4ff" sub={`${feed.rss.sources.length} sources`} />
        <StatCard label="Newsroom" value={feed.summary.newsroomItems} accent="#7b61ff" />
        <StatCard label="Posts Created" value={feed.summary.postsCreated} accent="#00ff88" sub={`${feed.summary.postsPending} pending`} />
      </div>

      {/* Worker Status */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 12, padding: '12px 16px',
      }}>
        {[
          { label: 'Detection Worker', run: feed.lastRuns.detection, color: '#00d4ff' },
          { label: 'Processing Worker', run: feed.lastRuns.processing, color: '#7b61ff' },
          { label: 'Daily Drops', run: feed.lastRuns.dailyDrops, color: '#00ff88' },
        ].map(w => (
          <div key={w.label} style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: w.run?.status === 'success' ? w.color : '#ff3c3c',
              boxShadow: w.run?.status === 'success' ? `0 0 6px ${w.color}60` : 'none',
            }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#ccc', fontFamily: 'var(--font-display)' }}>{w.label}</div>
              <div style={{ fontSize: 10, color: '#666' }}>
                {w.run ? `${timeAgo(w.run.at)} (${w.run.status})` : 'No runs today'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Content Sections */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <YouTubeSection data={feed.youtube} />
        <RSSSection data={feed.rss} />
      </div>

      {/* Detection Timeline + Source Health */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <DetectionTimeline items={allItems.slice(0, 30)} />
        <SourceHealthGrid health={feed.health} />
      </div>

      {/* Newsroom Section (if has items) */}
      {feed.newsroom.items.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16,
          padding: 24,
        }}>
          <SectionHeader
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>}
            title="Newsroom (Trending)"
            count={feed.newsroom.items.length}
            accent="#ff3cac"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {feed.newsroom.items.map(item => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: 8,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#e8e8f8', fontSize: 13, fontWeight: 500 }}>{item.title}</div>
                  <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{item.source}</div>
                </div>
                <span style={{ color: '#555', fontSize: 11 }}>{timeAgo(item.detected_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
