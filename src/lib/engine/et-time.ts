/**
 * et-time.ts — US-Eastern wall-clock helpers, with no dependencies.
 *
 * Extracted verbatim from scheduler.ts so the Engine blueprint's clock (a
 * CLIENT component) can compute bead angles. It cannot import scheduler.ts:
 * that module imports supabaseAdmin, which THROWS at module load when
 * SUPABASE_SERVICE_ROLE_KEY is absent and must never reach the browser.
 *
 * This file must therefore stay import-free. Do not add one.
 *
 * The behaviour, unchanged from the original:
 * The production runtime was returning EST (UTC-5) for America/New_York even in
 * summer via Intl, so peak slots fired an hour late (13:00→14:00, 21:30→22:30
 * ET). We compute the US-Eastern offset from the DST rules directly (DST = 2nd
 * Sunday of March 07:00 UTC through 1st Sunday of November 06:00 UTC), so slot
 * timing is correct regardless of the runtime's timezone database. Our slots
 * (07:30/13:00/21:30) never sit in the 2am transition window, so the fall-back
 * double hour / spring-forward gap don't affect them.
 */

/** UTC ms of the nth Sunday of a month at a given UTC hour. */
function nthSundayUtcMs(year: number, monthIdx: number, n: number, hourUtc: number): number {
    const firstDow = new Date(Date.UTC(year, monthIdx, 1)).getUTCDay(); // 0 = Sunday
    const day = 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
    return Date.UTC(year, monthIdx, day, hourUtc);
}

/** US-Eastern UTC offset in hours for an instant: 4 during EDT, 5 during EST. */
export function easternOffsetHours(utc: Date): number {
    const y = utc.getUTCFullYear();
    const dstStart = nthSundayUtcMs(y, 2, 2, 7); // 2nd Sun March, 07:00 UTC (2am EST)
    const dstEnd = nthSundayUtcMs(y, 10, 1, 6);  // 1st Sun November, 06:00 UTC (2am EDT)
    const t = utc.getTime();
    return t >= dstStart && t < dstEnd ? 4 : 5;
}

/** A Date whose UTC fields read the Eastern wall clock for `utc`. */
export function etWall(utc: Date): Date {
    return new Date(utc.getTime() - easternOffsetHours(utc) * 3_600_000);
}

export function etHour(date: Date): number {
    return etWall(date).getUTCHours();
}

/** The ET calendar day of an instant, e.g. "2026-07-17". */
export function etDayKey(d: Date): string {
    const w = etWall(d);
    return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, '0')}-${String(w.getUTCDate()).padStart(2, '0')}`;
}

/**
 * The UTC instant whose ET wall clock reads `hhmm` on (ET-today + dayOffset).
 * Walks UTC hours to find the matching ET hour (DST-safe), then adds the
 * minutes — the ET offset is always a whole number of hours, so the top of a
 * UTC hour is the top of an ET hour.
 */
export function etSlotInstant(refUtc: Date, hhmm: string, dayOffset: number): Date | null {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm || '');
    if (!m) return null;
    const targetHour = parseInt(m[1], 10);
    const targetMin = parseInt(m[2], 10);
    const targetDay = etDayKey(new Date(refUtc.getTime() + dayOffset * 86_400_000));
    const w = new Date(refUtc);
    w.setUTCMinutes(0, 0, 0);
    w.setUTCHours(w.getUTCHours() - 30); // start a day+ back so today's earlier slots resolve too
    for (let i = 0; i < 72 + dayOffset * 24; i++) {
        if (etDayKey(w) === targetDay && etHour(w) === targetHour) {
            return new Date(w.getTime() + targetMin * 60_000);
        }
        w.setUTCHours(w.getUTCHours() + 1);
    }
    return null;
}

/**
 * Minutes past ET midnight for an instant, 0-1439. The clock dial's bead
 * angle. New here (the scheduler never needed it), but it belongs with the
 * other wall-clock maths rather than in a component.
 */
export function etMinutesOfDay(d: Date): number {
    const w = etWall(d);
    return w.getUTCHours() * 60 + w.getUTCMinutes();
}

/** Minutes past midnight for an "HH:MM" slot string, or null if malformed. */
export function slotMinutesOfDay(hhmm: string): number | null {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm || '');
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}
