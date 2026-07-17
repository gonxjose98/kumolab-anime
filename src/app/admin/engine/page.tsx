import { getAnimeTiers } from '@/lib/engine/anime-tiers';
import EngineTiers from '@/components/admin/engine/EngineTiers';

export const dynamic = 'force-dynamic';

export default async function EnginePage() {
    const tiers = await getAnimeTiers();
    return (
        <div className="max-w-6xl mx-auto">
            <p className="ak-caption" style={{ marginBottom: 14 }}>
                Under the hood of the pipeline. These tiers are what the engine prioritizes when it decides what to post. Move an anime up or down to change how the engine treats it.
            </p>
            <EngineTiers initialTiers={tiers} />
        </div>
    );
}
