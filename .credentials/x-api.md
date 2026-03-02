# X (Twitter) API Credentials

## X API v2 Bearer Token
**Token:** `AAAAAAAAAAAAAAAAAAAAAHdF7AEAAAAAxUi4gmMiQwnKy7tFpJZ5F%2FbybGs%3D50i7DwkwdcojGzETxjRZS5S6Pm9GMCeezbzXvnIOcJobdb8eOW`

**Status:** ✅ Active
**Tier:** Free (100 requests/month)
**Use Case:** Fetching tweets from monitored anime accounts

## Monitored Accounts (Tier 1-2)
- @Crunchyroll
- @FUNimation  
- @AniplexUSA
- @MAPPA_Info
- @kyoani
- @ufotable
- @toho_animation
- @KadokawaAnime
- @AnimeNewsNet
- @AniTrendz
- @NetflixAnime
- @HIDIVEofficial

## Environment Variable
Set in Vercel environment variables:
```
X_BEARER_TOKEN=AAAAAAAAAAAAAAAAAAAAAHdF7AEAAAAAxUi4gmMiQwnKy7tFpJZ5F%2FbybGs%3D50i7DwkwdcojGzETxjRZS5S6Pm9GMCeezbzXvnIOcJobdb8eOW
```

## Rate Limits
- 100 requests per month (Free tier)
- Requests reset monthly
- Used by: `src/lib/engine/x-monitor.ts`
