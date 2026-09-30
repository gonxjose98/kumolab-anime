import { describe, it, expect } from 'vitest';
import {
    buildCompositePlan, canUseSingleBase, ffColor, placement, stackedVisualClips,
} from '@/components/admin/studio/export/compositeGraph';
import type { Clip, MediaAsset, Track, VideoProject } from '@/components/admin/studio/types';

const media: MediaAsset[] = [
    { id: 'png', kind: 'image', name: 'overlay.png', origin: 'upload', remoteUrl: 'x', durationSec: 0, width: 1080, height: 1920, createdAt: 0 },
    { id: 'vid', kind: 'video', name: 'clip.mp4', origin: 'upload', remoteUrl: 'x', durationSec: 31, width: 1280, height: 720, hasAudio: false, createdAt: 0 },
    { id: 'wav', kind: 'audio', name: 'audio.m4a', origin: 'upload', remoteUrl: 'x', durationSec: 31, createdAt: 0 },
];

const clip = (id: string, trackId: string, mediaId: string, extra: Partial<Clip> = {}): Clip => ({
    id, trackId, mediaId, srcStart: 0, srcEnd: 31, timelineStart: 0, duration: 31, speed: 1, volume: 1, muted: false, z: 0, ...extra,
});
const track = (id: string, kind: Track['kind'], order: number, clips: Clip[]): Track =>
    ({ id, kind, name: id, clips, muted: false, hidden: false, locked: false, order });

/** The Frieren reel: overlay PNG (row 1) above a positioned 16:9 clip (row 2) + audio. */
function layered(): VideoProject {
    return {
        schemaVersion: 1, postId: 'p', durationSec: 31, updatedAt: 0, media: media.map((m) => ({ ...m })),
        meta: { canvasWidth: 1080, canvasHeight: 1920, fps: 30, backgroundColor: '#07122B', watermark: false },
        tracks: [
            track('img', 'image', 1, [clip('c-png', 'img', 'png', { transform: { xPct: 0.5, yPct: 0.5, scale: 1, rotationDeg: 0, opacity: 1, fit: 'cover' } })]),
            track('vid', 'video', 2, [clip('c-vid', 'vid', 'vid', { transform: { xPct: 0.5, yPct: 920 / 1920, scale: 1, rotationDeg: 0, opacity: 1, fit: 'contain', fillStyle: 'none' } })]),
            track('aud', 'audio', 3, [clip('c-aud', 'aud', 'wav')]),
        ],
    };
}

describe('placement mirrors the preview geometry', () => {
    it('fits a 16:9 clip to full width, centred where asked', () => {
        const p = placement({ xPct: 0.5, yPct: 920 / 1920, scale: 1, rotationDeg: 0, opacity: 1, fit: 'contain' }, 1280, 720, 1080, 1920);
        expect(p).toMatchObject({ dw: 1080, dh: 608, cx: 540, cy: 920, bars: true });
    });
    it('cover fills the frame without bars', () => {
        expect(placement({ xPct: 0.5, yPct: 0.5, scale: 1, rotationDeg: 0, opacity: 1, fit: 'cover' }, 1080, 1920, 1080, 1920).bars).toBe(false);
    });
});

describe('stacking order', () => {
    it('paints the lower timeline row first, so the top row is in front', () => {
        expect(stackedVisualClips(layered()).map((s) => s.clip.id)).toEqual(['c-vid', 'c-png']);
    });
    it('clip.z beats track order', () => {
        const p = layered();
        p.tracks[1].clips[0].z = 5;
        expect(stackedVisualClips(p).map((s) => s.clip.id)).toEqual(['c-png', 'c-vid']);
    });
    it('skips hidden tracks', () => {
        const p = layered();
        p.tracks[0].hidden = true;
        expect(stackedVisualClips(p).map((s) => s.clip.id)).toEqual(['c-vid']);
    });
});

describe('fast path selection', () => {
    it('layered projects need the compositor', () => {
        expect(canUseSingleBase(layered())).toBe(false);
    });
    it('a single centred full-frame track keeps the fast path', () => {
        const p = layered();
        p.tracks = [p.tracks[1]];
        p.tracks[0].clips[0].transform = { xPct: 0.5, yPct: 0.5, scale: 1, rotationDeg: 0, opacity: 1, fit: 'contain', fillStyle: 'blur' };
        expect(canUseSingleBase(p)).toBe(true);
    });
    it('a positioned single clip needs the compositor', () => {
        const p = layered();
        p.tracks = [p.tracks[1]];
        expect(canUseSingleBase(p)).toBe(false);
    });
});

describe('buildCompositePlan', () => {
    const plan = buildCompositePlan(layered(), 1080, 1920, 30);

    it('starts from the background colour for the whole duration', () => {
        expect(plan.args.slice(0, 4)).toEqual(['-f', 'lavfi', '-i', 'color=c=0x07122B:s=1080x1920:r=30:d=31']);
    });

    it('inputs: video, looped png, audio — in stacking order', () => {
        expect(plan.args.slice(4)).toEqual([
            '-i', 'src_vid',
            '-loop', '1', '-framerate', '30', '-t', '31', '-i', 'src_png',
            '-i', 'src_wav',
        ]);
        expect(plan.files.map((f) => f.id)).toEqual(['vid', 'png', 'wav']);
    });

    it('scales + positions the clip and keeps PNG alpha, video under overlay', () => {
        const f = plan.filter;
        expect(f).toContain('[s0]scale=1080:608,format=rgba,setpts=PTS+0/TB[l0]');
        expect(f).toContain('[0:v][l0]overlay=x=540-w/2:y=920-h/2');
        expect(f).toContain('[s1]scale=1080:1920,format=rgba,setpts=PTS+0/TB[l1]');
        expect(f).toContain('[c0][l1]overlay=x=540-w/2:y=960-h/2');
        expect(f.indexOf('[0:v][l0]')).toBeLessThan(f.indexOf('[c0][l1]'));
        expect(f).toContain('[c1]format=yuv420p,setsar=1[vout]');
        // fillStyle 'none' → no full-frame fill under the clip
        expect(f).not.toContain('[fill0]');
    });

    it('mixes the audio track (the clip itself has no audio)', () => {
        expect(plan.filter).toContain('[3:a]atrim=start=0:end=31');
        expect(plan.filter).toContain('[au0]anull[aout]');
    });

    it('mixes every unmuted source with amix', () => {
        const p = layered();
        p.media[1].hasAudio = true;
        p.tracks.push(track('aud2', 'audio', 4, [clip('c-aud2', 'aud2', 'wav', { timelineStart: 2, duration: 5, srcEnd: 5 })]));
        const f = buildCompositePlan(p, 1080, 1920, 30).filter;
        expect(f).toContain('[1:a]atrim');
        expect(f).toContain('adelay=2000|2000');
        expect(f).toContain('[au0][au1][au2]amix=inputs=3:normalize=0:duration=longest[aout]');
    });

    it('muted track contributes nothing; silence when no audio', () => {
        const p = layered();
        p.tracks[2].muted = true;
        expect(buildCompositePlan(p, 1080, 1920, 30).filter).toContain('anullsrc=r=48000:cl=stereo[aout]');
    });

    it('blur fill splits the source into a blurred backdrop', () => {
        const p = layered();
        p.tracks[1].clips[0].transform!.fillStyle = 'blur';
        const f = buildCompositePlan(p, 1080, 1920, 30).filter;
        expect(f).toContain('split=2[s0][fs0]');
        expect(f).toContain('gblur=sigma=60');
        expect(f).toContain('[0:v][fill0]overlay=0:0');
    });

    it('offsets later clips in time', () => {
        const p = layered();
        Object.assign(p.tracks[1].clips[0], { timelineStart: 4, srcStart: 1, srcEnd: 3, duration: 2 });
        const f = buildCompositePlan(p, 1080, 1920, 30).filter;
        expect(f).toContain('trim=start=1:end=3');
        expect(f).toContain('setpts=PTS+4/TB[l0]');
        expect(f).toContain("enable='between(t,4,6)'");
    });
});

describe('ffColor', () => {
    it('converts hex and passes names through', () => {
        expect(ffColor('#07122B')).toBe('0x07122B');
        expect(ffColor('black')).toBe('black');
    });
});
