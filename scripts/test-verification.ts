
import { validateAiringDrop } from '../src/lib/engine/fetchers';

console.log('Running Verification Logic Test...\n');

const cases = [
    {
        name: 'Oshi no Ko (Tier 1 Check)',
        input: {
            media: {
                title: { english: 'Oshi no Ko S3' },
                format: 'TV',
                popularity: 150000,
                isAdult: false,
                status: 'RELEASING',
                seasonYear: 2026,
                externalLinks: [{ site: 'Crunchyroll' }, { site: 'Twitter' }]
            }
        },
        expect: 'streamer'
    },
    {
        name: 'Easygoing Territory Defense (Rejection Check - Low Pop)',
        input: {
            media: {
                title: { english: 'Easygoing Territory Defense' },
                format: 'TV',
                popularity: 4500, // Too low
                isAdult: false,
                status: 'RELEASING',
                seasonYear: 2026,
                externalLinks: [{ site: 'Official Site' }] // Not in trusted list
            }
        },
        expect: null
    },
    {
        name: 'Ghost Show (Rejection Check - Old Status)',
        input: {
            media: {
                title: { english: 'Old Anime Re-airing' },
                format: 'TV',
                popularity: 25000, // High enough
                isAdult: false,
                status: 'FINISHED',
                seasonYear: 2020, // Too old
                externalLinks: []
            }
        },
        expect: null
    },
    {
        name: 'Random Short (Rejection Check - Format)',
        input: {
            media: {
                title: { english: 'Random Short' },
                format: 'TV_SHORT',
                popularity: 15000, // Moderate but format banned
                isAdult: false,
                status: 'RELEASING',
                seasonYear: 2026,
                externalLinks: []
            }
        },
        expect: null
    },
    {
        name: 'One Piece Special (Exception Check - Format + Mega Pop)',
        input: {
            media: {
                title: { english: 'One Piece Special' },
                format: 'SPECIAL',
                popularity: 60000, // Mega pop
                isAdult: false,
                status: 'RELEASING',
                seasonYear: 2026,
                externalLinks: []
            }
        },
        expect: 'format_exception'
    }
];

cases.forEach(c => {
    const result = validateAiringDrop(c.input);
    const passed = (result === null && c.expect === null) || (result?.tier === c.expect);

    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${c.name}`);
    if (!passed) {
        console.log('   Expected:', c.expect);
        console.log('   Got:', result);
    } else if (result) {
        console.log('   Provenance:', JSON.stringify(result));
    }
});
