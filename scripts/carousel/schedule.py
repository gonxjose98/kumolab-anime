"""Schedule a finished carousel through the KumoLab engine, and verify the queue.

  python scripts/carousel/schedule.py add <workdir> <slug> "<Title>" <YYYY-MM-DD> [HH:MM ET, default 08:30]
      <workdir> holds f-slide-N.jpg (from render.mjs), ig.txt, fb.txt, threads.txt.
      Uploads every slide BYTE-FOR-BYTE to blog-images/carousels/<slug>-<stamp>-N.jpg
      (a fresh name each run, so no stale CDN copy can ever post), then inserts
      an approved posts row the admin Schedule tab shows and the publish cron
      fires (IG carousel + FB multi-photo + Threads carousel).
  python scripts/carousel/schedule.py replace <workdir> <post_id> ["<New title>"]
      Re-uploads an edited carousel into an already-scheduled post (same time).
  python scripts/carousel/schedule.py verify
      Checks every upcoming carousel: title set, slides 1..N in order and
      reachable, and nothing else booked within 60 minutes of it.

Env: reads prod credentials via `vercel env pull` (run from the repo root, Vercel CLI logged in).
Requires: `python -m pip install tzdata` on Windows (time-zone data).
"""
import json, os, re, subprocess, sys, tempfile, time, urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo


def env():
    f = os.path.join(tempfile.gettempdir(), f'kl-{os.getpid()}.env')
    subprocess.run('vercel env pull "%s" --environment=production --yes' % f, shell=True, capture_output=True)
    e = {}
    for line in open(f, encoding='utf-8'):
        if '=' in line and not line.startswith('#'):
            k, v = line.strip().split('=', 1); e[k] = v.strip('"')
    os.remove(f)
    return e


E = env()
SB, KEY = E['NEXT_PUBLIC_SUPABASE_URL'], E['SUPABASE_SERVICE_ROLE_KEY']
H = {'Authorization': f'Bearer {KEY}', 'apikey': KEY}


def req(method, url, data=None, headers=None):
    r = urllib.request.Request(url, data=data, method=method, headers={**H, **(headers or {})})
    return urllib.request.urlopen(r, timeout=120).read()


def add(workdir, slug, title, day, hhmm='08:30'):
    et = datetime.strptime(f'{day} {hhmm}', '%Y-%m-%d %H:%M').replace(tzinfo=ZoneInfo('America/New_York'))
    when = et.astimezone(ZoneInfo('UTC')).strftime('%Y-%m-%dT%H:%M:%SZ')
    jpgs = sorted([f for f in os.listdir(workdir) if re.match(r'f-slide-\d+\.jpg$', f)], key=lambda f: int(re.findall(r'\d+', f)[0]))
    assert 5 <= len(jpgs) <= 8, f'{len(jpgs)} slides: rule is 5-8'
    read = lambda n: open(os.path.join(workdir, n), encoding='utf-8').read().strip()
    ig, fb, th = read('ig.txt'), read('fb.txt'), read('threads.txt')
    assert len(th) <= 500, 'threads.txt over 500 chars'
    for t in (ig, fb, th, title):
        assert '\u2014' not in t, 'em dash found'
    stamp = time.strftime('%Y%m%d%H%M%S')
    urls = []
    for i, f in enumerate(jpgs, 1):
        path = f'carousels/{slug}-{stamp}-{i}.jpg'
        req('POST', f'{SB}/storage/v1/object/blog-images/{path}', open(os.path.join(workdir, f), 'rb').read(),
            {'Content-Type': 'image/jpeg', 'x-upsert': 'true'})
        urls.append(f'{SB}/storage/v1/object/public/blog-images/{path}')
    hook = ig.split('\n')[0]
    row = {
        'slug': slug, 'title': title, 'content': hook, 'excerpt': hook, 'image': urls[0],
        'type': 'COMMUNITY', 'source': 'KumoLab Studio', 'source_tier': 1,
        'status': 'approved', 'is_published': False, 'scheduled_post_time': when, 'timestamp': when,
        'caption_override': ig,
        'image_settings': {'sourceUrl': urls[0], 'carousel_source': 'claude-cloud-bank',
                           'slides': [{'sourceUrl': u, 'renderedUrl': u, 'title': '', 'excerpt': '', 'settings': {}} for u in urls],
                           'captions': {'facebook': fb, 'threads': th}},
    }
    out = json.loads(req('POST', f'{SB}/rest/v1/posts', json.dumps(row).encode(),
                         {'Content-Type': 'application/json', 'Prefer': 'return=representation'}))
    print(f'scheduled {title} | {len(urls)} slides | {et:%a %b %d %I:%M %p} ET | id {out[0]["id"]}')
    verify()


def upload(workdir, slug):
    jpgs = sorted([f for f in os.listdir(workdir) if re.match(r'f-slide-\d+\.jpg$', f)], key=lambda f: int(re.findall(r'\d+', f)[0]))
    assert 5 <= len(jpgs) <= 8, f'{len(jpgs)} slides: rule is 5-8'
    stamp = time.strftime('%Y%m%d%H%M%S')
    urls = []
    for i, f in enumerate(jpgs, 1):
        path = f'carousels/{slug}-{stamp}-{i}.jpg'
        req('POST', f'{SB}/storage/v1/object/blog-images/{path}', open(os.path.join(workdir, f), 'rb').read(),
            {'Content-Type': 'image/jpeg', 'x-upsert': 'true'})
        urls.append(f'{SB}/storage/v1/object/public/blog-images/{path}')
    return urls


def replace(workdir, post_id, title=None):
    """Swap an already-scheduled carousel's slides + captions (+ title) in place; keeps its time."""
    read = lambda n: open(os.path.join(workdir, n), encoding='utf-8').read().strip()
    ig, fb, th = read('ig.txt'), read('fb.txt'), read('threads.txt')
    assert len(th) <= 500, 'threads.txt over 500 chars'
    for t in (ig, fb, th, title or ''):
        assert '\u2014' not in t, 'em dash found'
    row = json.loads(req('GET', f'{SB}/rest/v1/posts?id=eq.{post_id}&select=slug,image_settings'))[0]
    urls = upload(workdir, row['slug'])
    ims = row['image_settings'] or {}
    ims.update({'sourceUrl': urls[0], 'captions': {'facebook': fb, 'threads': th},
                'slides': [{'sourceUrl': u, 'renderedUrl': u, 'title': '', 'excerpt': '', 'settings': {}} for u in urls]})
    hook = ig.split('\n')[0]
    patch = {'image': urls[0], 'caption_override': ig, 'content': hook, 'excerpt': hook, 'image_settings': ims}
    if title: patch['title'] = title
    out = json.loads(req('PATCH', f'{SB}/rest/v1/posts?id=eq.{post_id}', json.dumps(patch).encode(),
                         {'Content-Type': 'application/json', 'Prefer': 'return=representation'}))
    print(f'replaced {out[0]["title"]} | {len(urls)} slides | {out[0]["scheduled_post_time"]}')
    verify()


def reachable(url):
    # The storage CDN throttles bursts of requests, so one failed check is not proof
    # a slide is missing: retry with backoff before reporting it.
    for attempt in range(4):
        try:
            urllib.request.urlopen(urllib.request.Request(url, headers={'Range': 'bytes=0-0'}), timeout=30)
            return True
        except Exception:
            time.sleep(2 * (attempt + 1))
    return False


def verify():
    now = datetime.now(ZoneInfo('UTC')).strftime('%Y-%m-%dT%H:%M:%SZ')
    rows = json.loads(req('GET', f'{SB}/rest/v1/posts?status=eq.approved&scheduled_post_time=gte.{now}&select=id,title,scheduled_post_time,image_settings&order=scheduled_post_time'))
    ok = True
    for r in rows:
        slides = (r.get('image_settings') or {}).get('slides') or []
        if len(slides) < 2:
            continue
        t = datetime.fromisoformat(r['scheduled_post_time'].replace('Z', '+00:00'))
        probs = []
        if not (r['title'] or '').strip(): probs.append('EMPTY TITLE')
        nums = [int(re.findall(r'-(\d+)\.jpg$', s.get('renderedUrl', ''))[0]) if re.findall(r'-(\d+)\.jpg$', s.get('renderedUrl', '')) else -1 for s in slides]
        if nums != list(range(1, len(nums) + 1)): probs.append(f'SLIDE ORDER {nums}')
        for s in slides:
            if not reachable(s['renderedUrl']): probs.append('UNREACHABLE ' + s['renderedUrl'][-40:])
        # In carousels-only mode other posts never reach social, so only
        # carousels can collide with each other.
        carousels_only = E.get('SOCIALS_CAROUSELS_ONLY') == 'true'
        near = [o['title'][:40] for o in rows if o['id'] != r['id']
                and (not carousels_only or len((o.get('image_settings') or {}).get('slides') or []) >= 2)
                and abs((datetime.fromisoformat(o['scheduled_post_time'].replace('Z', '+00:00')) - t).total_seconds()) < 3600]
        if near: probs.append(f'COLLISION within 60m: {near}')
        et = t.astimezone(ZoneInfo('America/New_York'))
        print(f'{"OK " if not probs else "BAD"} {et:%a %b %d %I:%M %p} ET  {r["title"][:50]}  ({len(slides)} slides) {"; ".join(probs)}')
        ok = ok and not probs
    if not ok: sys.exit(1)


if __name__ == '__main__':
    c = sys.argv[1]
    if c == 'add': add(*sys.argv[2:])
    elif c == 'replace': replace(*sys.argv[2:])
    elif c == 'verify': verify()
    else: print(__doc__)
