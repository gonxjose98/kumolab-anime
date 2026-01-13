# KumoLab Deployment Guide

## Automated Blog Publishing Setup

Your blog engine is now configured for **full hands-off automation** with 4 daily posts.

### Daily Schedule (UTC)
- **08:00 UTC** — Daily Drops (with Intel fallback)
- **12:00 UTC** — Anime Intel
- **15:00 UTC** — Trending Now
- **21:00 UTC** — Community Night

---

## Deployment Steps

### 1. Push to GitHub
```bash
git add .
git commit -m "Add automated blog engine with 4 daily slots"
git push origin main
```

### 2. Deploy to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Add environment variables in Vercel Dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_USE_SUPABASE=true`
   - `PRINTFUL_ACCESS_TOKEN`

### 3. Verify Cron Jobs
After deployment, Vercel will automatically:
- Read `vercel.json`
- Set up 4 cron jobs
- Trigger `/api/cron/run-blog-engine` at scheduled times

Check the Vercel Dashboard → Your Project → Cron Jobs to confirm they're active.

---

## Local Development

For local testing, `NEXT_PUBLIC_USE_SUPABASE` is set to `false` in `.env.local`, so posts save to `src/data/posts.json`.

To test the cron endpoint locally:
```bash
# Test 08:00 slot
curl "http://localhost:3000/api/cron/run-blog-engine?slot=08:00"

# Test 12:00 slot
curl "http://localhost:3000/api/cron/run-blog-engine?slot=12:00"

# Test 15:00 slot
curl "http://localhost:3000/api/cron/run-blog-engine?slot=15:00"

# Test 21:00 slot (Community Night)
curl "http://localhost:3000/api/cron/run-blog-engine?slot=21:00"
```

---

## Community Night Details

**Type:** Conversational, lightweight engagement post  
**Tone:** Friendly, social, not news/report-style  
**Content:** Random community prompts like:
- "What anime moment made you smile today?"
- "Drop your current watch list in the comments 👇"
- "Hot take: What's the most underrated anime of the season?"

**Safety:** Always skips gracefully if no content exists. Never blocks other posts.

---

## Production Publishing

Once deployed to Vercel:
- All posts automatically publish to **Supabase**
- No manual intervention required
- Cron jobs run daily at scheduled UTC times
- Check Vercel logs for execution status

---

## Monitoring

View cron execution logs in:
- Vercel Dashboard → Your Project → Logs
- Filter by `/api/cron/run-blog-engine`

Each execution returns:
```json
{
  "success": true,
  "slot": "08:00",
  "post": {
    "id": "drop-2026-01-13",
    "title": "Daily Drops — 2026-01-13",
    "type": "DROP",
    "timestamp": "2026-01-13T08:00:00.000Z"
  },
  "message": "Successfully published post for 08:00 UTC"
}
```

---

## Troubleshooting

**No posts appearing?**
1. Check Vercel environment variables are set
2. Verify `NEXT_PUBLIC_USE_SUPABASE=true` in production
3. Check Supabase RLS policies allow inserts
4. Review Vercel cron logs for errors

**Cron not triggering?**
1. Verify `vercel.json` is in project root
2. Redeploy to Vercel (cron config updates on deploy)
3. Check Vercel Dashboard → Cron Jobs tab

---

## Next Steps

1. Deploy to Vercel
2. Wait for first scheduled run (next UTC hour: 08:00, 12:00, 15:00, or 21:00)
3. Check Supabase `posts` table for new entries
4. Monitor Vercel logs for execution status

**That's it! Your blog is now fully automated.** 🎉
