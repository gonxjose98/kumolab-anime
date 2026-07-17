import { getAnimeTiers } from '@/lib/engine/anime-tiers';
import { getPostFormula, getPeakSlots, getScheduledQueue } from '@/lib/engine/engine-config';
import FormulaPanel from '@/components/admin/engine/FormulaPanel';
import PeakSlots from '@/components/admin/engine/PeakSlots';
import ScheduledFeed from '@/components/admin/engine/ScheduledFeed';
import EngineTiers from '@/components/admin/engine/EngineTiers';

export const dynamic = 'force-dynamic';

export default async function EnginePage() {
    const [tiers, formula, slots, queue] = await Promise.all([
        getAnimeTiers(),
        getPostFormula(),
        getPeakSlots(),
        getScheduledQueue(),
    ]);
    return (
        <div className="max-w-6xl mx-auto flex flex-col gap-5 min-w-0">
            <p className="ak-caption">
                Under the hood of the pipeline. These rules and tiers are what the engine works off directly. What you set here is what it follows.
            </p>
            <FormulaPanel formula={formula} />
            <PeakSlots initial={slots} />
            <ScheduledFeed initial={queue} slots={slots} />
            <div>
                <div className="ak-overline" style={{ marginBottom: 8 }}>Priority tiers</div>
                <EngineTiers initialTiers={tiers} />
            </div>
        </div>
    );
}
