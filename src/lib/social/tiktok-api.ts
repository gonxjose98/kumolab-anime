// TikTok Display API (read-only) for the Analytics > TikTok tile.
//
// App "KumoLab Analytics" (developers.tiktok.com), Sandbox mode with
// @kumolab.anime as the target user, scopes user.info.stats + video.list.
// Tokens live in oauth_tokens (provider 'tiktok'): the access token expires
// after 24h, so every sync refreshes it first when it is close to expiry.
// Env: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET.

import { supabaseAdmin } from '@/lib/supabase/admin';

const API = 'https://open.tiktokapis.com/v2';
export const TIKTOK_REDIRECT_URI = 'https://kumolabanime.com/api/tiktok/callback';

interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    open_id: string;
    scope: string;
}

function creds() {
    const key = process.env.TIKTOK_CLIENT_KEY;
    const secret = process.env.TIKTOK_CLIENT_SECRET;
    if (!key || !secret) throw new Error('TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not set');
    return { key, secret };
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
    const { key, secret } = creds();
    const res = await fetch(`${API}/oauth/token/`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_key: key, client_secret: secret, ...params }),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error(`TikTok token request failed: ${data.error || res.status} ${data.error_description || ''}`.trim());
    return data;
}

async function saveTokens(t: TokenResponse) {
    const now = Date.now();
    const { error } = await supabaseAdmin.from('oauth_tokens').upsert({
        provider: 'tiktok',
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: new Date(now + t.expires_in * 1000).toISOString(),
        refresh_expires_at: new Date(now + t.refresh_expires_in * 1000).toISOString(),
        open_id: t.open_id,
        scope: t.scope,
        state: null,
        updated_at: new Date(now).toISOString(),
    });
    if (error) throw new Error(`saving TikTok tokens failed: ${error.message}`);
}

/** Exchange the one-time code from the consent redirect, after checking state. */
export async function connectTikTok(code: string, state: string) {
    const { data: row } = await supabaseAdmin.from('oauth_tokens').select('state').eq('provider', 'tiktok').maybeSingle();
    if (!row?.state || row.state !== state) throw new Error('state mismatch: start the connect again');
    await saveTokens(await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: TIKTOK_REDIRECT_URI }));
}

/** A valid access token, refreshed when it has under 1 hour left. */
async function accessToken(): Promise<string> {
    const { data: row } = await supabaseAdmin.from('oauth_tokens')
        .select('access_token, refresh_token, expires_at').eq('provider', 'tiktok').maybeSingle();
    if (!row?.refresh_token) throw new Error('TikTok not connected');
    if (row.access_token && new Date(row.expires_at).getTime() - Date.now() > 3600_000) return row.access_token;
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh_token });
    await saveTokens(t);
    return t.access_token;
}

async function api(path: string, token: string, init?: RequestInit) {
    const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
    const data = await res.json();
    if (data?.error?.code && data.error.code !== 'ok') throw new Error(`TikTok ${path}: ${data.error.code} ${data.error.message || ''}`.trim());
    return data.data;
}

export interface TikTokStats {
    views: number; followers: number; likes: number; posts: number; listed: number;
}

export async function tiktokConnected(): Promise<boolean> {
    const { data } = await supabaseAdmin.from('oauth_tokens').select('refresh_token').eq('provider', 'tiktok').maybeSingle();
    return !!data?.refresh_token;
}

export interface TikTokVideo { id: string; create_time: number; view_count: number; }

/** Every post on the account (photo carousels included), newest first. */
export async function listTikTokVideos(token?: string): Promise<TikTokVideo[]> {
    token ||= await accessToken();
    const out: TikTokVideo[] = [];
    let cursor: number | undefined;
    for (let page = 0; page < 20; page++) {
        const d = await api('/video/list/?fields=id,create_time,view_count', token, {
            method: 'POST', body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
        });
        for (const v of d.videos || []) out.push({ id: v.id, create_time: v.create_time, view_count: v.view_count || 0 });
        if (!d.has_more) break;
        cursor = d.cursor;
    }
    return out;
}

/** Profile totals plus summed views across every post the API lists. */
export async function fetchTikTokStats(): Promise<TikTokStats> {
    const token = await accessToken();
    const info = await api('/user/info/?fields=follower_count,likes_count,video_count', token);
    const videos = await listTikTokVideos(token);
    const u = info.user;
    return { views: videos.reduce((a, v) => a + v.view_count, 0), followers: u.follower_count, likes: u.likes_count, posts: u.video_count, listed: videos.length };
}

/** Pull from the API and write the Analytics tile row (manual_platform_stats 'tiktok'). */
export async function syncTikTokTile() {
    const s = await fetchTikTokStats();
    const { error } = await supabaseAdmin.from('manual_platform_stats').upsert({
        platform: 'tiktok', views: s.views, followers: s.followers, likes: s.likes, posts: s.posts,
        note: `TikTok API (${s.listed} posts listed)`, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`tile update failed: ${error.message}`);
    return s;
}
