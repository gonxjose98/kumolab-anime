'use client';

/**
 * Client-side conversion tracking (Q4). Two jobs:
 *   1. captureUtm()  — persist UTM attribution from the landing URL (last-touch,
 *      30-day window) so we can tie a signup/purchase back to the campaign.
 *   2. trackEvent()  — fire a funnel event to /api/event, fire-and-forget.
 *
 * Everything here is defensive: analytics must NEVER break a user flow, so all
 * paths swallow errors and no-op during SSR.
 */

const UTM_KEY = 'kumolab_utm';
const UTM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type Utm = {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
};

type StoredUtm = Utm & { capturedAt: number };

const hasWindow = () => typeof window !== 'undefined';

/** Read + parse the attribution cookie a /go/<channel> redirect may have set. */
function readRefCookie(): Utm | null {
    try {
        const m = document.cookie.match(/(?:^|;\s*)kumolab_ref=([^;]+)/);
        if (!m) return null;
        const parsed = JSON.parse(decodeURIComponent(m[1])) as Utm;
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

/** Clear the seed cookie once its attribution has been adopted into storage. */
function clearRefCookie(): void {
    try {
        document.cookie = 'kumolab_ref=; Path=/; Max-Age=0; SameSite=Lax';
    } catch {
        // ignore
    }
}

/**
 * Read utm_* params off the current URL and, if any are present, store them as
 * the active attribution (overwriting older ones — last-touch). Safe to call on
 * every navigation; a URL with no utm params leaves prior attribution intact.
 */
export function captureUtm(): void {
    if (!hasWindow()) return;
    try {
        const q = new URLSearchParams(window.location.search);
        const utm: Utm = {};
        const map: [keyof Utm, string][] = [
            ['source', 'utm_source'],
            ['medium', 'utm_medium'],
            ['campaign', 'utm_campaign'],
            ['content', 'utm_content'],
            ['term', 'utm_term'],
        ];
        for (const [key, param] of map) {
            const v = q.get(param);
            if (v) utm[key] = v.slice(0, 128);
        }
        // Fall back to attribution seeded by a /go/<channel> redirect cookie, so
        // a clean bio link (kumolabanime.com/go/ig) still attributes without an
        // ugly utm query string ever appearing on the landing URL.
        if (Object.keys(utm).length === 0) {
            const seeded = readRefCookie();
            if (seeded) Object.assign(utm, seeded);
        }
        if (Object.keys(utm).length === 0) return; // nothing to capture
        const stored: StoredUtm = { ...utm, capturedAt: Date.now() };
        window.localStorage.setItem(UTM_KEY, JSON.stringify(stored));
        clearRefCookie();
    } catch {
        // ignore — attribution is best-effort
    }
}

/** Return the stored UTM attribution, or {} if none/expired. */
export function getUtm(): Utm {
    if (!hasWindow()) return {};
    try {
        const raw = window.localStorage.getItem(UTM_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as StoredUtm;
        if (!parsed?.capturedAt || Date.now() - parsed.capturedAt > UTM_TTL_MS) {
            window.localStorage.removeItem(UTM_KEY);
            return {};
        }
        const { capturedAt, ...utm } = parsed;
        void capturedAt;
        return utm;
    } catch {
        return {};
    }
}

/**
 * Record a funnel event. Fire-and-forget: never awaits, never throws, never
 * blocks. `keepalive` lets it survive a fast navigation (e.g. add-to-cart then
 * route change, or the redirect into Stripe).
 */
export function trackEvent(
    type:
        | 'email_signup'
        | 'add_to_cart'
        | 'checkout_start'
        | 'purchase'
        | 'cta_click'
        | 'related_click'
        | 'merch_click',
    opts: { value?: number; meta?: Record<string, unknown> } = {},
): void {
    if (!hasWindow()) return;
    try {
        const payload = {
            type,
            path: window.location.pathname,
            referrer: document.referrer || null,
            value: opts.value,
            meta: opts.meta,
            utm: getUtm(),
        };
        fetch('/api/event', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
        }).catch(() => {
            // never surface anything to the user
        });
    } catch {
        // ignore — analytics must never break the page
    }
}
