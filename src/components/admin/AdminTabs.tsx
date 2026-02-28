'use client';

import { useState, type ReactNode } from 'react';
import ConnectionsPanel from './ConnectionsPanel';

interface AdminTabsProps {
    dashboardContent: ReactNode;
}

const TABS = [
    { key: 'dashboard', label: 'Dashboard', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>, color: '#00d4ff' },
    { key: 'connections', label: 'Connections', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, color: '#ff3cac' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function AdminTabs({ dashboardContent }: AdminTabsProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Top-level Tab Bar */}
            <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{
                background: 'rgba(12,12,24,0.5)',
                border: '1px solid rgba(255,255,255,0.05)',
                backdropFilter: 'blur(20px)',
            }}>
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className="relative flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all duration-300 group"
                        style={{
                            color: activeTab === tab.key ? '#fff' : 'var(--text-muted)',
                            background: activeTab === tab.key ? `${tab.color}15` : 'transparent',
                            border: activeTab === tab.key ? `1px solid ${tab.color}30` : '1px solid transparent',
                            boxShadow: activeTab === tab.key ? `0 4px 20px ${tab.color}12` : 'none',
                            fontFamily: 'var(--font-display)',
                        }}
                    >
                        <span style={{ color: activeTab === tab.key ? tab.color : 'var(--text-muted)' }} className="transition-colors">
                            {tab.icon}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
                        {activeTab === tab.key && (
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{ background: tab.color, opacity: 0.5 }} />
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="animate-in fade-in duration-500">
                {activeTab === 'dashboard' && dashboardContent}
                {activeTab === 'connections' && <ConnectionsPanel />}
            </div>
        </div>
    );
}
