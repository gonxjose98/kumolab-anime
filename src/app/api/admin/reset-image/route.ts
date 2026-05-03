import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { selectBestImage } from '@/lib/engine/image-selector';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Returns a clean source image URL for a post — used by the editor to
// recover from posts whose post.image got baked with an overlay.
//
// Resolution chain (each step gates on a HEAD fetch that must return 200
// + an image/* content-type, so we never hand the editor a URL that the
// renderer can't actually fetch):
//   1. youtube_video_id → CDN thumbnail
//   2. AniList banner/cover directly (almost always actual show art)
//   3. og:image scraped from source_url, but only after filtering out
//      obvious brand logos (Crunchyroll, ANN, MAL etc. all return their
//      own logo as og:image when they don't have a per-article hero set)
//   4. selectBestImage as a last resort
//
// AniList is ahead of og:image because Crunchyroll News articles
// frequently expose their site logo as og:image rather than the article
// hero — Jose hit this on the "100 girlfriends" post.
//
// We deliberately skip selectBestImage's branded fallback ('/hero-bg-final.png')
// because it's a relative path the editor render endpoint can't fetch
// over HTTP and would just produce another null-render.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function isFetchableImage(url: string | null | undefined): Promise<boolean> {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        let r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: ctrl.signal });
        clearTimeout(t);
        // Some CDNs reject HEAD — fall back to a small ranged GET.
        if (r.status === 405 || r.status === 403) {
            const ctrl2 = new AbortController();
            const t2 = setTimeout(() => ctrl2.abort(), 6000);
            r = await fetch(url, {
                method: 'GET',
                headers: { 'User-Agent': UA, Range: 'bytes=0-512' },
                signal: ctrl2.signal,
            });
            clearTimeout(t2);
        }
        if (!r.ok) return false;
        const ct = r.headers.get('content-type') || '';
        return ct.startsWith('image/');
    } catch {
        return false;
    }
}

// Heuristic — many news sites (Crunchyroll, ANN, MAL) fall back to their
// site logo as og:image when an article doesn't set a custom one. These
// would render as just the brand mark, not the show art Jose actually
// wants. If the og:image URL's path looks like a logo/brand asset we
// skip it and let the chain move on to the next strategy.
function looksLikeBrandLogo(url: string): boolean {
    const u = url.toLowerCase();
    if (/(logo|brand|favicon|icon|sprite|placeholder|default)\b/.test(u)) return true;
    if (/\/(static|assets|img)\/[^/]*\/(logo|brand)/.test(u)) return true;
    if (/crunchyroll\.com\/.*\/(logo|brand|cr_logo|crunchyroll[-_]logo)/.test(u)) return true;
    if (/animenewsnetwork\.com\/.*\/(logo|ann_logo)/.test(u)) return true;
    return false;
}

async function scrapeOgImage(url: string): Promise<string | null> {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) return null;
        const html = await r.text();
        const $ = cheerio.load(html);
        const og = $('meta[property="og:image"]').attr('content')
            || $('meta[name="og:image"]').attr('content')
            || $('meta[property="twitter:image"]').attr('content')
            || $('meta[name="twitter:image"]').attr('content');
        return og || null;
    } catch {
        return null;
    }
}

async function fetchAniListCovers(title: string): Promise<{ banner?: string; cover?: string } | null> {
    if (!title) return null;
    const query = `query ($search: String) {
        Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
            bannerImage
            coverImage { extraLarge }
            title { english romaji }
        }
    }`;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const r = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { search: title } }),
            signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!r.ok) return null;
        const j = await r.json();
        const m = j?.data?.Media;
        if (!m) return null;
        return { banner: m.bannerImage || undefined, cover: m.coverImage?.extraLarge || undefined };
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const { postId } = await req.json();
        if (!postId || typeof postId !== 'string') {
            return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });
        }

        const { data: post, error: fetchError } = await supabaseAdmin
            .from('posts')
            .select('id, title, claim_type, youtube_video_id, source_url')
            .eq('id', postId)
            .single();

        if (fetchError || !post) {
            return NextResponse.json({ success: false, error: fetchError?.message || 'Post not found' }, { status: 404 });
        }

        const tried: { source: string; url: string | null; ok: boolean }[] = [];

        // Strategy 1: YouTube CDN
        if (post.youtube_video_id) {
            const url = `https://img.youtube.com/vi/${post.youtube_video_id}/maxresdefault.jpg`;
            const ok = await isFetchableImage(url);
            tried.push({ source: 'youtube_cdn', url, ok });
            if (ok) return NextResponse.json({ success: true, url, source: 'youtube_cdn' });
        }

        // Strategy 2: AniList direct (banner first — wider crop, usually
        // cleaner art; then cover as a portrait fallback).
        const anilist = await fetchAniListCovers(post.title || '');
        if (anilist?.banner) {
            const ok = await isFetchableImage(anilist.banner);
            tried.push({ source: 'anilist_banner', url: anilist.banner, ok });
            if (ok) return NextResponse.json({ success: true, url: anilist.banner, source: 'anilist_banner' });
        }
        if (anilist?.cover) {
            const ok = await isFetchableImage(anilist.cover);
            tried.push({ source: 'anilist_cover', url: anilist.cover, ok });
            if (ok) return NextResponse.json({ success: true, url: anilist.cover, source: 'anilist_cover' });
        }

        // Strategy 3: og:image from the article URL itself, filtered to
        // skip brand-logo fallbacks (Crunchyroll News will happily return
        // its own logo as og:image when an article has no custom hero).
        if (post.source_url && /^https?:\/\//i.test(post.source_url)) {
            const og = await scrapeOgImage(post.source_url);
            const isLogo = og ? looksLikeBrandLogo(og) : false;
            const ok = og && !isLogo ? await isFetchableImage(og) : false;
            tried.push({ source: isLogo ? 'og_image_skipped_logo' : 'og_image', url: og, ok });
            if (ok && og) return NextResponse.json({ success: true, url: og, source: 'og_image' });
        }

        // Strategy 4: selectBestImage (last resort — slow + Reddit-heavy)
        try {
            const found = await selectBestImage(post.title || '', post.claim_type || 'General');
            if (found?.url && /^https?:\/\//i.test(found.url)) {
                const ok = await isFetchableImage(found.url);
                tried.push({ source: 'select_best_image', url: found.url, ok });
                if (ok) return NextResponse.json({ success: true, url: found.url, source: 'select_best_image' });
            } else {
                tried.push({ source: 'select_best_image', url: found?.url || null, ok: false });
            }
        } catch (e: any) {
            tried.push({ source: 'select_best_image', url: null, ok: false });
        }

        return NextResponse.json(
            {
                success: false,
                error: 'No clean source could be located for this post. Try Upload to attach your own image.',
                tried,
            },
            { status: 404 },
        );
    } catch (e: any) {
        console.error('[admin/reset-image] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
