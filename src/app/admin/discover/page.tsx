import DiscoverView from '@/components/admin/discover/DiscoverView';
import { getRadarRows, getWireItems, BIG_POPULARITY } from '@/lib/discover/queries';

export const dynamic = 'force-dynamic';

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
    const sp = await searchParams;
    const tab = sp?.tab === 'wire' ? 'wire' : 'radar';
    const [{ upcoming, airing }, wire] = await Promise.all([
        tab === 'radar' ? getRadarRows() : Promise.resolve({ upcoming: [], airing: [] }),
        tab === 'wire' ? getWireItems({ limit: 50 }) : Promise.resolve([]),
    ]);
    const radarUpdatedAt = [...upcoming, ...airing].reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null);
    return (
        <div className="w-full">
            <DiscoverView tab={tab} upcoming={upcoming} airing={airing} wire={wire} bigThreshold={BIG_POPULARITY} radarUpdatedAt={radarUpdatedAt} />
        </div>
    );
}
