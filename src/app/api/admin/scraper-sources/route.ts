import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Default sources — synced with sources-config.ts, x-monitor.ts, expanded-rss.ts
// Last synced: 2026-03-12
const DEFAULT_SOURCES = {
    x: [
        // T1: Platforms (auto-publish worthy)
        { handle: 'Crunchyroll', name: 'Crunchyroll', tier: 1, id: '1567507580' },
        { handle: 'NetflixAnime', name: 'Netflix Anime', tier: 1, id: '80384892' },
        { handle: 'AniplexUSA', name: 'Aniplex USA', tier: 1, id: '138176537' },
        // T2: Publishers & news (needs review)
        { handle: 'toho_animation', name: 'TOHO Animation', tier: 2, id: '294510573' },
        { handle: 'KadokawaAnime', name: 'Kadokawa', tier: 2, id: '164224501' },
        { handle: 'MAPPA_Info', name: 'MAPPA', tier: 2, id: '1032494551180222464' },
        { handle: 'AnimeNewsNet', name: 'Anime News Network', tier: 2, id: '11964382' },
        { handle: 'AniTrendz', name: 'AniTrendz', tier: 2, id: '187460970' },
        { handle: 'VIZMedia', name: 'Viz Media', tier: 2, id: '' },
        // T3: Studios & niche platforms (manual only)
        { handle: 'ufotable', name: 'Ufotable', tier: 3, id: '96958501' },
        { handle: 'kyoani', name: 'Kyoto Animation', tier: 3, id: '100507039' },
        { handle: 'HIDIVEofficial', name: 'HIDIVE', tier: 3, id: '2762868188' },
    ],
    youtube: [
        // T1: Studios (direct source of trailers/PVs)
        { name: 'MAPPA', tier: 1 },
        { name: 'Ufotable', tier: 1 },
        { name: 'A-1 Pictures', tier: 1 },
        { name: 'CloverWorks', tier: 1 },
        // T2: Publishers & committees
        { name: 'Aniplex', tier: 2 },
        { name: 'Kadokawa', tier: 2 },
        { name: 'TOHO Animation', tier: 2 },
        { name: 'Pony Canyon', tier: 2 },
        { name: 'Viz Media', tier: 2 },
        // T3: Streaming platforms
        { name: 'Crunchyroll', tier: 3 },
        { name: 'Netflix Anime', tier: 3 },
    ],
    reddit: [
        { name: 'r/anime', url: 'reddit.com/r/anime', type: 'Top daily posts' },
    ],
    rss: [
        // T1: Japanese primary sources (earliest news)
        { name: 'Natalie.mu', url: 'natalie.mu', tier: 1, lang: 'JP' },
        { name: 'Oricon Anime', url: 'oricon.co.jp', tier: 1, lang: 'JP' },
        // T2: Established anime news (verified working)
        { name: 'MyAnimeList News', url: 'myanimelist.net', tier: 2, lang: 'EN' },
        { name: 'Anime News Network', url: 'animenewsnetwork.com', tier: 2, lang: 'EN' },
        { name: 'OtakuNews', url: 'otakunews.com', tier: 2, lang: 'EN' },
        { name: 'Anime UK News', url: 'animeuknews.net', tier: 2, lang: 'EN' },
        // T3: Japanese entertainment (broader coverage)
        { name: 'MANTAN Web', url: 'mantan-web.jp', tier: 3, lang: 'JP' },
    ],
};

const STORAGE_KEY = 'scraper-config.json';
const BUCKET = 'blog-images';

/** Read the scraper config from Supabase Storage, or return defaults */
async function readConfig(): Promise<typeof DEFAULT_SOURCES> {
    try {
        const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(STORAGE_KEY);
        if (data && !error) {
            const text = await data.text();
            const parsed = JSON.parse(text);
            return { ...DEFAULT_SOURCES, ...parsed };
        }
    } catch {
        // Config doesn't exist yet — will seed on first write
    }
    return DEFAULT_SOURCES;
}

/** Write the scraper config to Supabase Storage */
async function writeConfig(config: typeof DEFAULT_SOURCES): Promise<void> {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    await supabaseAdmin.storage.from(BUCKET).upload(STORAGE_KEY, blob, {
        upsert: true,
        contentType: 'application/json',
    });
}

/** GET — List all scraper sources */
export async function GET() {
    try {
        const config = await readConfig();
        return NextResponse.json(config);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/** POST — Add a new source */
export async function POST(req: NextRequest) {
    try {
        const { platform, source } = await req.json();

        if (!platform || !source) {
            return NextResponse.json({ error: 'platform and source are required' }, { status: 400 });
        }

        const validPlatforms = ['x', 'youtube', 'reddit', 'rss'];
        if (!validPlatforms.includes(platform)) {
            return NextResponse.json({ error: `Invalid platform. Use: ${validPlatforms.join(', ')}` }, { status: 400 });
        }

        const config = await readConfig();

        // Check for duplicates
        const existing = (config as any)[platform] as any[];
        const isDuplicate = existing.some((s: any) =>
            (s.handle && s.handle === source.handle) ||
            (s.name && s.name === source.name) ||
            (s.url && s.url === source.url)
        );

        if (isDuplicate) {
            return NextResponse.json({ error: 'Source already exists' }, { status: 409 });
        }

        // Add the new source
        (config as any)[platform].push(source);
        await writeConfig(config);

        return NextResponse.json({ success: true, config });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/** DELETE — Remove a source */
export async function DELETE(req: NextRequest) {
    try {
        const { platform, identifier } = await req.json();

        if (!platform || !identifier) {
            return NextResponse.json({ error: 'platform and identifier (handle/name/url) are required' }, { status: 400 });
        }

        const config = await readConfig();
        const list = (config as any)[platform] as any[];

        if (!list) {
            return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
        }

        const filtered = list.filter((s: any) =>
            s.handle !== identifier && s.name !== identifier && s.url !== identifier
        );

        if (filtered.length === list.length) {
            return NextResponse.json({ error: 'Source not found' }, { status: 404 });
        }

        (config as any)[platform] = filtered;
        await writeConfig(config);

        return NextResponse.json({ success: true, config });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
