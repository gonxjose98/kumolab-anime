
import { getSourceTier } from '../src/lib/engine/utils';

async function test() {
    const mockSupabase = {
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: () => Promise.resolve({ data: null, error: null })
                })
            })
        })
    };

    const sources = [
        'AnimeNewsNetwork',
        'animenewsnetwork',
        'ANIMENEWSNETWORK',
        'Crunchyroll',
        'Aniplex',
        'Aniplex of America',
        'Aniplex USA',
        'Variety',
        'Deadline'
    ];

    console.log('--- Tier Verification Test ---');
    for (const s of sources) {
        const tier = await getSourceTier(s, mockSupabase);
        console.log(`Source: "${s}" -> Tier: ${tier}`);
    }
}

test();
