/**
 * Weather + season model for the ambient sky theme.
 *
 * The site reads the visitor's coarse location for free from Vercel's edge geo
 * headers (no GPS permission prompt, no third-party IP service), asks the free
 * keyless Open-Meteo API for the current conditions, and boils the result down
 * to a small `SkyWeather` shape the sky theme can render (rain / snow / thunder
 * / overcast / clear) plus the local season.
 *
 * Pure, server-usable helpers only — no React, no fetch here. The route
 * (src/app/api/weather/route.ts) does the I/O; the client just consumes the
 * JSON shape below.
 */

export type SkyCondition = 'clear' | 'cloudy' | 'rain' | 'snow' | 'thunder';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SkyWeather {
    /** The single dominant condition the visuals key off. */
    condition: SkyCondition;
    /** Precipitation strength, 0..1. Tasteful cap (~0.7) — never a downpour. */
    intensity: number;
    /** Local season (hemisphere-aware). Tints palette + breaks rain/snow ties. */
    season: Season;
    /** Real local daytime from Open-Meteo (visuals still follow the ☀/🌙 toggle). */
    isDaytime: boolean;
    /** Coarse place label (city), for a subtle caption / debugging. */
    place: string | null;
    temperatureC: number | null;
    /** Where the reading came from: real geo, a manual ?weather override, or a dev fallback. */
    source: 'live' | 'override' | 'fallback';
}

/**
 * Map a WMO weather-interpretation code (what Open-Meteo returns in
 * `current.weather_code`) to our condition + a tasteful intensity.
 * Reference: https://open-meteo.com/en/docs (WMO code table).
 */
export function conditionFromWmo(code: number): { condition: SkyCondition; intensity: number } {
    // Thunderstorm (95, 96, 99) — implies rain + lightning.
    if (code >= 95) return { condition: 'thunder', intensity: 0.6 };

    // Snow grains / snow fall (71–77) and snow showers (85–86).
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
        const heavy = code === 75 || code === 86;
        return { condition: 'snow', intensity: heavy ? 0.65 : 0.4 };
    }

    // Freezing rain (66–67) → treat as rain.
    // Rain (61–65) and rain showers (80–82).
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
        const heavy = code === 65 || code === 82 || code === 67;
        const showers = code >= 80;
        return { condition: 'rain', intensity: heavy ? 0.7 : showers ? 0.5 : 0.45 };
    }

    // Drizzle / freezing drizzle (51–57) → light rain.
    if (code >= 51 && code <= 57) return { condition: 'rain', intensity: 0.3 };

    // Fog (45, 48) and overcast/cloudy (2, 3) → cloudy.
    if (code === 45 || code === 48 || code === 2 || code === 3) {
        return { condition: 'cloudy', intensity: 0 };
    }

    // Clear (0) / mainly clear (1) and anything unmapped → clear.
    return { condition: 'clear', intensity: 0 };
}

/**
 * Hemisphere-aware meteorological season from a month (0–11) and latitude.
 * Southern hemisphere seasons are offset by six months.
 */
export function seasonFor(month0: number, latitude: number): Season {
    const northern: Season[] = [
        'winter', 'winter', // Jan, Feb
        'spring', 'spring', 'spring', // Mar–May
        'summer', 'summer', 'summer', // Jun–Aug
        'autumn', 'autumn', 'autumn', // Sep–Nov
        'winter', // Dec
    ];
    const n = northern[Math.max(0, Math.min(11, month0))];
    if (latitude >= 0) return n;
    // Flip for the southern hemisphere.
    const flip: Record<Season, Season> = {
        winter: 'summer',
        summer: 'winter',
        spring: 'autumn',
        autumn: 'spring',
    };
    return flip[n];
}

/** Coerce a raw ?weather=… override into a valid condition, or null. */
export function parseConditionOverride(v: string | null | undefined): SkyCondition | null {
    if (!v) return null;
    const s = v.toLowerCase();
    if (s === 'clear' || s === 'cloudy' || s === 'rain' || s === 'snow' || s === 'thunder') {
        return s;
    }
    // A couple of friendly aliases.
    if (s === 'storm' || s === 'thunderstorm' || s === 'lightning') return 'thunder';
    if (s === 'sun' || s === 'sunny') return 'clear';
    return null;
}

/** Coerce a raw ?season=… override into a valid season, or null. */
export function parseSeasonOverride(v: string | null | undefined): Season | null {
    if (!v) return null;
    const s = v.toLowerCase();
    if (s === 'spring' || s === 'summer' || s === 'autumn' || s === 'winter') return s;
    if (s === 'fall') return 'autumn';
    return null;
}

/** Default intensity for a manually-forced condition (no live reading to size it). */
export function defaultIntensity(condition: SkyCondition): number {
    switch (condition) {
        case 'rain':
            return 0.4;
        case 'snow':
            return 0.45;
        case 'thunder':
            return 0.6;
        default:
            return 0;
    }
}
