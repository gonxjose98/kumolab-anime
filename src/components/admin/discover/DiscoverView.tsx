'use client';

import { useRouter } from 'next/navigation';
import RadarList from './RadarList';
import WireFeed from './WireFeed';
import type { RadarRow, WireRow } from '@/lib/discover/queries';

/** Discover = Radar (what's coming) + Wire (what's being said). One route, two pills. */
export default function DiscoverView({ tab, upcoming, airing, wire, bigThreshold, radarUpdatedAt }: {
    tab: 'radar' | 'wire';
    upcoming: RadarRow[];
    airing: RadarRow[];
    wire: WireRow[];
    bigThreshold: number;
    radarUpdatedAt: string | null;
}) {
    const router = useRouter();
    const go = (t: 'radar' | 'wire') => router.replace(`/admin/discover?tab=${t}`, { scroll: false });

    return (
        <div className="ak-disc flex flex-col gap-4 min-w-0">
            <div className="ak-pills ak-disc__tabs">
                <button className={`ak-pill ${tab === 'radar' ? 'ak-pill--active' : ''}`} onClick={() => go('radar')}>Release Radar</button>
                <button className={`ak-pill ${tab === 'wire' ? 'ak-pill--active' : ''}`} onClick={() => go('wire')}>Anime Wire</button>
            </div>
            {tab === 'radar'
                ? <RadarList upcoming={upcoming} airing={airing} bigThreshold={bigThreshold} updatedAt={radarUpdatedAt} />
                : <WireFeed initial={wire} />}
        </div>
    );
}
