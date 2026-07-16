'use client';

import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';

interface KindCounts { last30: number; allTime: number; }
interface UserStats { name: string; videos: KindCounts; photos: KindCounts; }

/**
 * Compact per-user Studio production line, shown under the Studio tabs:
 *   "Edited (30d / all-time) — Jose 2/10 videos · 5/31 photos · Jonathan …"
 * Internal readout only; hidden entirely until there's at least one
 * finalize/save on record. Data: GET /api/admin/studio/activity.
 */
export default function StudioActivityStats() {
    const [stats, setStats] = useState<UserStats[] | null>(null);

    useEffect(() => {
        let alive = true;
        fetch('/api/admin/studio/activity', { credentials: 'same-origin' })
            .then((r) => r.json())
            .then((j) => { if (alive && j?.success && Array.isArray(j.stats)) setStats(j.stats); })
            .catch(() => { /* internal nicety — never surface an error */ });
        return () => { alive = false; };
    }, []);

    if (!stats || stats.length === 0) return null;

    return (
        <div className="ak-studio-stats" title="Internal: Studio exports/saves per editor (last 30 days / all-time)">
            <span className="ak-studio-stats__label">
                <Activity size={12} strokeWidth={2.2} /> Edited <span className="ak-studio-stats__win">30d / all</span>
            </span>
            {stats.map((u) => (
                <span key={u.name} className="ak-studio-stats__user">
                    <strong>{u.name}</strong>
                    <span>{u.videos.last30}/{u.videos.allTime} videos</span>
                    <span>·</span>
                    <span>{u.photos.last30}/{u.photos.allTime} photos</span>
                </span>
            ))}
        </div>
    );
}
