'use client';

import { useState } from 'react';
import { Play, ExternalLink } from 'lucide-react';

/**
 * Watch the post's video, from anywhere in the editor.
 *
 * Before this, a video post opened the editor showing only its still image, so
 * it read as a picture post, and there was no way to watch it once it left the
 * pending queue — the dashboard's review preview was the only player.
 *
 * Three sources, in order, because what a post carries depends on its stage:
 *   1. staged_video_url — the hosted MP4. Present on most published posts and
 *      on Studio drafts. May 404: the cleanup worker sweeps staged videos of
 *      published posts that ALSO have a youtube_video_id, while the URL stays
 *      on the row. So a load error falls through to the next source rather
 *      than showing a broken player.
 *   2. youtube_video_id — the original upload. Approved posts typically have
 *      ONLY this, which is why they were previously unwatchable here.
 *   3. source_url — nothing embeddable, so offer the article/source.
 *
 * The YouTube embed is click-to-load and nocookie, matching the review
 * preview: no third-party iframe until the operator asks for it.
 */
export default function PostVideoCard({
    stagedUrl,
    youtubeId,
    sourceUrl,
    image,
    title,
}: {
    stagedUrl?: string | null;
    youtubeId?: string | null;
    sourceUrl?: string | null;
    image?: string | null;
    title?: string | null;
}) {
    // Set when the hosted MP4 fails, so we fall through to YouTube/source.
    const [mp4Failed, setMp4Failed] = useState(false);
    const [ytLoaded, setYtLoaded] = useState(false);

    const canMp4 = !!stagedUrl && !mp4Failed;
    const canYt = !!youtubeId;
    const hasAnything = canMp4 || canYt || !!sourceUrl;
    if (!hasAnything) return null;

    return (
        <div className="ak-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="flex items-center justify-between" style={{ gap: 8, padding: '12px 16px' }}>
                <span className="ak-overline">Video</span>
                {sourceUrl && (
                    <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ak-caption"
                        style={{ color: 'var(--gold-text)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                        Source <ExternalLink size={12} />
                    </a>
                )}
            </div>

            <div style={{ background: '#000', position: 'relative' }}>
                {canMp4 ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                        src={stagedUrl!}
                        poster={image || undefined}
                        controls
                        playsInline
                        preload="metadata"
                        crossOrigin="anonymous"
                        onError={() => setMp4Failed(true)}
                        style={{ width: '100%', maxHeight: '62vh', display: 'block', objectFit: 'contain' }}
                    />
                ) : canYt ? (
                    ytLoaded ? (
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
                            <iframe
                                src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
                                title={title || 'Video'}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                            />
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setYtLoaded(true)}
                            title="Play"
                            style={{
                                position: 'relative', width: '100%', aspectRatio: '16 / 9', border: 0,
                                padding: 0, cursor: 'pointer', background: '#000', display: 'block',
                            }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.85 }}
                            />
                            <span
                                style={{
                                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', color: '#fff',
                                }}
                            >
                                <span style={{
                                    width: 56, height: 56, borderRadius: 999, display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', background: 'rgba(10,23,48,0.66)', border: '1px solid rgba(255,255,255,0.5)',
                                }}>
                                    <Play size={22} fill="currentColor" />
                                </span>
                            </span>
                        </button>
                    )
                ) : (
                    <a
                        href={sourceUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ak-caption"
                        style={{ display: 'block', padding: '28px 16px', textAlign: 'center', color: 'var(--ink-2)', textDecoration: 'none' }}
                    >
                        No playable copy stored. Watch at the source ↗
                    </a>
                )}
            </div>

            {mp4Failed && canYt && (
                <div className="ak-caption" style={{ padding: '8px 16px' }}>
                    The stored copy is gone (published reels are cleaned up), so this is the YouTube original.
                </div>
            )}
        </div>
    );
}
