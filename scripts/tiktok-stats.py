"""Update the Analytics > TikTok tile (manual_platform_stats, platform 'tiktok'). Nothing else.

  python scripts/tiktok-stats.py <views> <followers> <likes> <posts> "<note>"

Only ever PATCHes that one row with those five fields; numbers must be whole and
non-negative. Jose allow-listed this script so the tile can be refreshed while
he is away from the PC (2026-10-17). Keep it this narrow.
Env: prod credentials via `vercel env pull` (run from the repo root).
"""
import json, os, subprocess, sys, tempfile, urllib.request
from datetime import datetime, timezone


def env():
    f = os.path.join(tempfile.gettempdir(), f'kl-tt-{os.getpid()}.env')
    subprocess.run('vercel env pull "%s" --environment=production --yes' % f, shell=True, capture_output=True)
    e = {}
    for line in open(f, encoding='utf-8'):
        if '=' in line and not line.startswith('#'):
            k, v = line.strip().split('=', 1); e[k] = v.strip('"')
    os.remove(f)
    return e


if len(sys.argv) != 6:
    sys.exit(__doc__)
views, followers, likes, posts = (int(a) for a in sys.argv[1:5])
assert min(views, followers, likes, posts) >= 0, 'numbers must be non-negative'
note = sys.argv[5][:300]

E = env()
url = f"{E['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/manual_platform_stats?platform=eq.tiktok"
key = E['SUPABASE_SERVICE_ROLE_KEY']
body = json.dumps({'views': views, 'followers': followers, 'likes': likes, 'posts': posts, 'note': note,
                   'updated_at': datetime.now(timezone.utc).isoformat()}).encode()
req = urllib.request.Request(url, body, method='PATCH', headers={
    'Authorization': f'Bearer {key}', 'apikey': key,
    'Content-Type': 'application/json', 'Prefer': 'return=representation'})
rows = json.loads(urllib.request.urlopen(req).read())
assert len(rows) == 1, f'expected 1 tiktok row, got {len(rows)}'
r = rows[0]
print(f"tiktok tile: {r['views']} views | {r['followers']} followers | {r['likes']} likes | {r['posts']} posts")
