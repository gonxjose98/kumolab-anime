// One-time (re-runnable) history load for public.daily_views.
// Usage: npx tsx scripts/analytics/backfill-daily-views.ts [fromDay=2025-11-01] [toDay=today]
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const { collectDailyViews, daysBetween, dayKey } = await import('../../src/lib/analytics/daily-views');
    const from = process.argv[2] || '2025-11-01';
    const to = process.argv[3] || dayKey(new Date());
    const days = daysBetween(from, to);
    console.log(`Backfilling ${days.length} days (${from} → ${to})`);
    console.log(await collectDailyViews(days));
}
main().catch((e) => { console.error(e); process.exit(1); });
