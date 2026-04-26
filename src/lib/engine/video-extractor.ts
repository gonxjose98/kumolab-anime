/**
 * video-extractor.ts
 *
 * For TRAILER_DROP candidates we need an actual video URL before publishing —
 * a "trailer" post with no embedded video is worse than no post.
 *
 * Strategy:
 *   1. If source_url is itself a YouTube link → done.
 *   2. If candidate content (RSS description) embeds a YouTube link → done.
 *   3. Otherwise fetch the source article HTML and scan for YouTube iframes,
 *      watch URLs, or oembed-style links.
 *
 * Returns null if no plausible YouTube ID is found — caller routes the post to
 * pending review instead of auto-publishing.
 */

const YOUTUBE_ID_RE = /(?:youtube\.com\/(?:embed\/|watch\?(?:[\w=&]*&)?v=|v\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export interface ExtractedVideo {
    youtube_video_id: string;
    youtube_url: string;
    youtube_embed_url: string;
}

function fromIdMatch(match: RegExpMatchArray | null): ExtractedVideo | null {
    if (!match) return null;
    const id = match[1];
    if (!id || id.length !== 11) return null;
    return {
        youtube_video_id: id,
        youtube_url: `https://www.youtube.com/watch?v=${id}`,
        youtube_embed_url: `https://www.youtube.com/embed/${id}`,
    };
}

function searchString(text: string | undefined | null): ExtractedVideo | null {
    if (!text) return null;
    return fromIdMatch(text.match(YOUTUBE_ID_RE));
}

async function fetchHtml(url: string): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (KumoLab/1.0; +https://kumolabanime.com)',
                Accept: 'text/html,application/xhtml+xml',
            },
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const html = await res.text();
        return html.length > 0 ? html : null;
    } catch {
        return null;
    }
}

export async function extractYouTubeVideo(input: {
    source_url?: string | null;
    canonical_url?: string | null;
    content?: string | null;
    title?: string | null;
}): Promise<ExtractedVideo | null> {
    // 1. Direct YouTube source
    const fromUrl = searchString(input.source_url) || searchString(input.canonical_url);
    if (fromUrl) return fromUrl;

    // 2. RSS description / candidate content
    const fromContent = searchString(input.content);
    if (fromContent) return fromContent;

    // 3. Fetch the article HTML (only if we have a non-YouTube source URL)
    const articleUrl = input.canonical_url || input.source_url;
    if (!articleUrl) return null;
    if (/youtube\.com|youtu\.be/.test(articleUrl)) return null; // already searched above

    const html = await fetchHtml(articleUrl);
    if (!html) return null;

    return searchString(html);
}
