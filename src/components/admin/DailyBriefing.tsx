'use client';

import { useState, useEffect } from 'react';

interface DailyReport {
    report_date: string;
    headline: string;
    candidates_found: number;
    candidates_accepted: number;
    candidates_rejected: number;
    candidates_duplicate: number;
    posts_created: number;
    posts_published: number;
    posts_approved: number;
    posts_declined: number;
    errors_count: number;
    retries_count: number;
    avg_content_score: number;
    avg_quality_grade: string;
    grade_distribution: Record<string, number>;
    agent_scores: Record<string, any>;
    issues: string[];
    highlights: string[];
}

const gradeColors: Record<string, string> = {
    'A': '#00ff88',
    'B': '#00d4ff',
    'C': '#ffaa00',
    'D': '#ff6b35',
    'F': '#ff3c3c',
    'N/A': '#666',
};

export default function DailyBriefing() {
    const [reports, setReports] = useState<DailyReport[]>([]);
    const [selected, setSelected] = useState<DailyReport | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/reports?limit=7')
            .then(r => r.json())
            .then(data => {
                setReports(data || []);
                if (data?.length > 0) setSelected(data[0]);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16,
                padding: 24,
                marginBottom: 24,
            }}>
                <div style={{ color: '#888', fontSize: 14 }}>Loading daily briefing...</div>
            </div>
        );
    }

    if (!selected) {
        return (
            <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16,
                padding: 24,
                marginBottom: 24,
            }}>
                <h3 style={{ color: '#ff3cac', fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>
                    Daily Briefing
                </h3>
                <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
                    No reports yet. Reports generate nightly at 11 PM EST.
                </p>
            </div>
        );
    }

    const r = selected;
    const hasIssues = r.issues.length > 0;
    const borderColor = hasIssues ? 'rgba(255,60,60,0.3)' : 'rgba(0,255,136,0.3)';

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${borderColor}`,
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <h3 style={{ color: '#ff3cac', fontSize: 16, fontWeight: 700, margin: '0 0 4px 0' }}>
                        Oracle Daily Briefing
                    </h3>
                    <p style={{ color: '#ccc', fontSize: 14, margin: 0, fontStyle: 'italic' }}>
                        {r.headline}
                    </p>
                </div>
                <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: `${gradeColors[r.avg_quality_grade] || '#666'}22`,
                    border: `2px solid ${gradeColors[r.avg_quality_grade] || '#666'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, fontWeight: 800, color: gradeColors[r.avg_quality_grade] || '#666',
                }}>
                    {r.avg_quality_grade}
                </div>
            </div>

            {/* Date selector */}
            {reports.length > 1 && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                    {reports.map(rep => (
                        <button
                            key={rep.report_date}
                            onClick={() => setSelected(rep)}
                            style={{
                                padding: '4px 10px',
                                borderRadius: 8,
                                border: rep.report_date === selected.report_date
                                    ? '1px solid #00d4ff'
                                    : '1px solid rgba(255,255,255,0.1)',
                                background: rep.report_date === selected.report_date
                                    ? 'rgba(0,212,255,0.15)'
                                    : 'transparent',
                                color: rep.report_date === selected.report_date ? '#00d4ff' : '#888',
                                fontSize: 12,
                                cursor: 'pointer',
                            }}
                        >
                            {new Date(rep.report_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </button>
                    ))}
                </div>
            )}

            {/* Metrics Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 12,
                marginBottom: 16,
            }}>
                <MetricBox label="Candidates" value={r.candidates_found} color="#7b61ff" />
                <MetricBox label="Accepted" value={r.candidates_accepted} color="#00ff88" />
                <MetricBox label="Rejected" value={r.candidates_rejected} color="#ff6b35" />
                <MetricBox label="Duplicates" value={r.candidates_duplicate} color="#ffaa00" />
                <MetricBox label="Published" value={r.posts_published} color="#00d4ff" />
                <MetricBox label="Errors" value={r.errors_count} color={r.errors_count > 0 ? '#ff3c3c' : '#00ff88'} />
            </div>

            {/* Grade Distribution */}
            {Object.values(r.grade_distribution).some(v => v > 0) && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Quality Distribution
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {['A', 'B', 'C', 'D', 'F'].map(g => (
                            <div key={g} style={{
                                flex: 1, textAlign: 'center', padding: '8px 0',
                                background: `${gradeColors[g]}11`,
                                borderRadius: 8,
                                border: `1px solid ${gradeColors[g]}33`,
                            }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: gradeColors[g] }}>
                                    {r.grade_distribution[g] || 0}
                                </div>
                                <div style={{ fontSize: 11, color: '#888' }}>{g}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Agent Scores */}
            {Object.keys(r.agent_scores).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Agent Performance
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {Object.entries(r.agent_scores).map(([name, data]: [string, any]) => (
                            <div key={name} style={{
                                flex: '1 1 140px',
                                background: 'rgba(255,255,255,0.04)',
                                borderRadius: 10,
                                padding: '10px 14px',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd', marginBottom: 4 }}>{name}</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                    <span style={{
                                        fontSize: 22, fontWeight: 800,
                                        color: data.score >= 70 ? '#00ff88' : data.score >= 40 ? '#ffaa00' : '#ff3c3c',
                                    }}>
                                        {data.score}
                                    </span>
                                    <span style={{ fontSize: 11, color: '#888' }}>/100</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Issues & Highlights */}
            {r.issues.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: '#ff3c3c', marginBottom: 6, fontWeight: 600 }}>Issues</div>
                    {r.issues.map((issue, i) => (
                        <div key={i} style={{
                            fontSize: 13, color: '#ff9999', padding: '4px 0',
                            borderBottom: i < r.issues.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        }}>
                            {issue}
                        </div>
                    ))}
                </div>
            )}
            {r.highlights.length > 0 && (
                <div>
                    <div style={{ fontSize: 12, color: '#00ff88', marginBottom: 6, fontWeight: 600 }}>Highlights</div>
                    {r.highlights.map((hl, i) => (
                        <div key={i} style={{
                            fontSize: 13, color: '#99ffcc', padding: '4px 0',
                            borderBottom: i < r.highlights.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        }}>
                            {hl}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function MetricBox({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div style={{
            background: `${color}08`,
            borderRadius: 10,
            padding: '10px 12px',
            border: `1px solid ${color}22`,
            textAlign: 'center',
        }}>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{label}</div>
        </div>
    );
}
