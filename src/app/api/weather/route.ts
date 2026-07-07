import { NextRequest, NextResponse } from 'next/server';
import {
    SkyWeather,
    conditionFromWmo,
    seasonFor,
    parseConditionOverride,
    parseSeasonOverride,
    defaultIntensity,
} from '@/lib/weather';

export const dynamic = 'force-dynamic';

/**
 * Ambient weather for the sky theme.
 *
 * Location comes from Vercel's edge geo headers (set for free on every request
 * in production) — no GPS permission prompt and no third-party IP lookup. That
 * lat/lon is handed to Open-Meteo (free, keyless) for the current conditions,
 * which we reduce to a small SkyWeather shape the client renders.
 *
 * Overrides (any environment) for previewing:
 *   /api/weather?weather=rain|snow|thunder|cloudy|clear   → force the condition
 *   /api/weather?season=winter|spring|summer|autumn       → force the season
 *   /api/weather?lat=..&lon=..                             → force a location
 *
 * Never throws to the client: any failure degrades to a calm 'clear' sky so the
 * theme always renders. Response is marked no-store (it's per-visitor by IP, so
 * it must not be shared-cached at the CDN).
 */

const FALLBACK = { lat: 40.7128, lon: -74.006, place: null as string | null }; // dev default (NYC)

function num(v: string | null): number | null {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function noStore(body: SkyWeather, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);

    // Season override is independent — it can pin the season even on a live read.
    const seasonOverride = parseSeasonOverride(searchParams.get('season'));
    const conditionOverride = parseConditionOverride(searchParams.get('weather'));

    // Resolve location: explicit ?lat/?lon → Vercel geo headers → dev fallback.
    const h = req.headers;
    const qLat = num(searchParams.get('lat'));
    const qLon = num(searchParams.get('lon'));
    const hLat = num(h.get('x-vercel-ip-latitude'));
    const hLon = num(h.get('x-vercel-ip-longitude'));
    const headerCity = h.get('x-vercel-ip-city');
    const place = headerCity ? decodeURIComponent(headerCity) : FALLBACK.place;

    const lat = qLat ?? hLat ?? FALLBACK.lat;
    const lon = qLon ?? hLon ?? FALLBACK.lon;
    const haveRealGeo = qLat != null || hLat != null;

    const now = new Date();

    // If the condition is forced, skip the network entirely — but still respect
    // a real/forced location for the season's hemisphere.
    if (conditionOverride) {
        const season = seasonOverride ?? seasonFor(now.getMonth(), lat);
        // Winter forces rain→snow so "?weather=rain&season=winter" reads naturally.
        const condition =
            conditionOverride === 'rain' && season === 'winter' ? 'snow' : conditionOverride;
        return noStore({
            condition,
            intensity: defaultIntensity(condition),
            season,
            isDaytime: now.getHours() >= 7 && now.getHours() < 19,
            place,
            temperatureC: null,
            source: 'override',
        });
    }

    try {
        const url =
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=weather_code,temperature_2m,is_day&timezone=auto`;
        const res = await fetch(url, {
            // Short revalidate: conditions don't change second-to-second, and this
            // keeps us well under Open-Meteo's free limits.
            next: { revalidate: 600 },
            signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) throw new Error(`open-meteo ${res.status}`);
        const data = await res.json();

        const code = Number(data?.current?.weather_code ?? 0);
        const isDay = Number(data?.current?.is_day ?? 1) === 1;
        const tempRaw = data?.current?.temperature_2m;
        const temperatureC = typeof tempRaw === 'number' ? Math.round(tempRaw) : null;

        const season = seasonOverride ?? seasonFor(now.getMonth(), lat);
        let { condition, intensity } = conditionFromWmo(code);

        // Cold-weather guard: a "rain" code at/below freezing is really snow.
        if (condition === 'rain' && temperatureC != null && temperatureC <= 0) {
            condition = 'snow';
        }

        return noStore({
            condition,
            intensity,
            season,
            isDaytime: isDay,
            place,
            temperatureC,
            source: haveRealGeo ? 'live' : 'fallback',
        });
    } catch {
        // Any failure → calm clear sky, still season-aware.
        return noStore({
            condition: 'clear',
            intensity: 0,
            season: seasonOverride ?? seasonFor(now.getMonth(), lat),
            isDaytime: now.getHours() >= 7 && now.getHours() < 19,
            place,
            temperatureC: null,
            source: 'fallback',
        });
    }
}
