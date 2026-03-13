'use client';

import { useState } from 'react';
import AdminPageHeader from './AdminSubLayout';

interface DocSection {
    id: string;
    title: string;
    icon: string;
    color: string;
    content: string;
}

const DOCS: DocSection[] = [
    {
        id: 'pipeline',
        title: 'Scraper Pipeline',
        icon: 'M13 10V3L4 14h7v7l9-11h-7z',
        color: '#00d4ff',
        content: `## Content Detection Pipeline

The KumoLab scraper operates in three stages:

### Stage 1: Detection Worker (every 10 min)
Runs via **GitHub Actions**. Scans configured sources:
- **RSS Feeds** — Anime News Network, Crunchyroll News, MAL News, etc.
- **YouTube** — Official studio/publisher channels for trailers
- **Newsroom** — AniList trending, MAL seasonal, Reddit hot posts

Raw content is inserted into the \`detection_candidates\` table with status \`pending_processing\`.

### Stage 2: Processing Worker (hourly at :00)
Runs via **Vercel Cron**. For each candidate:
1. **Scores** using source tier, content type, visual evidence, temporal relevance
2. **Deduplicates** via event fingerprint + 70% word-match threshold
3. **Enriches** with anime metadata, images, structured content
4. **Filters** — score >= 2 becomes a pending post; < -2 is auto-rejected

### Stage 3: Publishing
- **Approved posts** get scheduled to time slots (08:00, 12:00, 16:00, 20:00 EST)
- **Daily Drops** publish at 6 AM EST from AniList airing data
- **T1 YouTube trailers** can be auto-approved`,
    },
    {
        id: 'source-tiers',
        title: 'Source Tier System',
        icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
        color: '#7b61ff',
        content: `## 3-Tier Source Hierarchy

### Tier 1 — Official Sources (Weight 8-10)
Highest authority. Auto-approve eligible.
- **Studios**: MAPPA, Ufotable, Kyoto Animation, A-1 Pictures, Wit Studio, BONES, Madhouse, Production I.G, Sunrise, Trigger
- **Publishers**: Aniplex, Kadokawa, TOHO Animation, Shueisha, Kodansha, Bandai Namco
- **YouTube**: Official studio and publisher channels

### Tier 2 — Verified News Distributors (Weight 6-8)
Reliable secondary sources. Require manual approval.
- **English**: Anime News Network, MyAnimeList, AnimeUKNews, Anime Herald, Crunchyroll
- **Japanese**: Natalie.mu, Oricon Anime, Mantan Web

### Tier 3 — Signal Detection (Weight 2-5)
Social signals. Always require review.
- **X/Twitter** monitoring via Nitter instances
- Tracked accounts: @Crunchyroll, @AniplexUSA, @MAPPA_Info, @kyoani, @ufotable, etc.

### Scoring Breakdown
| Factor | Points |
|--------|--------|
| Source Authority | +1 to +5 |
| Content Type (trailer/season) | +0 to +4 |
| Visual Evidence | +2 |
| Temporal Relevance | +1 to +2 |
| Stale/Off-topic Penalty | -2 to -4 |`,
    },
    {
        id: 'approval-flow',
        title: 'Approval Workflow',
        icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        color: '#00ff88',
        content: `## Post Approval Lifecycle

\`\`\`
Scraped → Detection Candidate → Processing → Pending Post
                                                   ↓
                                    ┌── Approved → Scheduled → Published
                                    └── Declined → declined_posts table
\`\`\`

### Status Flow
1. **Pending** — Awaiting admin review in the Post Manager
2. **Approved** — Admin clicked approve; auto-scheduled to next available time slot
3. **Published** — Cron job published at scheduled time; live on site
4. **Declined** — Rejected; tracked in \`declined_posts\` for deduplication

### Auto-Approval Rules
- T1 YouTube trailers with score >= 7 can be auto-approved
- Daily Drops (AniList airing episodes) are auto-published at 6 AM EST

### Time Slots (EST)
Posts are scheduled to 4 daily slots: **10:00 AM, 2:00 PM, 6:00 PM, 9:00 PM**
If all slots are filled, the post rolls to the next day at 10:00 AM.`,
    },
    {
        id: 'agents',
        title: 'Agent Capabilities',
        icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
        color: '#ff3cac',
        content: `## KumoLab Agent Registry

### Jarvis
**Role**: Full-stack development, UI/UX, system architecture
- Implements features, fixes bugs, deploys updates
- Builds admin dashboard components
- Manages database migrations and API routes

### Oracle (Kimi)
**Role**: Strategic planning, task analysis, workflow optimization
- Analyzes requirements and recommends improvements
- Plans implementation strategies
- Reviews agent work and coordination

### Scraper
**Role**: Content detection, RSS/YouTube/Newsroom scanning
- Runs every 10 minutes via GitHub Actions
- Processes detection candidates hourly
- Manages source health and reliability scoring

### Publisher
**Role**: Scheduled post publishing, social distribution
- Publishes approved posts at scheduled time slots
- Distributes to X/Twitter, Instagram, Facebook, Threads
- Manages Daily Drops at 6 AM EST`,
    },
    {
        id: 'cron',
        title: 'Cron Schedule',
        icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
        color: '#ffaa00',
        content: `## Cron Job Configuration

### GitHub Actions (Detection)
| Schedule | Worker | Action |
|----------|--------|--------|
| Every 10 min | Detection Worker | Scan RSS, YouTube, Newsroom sources |

### Vercel Cron (Processing + Publishing)
| Schedule | Worker | Action |
|----------|--------|--------|
| Hourly at :00 | Processing Worker | Score, dedup, enrich candidates → posts |
| 6:00 AM EST | Daily Drops | Publish AniList airing episodes |
| 8:00 AM EST | Publisher | Publish scheduled morning posts |
| 12:00 PM EST | Publisher | Publish scheduled midday posts |
| 4:00 PM EST | Publisher | Publish scheduled afternoon posts |
| 8:00 PM EST | Publisher | Publish scheduled evening posts |

### Source Health Monitoring
- Health score: 0-100 (starts at 100)
- Decay: -10 per failure
- Recovery: +5 per success
- Disabled threshold: < 30
- Skip duration: 30 min after 3 consecutive failures
- Auto re-enable: health recovers above threshold`,
    },
];

export default function DocsPageClient() {
    const [activeSection, setActiveSection] = useState(DOCS[0].id);

    const activeDoc = DOCS.find(d => d.id === activeSection)!;

    // Simple markdown-to-JSX renderer
    const renderContent = (md: string) => {
        const lines = md.split('\n');
        const elements: React.ReactNode[] = [];
        let inTable = false;
        let tableRows: string[][] = [];
        let inCode = false;
        let codeContent = '';

        const flushTable = () => {
            if (tableRows.length > 0) {
                elements.push(
                    <div key={`table-${elements.length}`} className="my-3 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                        <table className="w-full text-[10px]">
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                    {tableRows[0].map((h, i) => (
                                        <th key={i} className="px-3 py-2 text-left font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.slice(1).map((row, ri) => (
                                    <tr key={ri}>
                                        {row.map((cell, ci) => (
                                            <td key={ci} className="px-3 py-1.5" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{cell}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
                tableRows = [];
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Code blocks
            if (line.trim().startsWith('```')) {
                if (inCode) {
                    elements.push(
                        <pre key={`code-${i}`} className="my-3 p-3 rounded-lg text-[10px] font-mono overflow-x-auto" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                            {codeContent}
                        </pre>
                    );
                    codeContent = '';
                    inCode = false;
                } else {
                    inCode = true;
                }
                continue;
            }

            if (inCode) {
                codeContent += (codeContent ? '\n' : '') + line;
                continue;
            }

            // Table rows
            if (line.trim().startsWith('|')) {
                if (line.trim().match(/^\|[\s-:|]+\|$/)) continue; // separator row
                const cells = line.split('|').slice(1, -1).map(c => c.trim());
                if (!inTable) inTable = true;
                tableRows.push(cells);
                continue;
            } else if (inTable) {
                inTable = false;
                flushTable();
            }

            // Headers
            if (line.startsWith('## ')) {
                elements.push(<h2 key={i} className="text-base font-bold mt-4 mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{line.slice(3)}</h2>);
            } else if (line.startsWith('### ')) {
                elements.push(<h3 key={i} className="text-[13px] font-bold mt-3 mb-1" style={{ fontFamily: 'var(--font-display)', color: activeDoc.color }}>{line.slice(4)}</h3>);
            } else if (line.startsWith('- ')) {
                const text = line.slice(2);
                elements.push(
                    <div key={i} className="flex items-start gap-2 ml-2 mb-0.5">
                        <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: activeDoc.color }} />
                        <span className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }} dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.*?)\*\*/g, `<strong style="color: var(--text-primary)">$1</strong>`).replace(/`(.*?)`/g, `<code style="background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 3px; font-size: 10px;">$1</code>`) }} />
                    </div>
                );
            } else if (line.trim() === '') {
                elements.push(<div key={i} className="h-1" />);
            } else {
                elements.push(
                    <p key={i} className="text-[11px] leading-relaxed mb-1" style={{ color: 'var(--text-secondary)' }} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, `<strong style="color: var(--text-primary)">$1</strong>`).replace(/`(.*?)`/g, `<code style="background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 3px; font-size: 10px;">$1</code>`) }} />
                );
            }
        }

        if (inTable) flushTable();

        return elements;
    };

    return (
        <div className="max-w-7xl mx-auto">
            <AdminPageHeader
                title="Documentation"
                subtitle="KumoLab system reference and operational guides"
                accentColor="#ffaa00"
                icon="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />

            <div className="flex gap-4 flex-col lg:flex-row">
                {/* Sidebar Nav */}
                <div className="w-full lg:w-56 flex-shrink-0">
                    <div
                        className="rounded-xl overflow-hidden lg:sticky lg:top-20"
                        style={{ background: 'rgba(12,12,24,0.5)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}
                    >
                        <div className="p-2 space-y-0.5">
                            {DOCS.map((doc) => (
                                <button
                                    key={doc.id}
                                    onClick={() => setActiveSection(doc.id)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-left"
                                    style={{
                                        background: activeSection === doc.id ? `${doc.color}10` : 'transparent',
                                        border: activeSection === doc.id ? `1px solid ${doc.color}20` : '1px solid transparent',
                                    }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={activeSection === doc.id ? doc.color : 'var(--text-muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d={doc.icon} />
                                    </svg>
                                    <span
                                        className="text-[10px] font-bold uppercase tracking-wider"
                                        style={{ fontFamily: 'var(--font-display)', color: activeSection === doc.id ? doc.color : 'var(--text-muted)' }}
                                    >
                                        {doc.title}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div
                    className="flex-1 rounded-xl p-5"
                    style={{ background: 'rgba(12,12,24,0.5)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}
                >
                    {renderContent(activeDoc.content)}
                </div>
            </div>
        </div>
    );
}
