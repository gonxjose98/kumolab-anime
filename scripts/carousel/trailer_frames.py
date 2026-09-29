"""Pull 1080p frames from OFFICIAL trailers / clips for carousel art.

Usage:
  python scripts/carousel/trailer_frames.py search "<query>" [n]      # list YouTube results (id | channel | secs | title)
  python scripts/carousel/trailer_frames.py grab <outdir> <id> [<id>...]

`grab` downloads each video at <=1080p (video only), extracts 1 frame per
second to <outdir>/frames/<id>/NNN.jpg and writes <outdir>/sheets/<id>.jpg,
a numbered contact sheet for picking frames by eye.

Prefer official channels (Crunchyroll, Netflix, TOHO, Aniplex, the studio).
If downloads return HTTP 403: `python -m pip install -U yt-dlp` and retry.
If YouTube says "Sign in to confirm you're not a bot": this IP made too many requests (e.g. several
agents downloading at once). It clears on its own within hours. Only ONE process should download at a
time; PACE below spaces requests out so it doesn't trip again.
Then crop the chosen frame ABOVE any burned-in subtitle and away from
watermarks (see crop.py).
"""
import glob, os, subprocess, sys
from PIL import Image, ImageDraw


# Space out YouTube requests: bursts from parallel agents got this IP bot-flagged (2026-09-29).
PACE = ['--sleep-requests', '1', '--sleep-interval', '3', '--max-sleep-interval', '8']

def search(q, n=5):
    subprocess.run([sys.executable, '-m', 'yt_dlp', *PACE, '--flat-playlist', '--print',
                    '%(id)s | %(channel)s | %(duration)s | %(title).80s', f'ytsearch{n}:{q}'])


def grab(out, ids):
    os.makedirs(f'{out}/vid', exist_ok=True); os.makedirs(f'{out}/sheets', exist_ok=True)
    for vid in ids:
        subprocess.run([sys.executable, '-m', 'yt_dlp', '-q', '--no-warnings', *PACE, '-f',
                        'bv*[height<=1080][ext=mp4]/bv*[height<=1080]', '-o', f'{out}/vid/%(id)s.%(ext)s',
                        f'https://www.youtube.com/watch?v={vid}'])
        files = glob.glob(f'{out}/vid/{vid}.*')
        if not files:
            print(vid, 'DOWNLOAD FAILED (try: python -m pip install -U yt-dlp)'); continue
        fdir = f'{out}/frames/{vid}'; os.makedirs(fdir, exist_ok=True)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', files[0], '-vf', 'fps=1,scale=1920:1080',
                        '-q:v', '2', f'{fdir}/%03d.jpg'])
        fs = sorted(glob.glob(f'{fdir}/*.jpg')); cols, tw, th = 12, 160, 90
        S = Image.new('RGB', (cols * tw, ((len(fs) + cols - 1) // cols) * th), 'black'); d = ImageDraw.Draw(S)
        for i, f in enumerate(fs):
            im = Image.open(f); im.thumbnail((tw, th)); x, y = (i % cols) * tw, (i // cols) * th
            S.paste(im, (x, y)); d.rectangle([x, y, x + 26, y + 13], fill='black'); d.text((x + 2, y + 1), os.path.basename(f)[:3], fill='yellow')
        S.save(f'{out}/sheets/{vid}.jpg', quality=80)
        print(vid, len(fs), 'frames ->', f'{out}/sheets/{vid}.jpg')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'search': search(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 5)
    elif cmd == 'grab': grab(sys.argv[2], sys.argv[3:])
    else: print(__doc__)
