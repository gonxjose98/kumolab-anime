'use client';

import { createBrowserClient } from '@supabase/ssr'
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import PostAnalytics from '@/components/admin/PostAnalytics';

export default function PostEditor() {
    const params = useParams();
    const id = params?.id as string;
    const [post, setPost] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [title, setTitle] = useState('');
    const [type, setType] = useState('');
    const [content, setContent] = useState('');
    const [excerpt, setExcerpt] = useState(''); // headline/tag used on image overlays
    const [backgroundImage, setBackgroundImage] = useState('');
    const [imageSettings, setImageSettings] = useState<any>({});
    const [rendering, setRendering] = useState(false);
    const [renderedPreview, setRenderedPreview] = useState<string>('');
    const [isPublished, setIsPublished] = useState(false);

    // Analytics for this post
    const [views, setViews] = useState(0);

    const router = useRouter();
    // Create client-side supabase client
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    // const id = params.id; // Removed duplicate id declaration

    useEffect(() => {
        async function fetchPost() {
            // 1. Fetch Post Data
            const { data, error } = await supabase
                .from('posts')
                .select('*')
                .eq('id', id)
                .single();

            if (error) {
                alert('Error loading post');
                router.push('/admin/dashboard');
                return;
            }

            setPost(data);
            setTitle(data.title || '');
            setType(data.type || '');
            setContent(data.content || '');
            setExcerpt(data.excerpt || '');
            setBackgroundImage(data.background_image || '');
            setImageSettings(data.image_settings || {});
            setRenderedPreview(data.image || '');
            setIsPublished(data.is_published);

            // 2. Fetch Analytics for this Post
            // Match path pattern: /daily-drops-202X or /frieren-s2... (slug)
            // But wait, page_views stores PATH, not SLUG. We need to construct the likely path.
            // Assuming blog paths are unique to slug? No, KumoLab uses modal or direct?
            // Wait, looking at codebase, posts don't have dedicated /blog/[slug] pages yet?
            // If they are just modals on home, they might not have unique URL hits.
            // IF individual pages exist, they track. If not, this metric will be 0.
            // Let's query by possible path signatures.

            // NOTE: Assuming future structure /post/[slug]
            const pathSignature = `/${data.slug}`;
            const { count } = await supabase
                .from('page_views')
                .select('*', { count: 'exact', head: true })
                .ilike('path', `%${data.slug}%`);

            setViews(count || 0);
            setLoading(false);
        }

        fetchPost();
    }, [id, router, supabase]);

    const handleSave = async () => {
        setSaving(true);
        const { error } = await supabase
            .from('posts')
            .update({
                title,
                type,
                content,
                excerpt,
                background_image: backgroundImage || null,
                image_settings: imageSettings,
                is_published: isPublished,
                claim_type: post.claim_type,
                premiere_date: post.premiere_date
            })
            .eq('id', id);

        if (error) {
            alert('Failed to save: ' + error.message);
        } else {
            router.push('/admin/dashboard');
            router.refresh();
        }
        setSaving(false);
    };

    if (loading) return <div className="p-8 text-neutral-500">Loading editor...</div>;

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <button
                    onClick={() => router.back()}
                    className="text-neutral-500 hover:text-white transition-colors text-sm"
                >
                    ← Back to Dashboard
                </button>
            </div>

            {/* ANALYTICS PANEL */}
            <PostAnalytics
                postId={id}
                websiteViews={views}
                initialSocialMetrics={post.social_metrics}
            />

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 space-y-6">

                {/* 1. Title Editor */}
                <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                        Title
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-black border border-neutral-700 text-white px-4 py-3 rounded focus:border-purple-500 focus:outline-none"
                    />
                </div>

                {/* 2. Headline / Tag Editor */}
                <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                        Headline / Tag (excerpt)
                    </label>
                    <input
                        type="text"
                        value={excerpt}
                        onChange={(e) => setExcerpt(e.target.value)}
                        placeholder="FEATURED, JUST CONFIRMED, OFFICIAL, etc"
                        className="w-full bg-black border border-neutral-700 text-white px-4 py-3 rounded focus:border-purple-500 focus:outline-none"
                    />
                    <p className="mt-2 text-[11px] text-neutral-500">
                        This controls the short overlay tag stored in <span className="font-mono">posts.excerpt</span> and used by the image renderer.
                    </p>
                </div>

                {/* 3. Type Editor */}
                <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                        Category (Type)
                    </label>
                    <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        className="w-full bg-black border border-neutral-700 text-white px-4 py-3 rounded focus:border-purple-500 focus:outline-none"
                    >
                        <option value="DROP">Daily Drop</option>
                        <option value="INTEL">Anime Intel</option>
                        <option value="TRENDING">Trending</option>
                        <option value="COMMUNITY">Community</option>
                    </select>
                </div>

                {/* 4. Render + Image Controls */}
                <div className="bg-black/40 border border-neutral-800 rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-white">Image + Layout</div>
                            <div className="text-xs text-neutral-500">Edits persist to <span className="font-mono">background_image</span> and <span className="font-mono">image_settings</span>. Rendering writes <span className="font-mono">image</span>.</div>
                        </div>
                        <button
                            onClick={async () => {
                                setRendering(true);
                                try {
                                    const res = await fetch('/api/admin/render-post-image', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ postId: id })
                                    });
                                    const data = await res.json();
                                    if (!data.success) throw new Error(data.error || 'Render failed');

                                    // Update local state with latest DB snapshot
                                    setPost(data.post);
                                    setBackgroundImage(data.post.background_image || '');
                                    setImageSettings(data.post.image_settings || {});
                                    if (data.post.image) setRenderedPreview(data.post.image);
                                } catch (e: any) {
                                    alert('Render failed: ' + e.message);
                                } finally {
                                    setRendering(false);
                                }
                            }}
                            disabled={rendering}
                            className="px-4 py-2 rounded bg-purple-600 text-white text-sm font-bold hover:bg-purple-500 disabled:opacity-50"
                        >
                            {rendering ? 'Rendering...' : 'Render Image'}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                                Background Image URL
                            </label>
                            <input
                                type="text"
                                value={backgroundImage}
                                onChange={(e) => setBackgroundImage(e.target.value)}
                                placeholder="https://... (raw art source)"
                                className="w-full bg-black border border-neutral-700 text-white px-4 py-3 rounded focus:border-purple-500 focus:outline-none"
                            />
                            <p className="mt-2 text-[11px] text-neutral-500">Used as the render source. If empty, renderer falls back to current <span className="font-mono">image</span>.</p>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                                Image Settings (JSON)
                            </label>
                            <textarea
                                value={JSON.stringify(imageSettings || {}, null, 2)}
                                onChange={(e) => {
                                    try {
                                        const parsed = JSON.parse(e.target.value);
                                        setImageSettings(parsed);
                                    } catch {
                                        // ignore parse errors while typing
                                    }
                                }}
                                rows={8}
                                className="w-full bg-black border border-neutral-700 text-white px-4 py-3 rounded focus:border-purple-500 focus:outline-none font-mono text-xs"
                            />
                            <p className="mt-2 text-[11px] text-neutral-500">Temporary UI. Next pass: proper controls for positions, scale, gradient, watermark, purple words.</p>
                        </div>
                    </div>

                    {/* Preview */}
                    {(renderedPreview || post.image) && (
                        <div>
                            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                                Current Render
                            </label>
                            <div className="aspect-[4/5] max-w-sm bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={renderedPreview || post.image} alt={post.title} className="w-full h-full object-cover" />
                            </div>
                        </div>
                    )}
                </div>

                {/* 5. Legacy Image Preview */}
                {false && post.image && (
                    <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                            Post Image
                        </label>
                        <div className="aspect-[4/5] max-w-sm bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={post.image} alt={post.title} className="w-full h-full object-cover" />
                        </div>
                    </div>
                )}

                {/* 5. Content Editor */}
                <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                        Content / Description
                    </label>
                    <textarea
                        value={content || ''}
                        onChange={(e) => setContent(e.target.value)}
                        rows={6}
                        className="w-full bg-black border border-neutral-700 text-white px-4 py-3 rounded focus:border-purple-500 focus:outline-none resize-none"
                    />
                </div>

                {/* 7. Metadata Editor (for INTEL/DROP posts) */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-800">
                    <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                            Claim Type / Status
                        </label>
                        <select
                            value={post.claim_type || ''}
                            onChange={(e) => setPost({ ...post, claim_type: e.target.value })}
                            className="w-full bg-black border border-neutral-700 text-white px-4 py-3 rounded focus:border-purple-500 focus:outline-none"
                        >
                            <option value="">None</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="premiered">Premiered</option>
                            <option value="now_streaming">Now Streaming</option>
                            <option value="delayed">Delayed</option>
                            <option value="postponed">Postponed</option>
                            <option value="rumor">Rumor</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                            Premiere Date
                        </label>
                        <input
                            type="date"
                            value={post.premiere_date ? new Date(post.premiere_date).toISOString().split('T')[0] : ''}
                            onChange={(e) => setPost({ ...post, premiere_date: e.target.value })}
                            className="w-full bg-black border border-neutral-700 text-white px-4 py-3 rounded focus:border-purple-500 focus:outline-none"
                        />
                    </div>
                </div>

                {/* 6. Published Toggle */}
                <div className="flex items-center justify-between bg-black p-4 rounded border border-neutral-800">
                    <div>
                        <div className="text-sm font-medium text-white">Public Visibility</div>
                        <div className="text-xs text-neutral-500">
                            {isPublished ? 'Visible to everyone.' : 'Hidden from public site.'}
                        </div>
                    </div>
                    <button
                        onClick={() => setIsPublished(!isPublished)}
                        className={`px-4 py-2 rounded text-sm font-bold transition-all ${isPublished
                            ? 'bg-green-900 text-green-400 border border-green-700 hover:bg-green-800'
                            : 'bg-red-900 text-red-400 border border-red-700 hover:bg-red-800'
                            }`}
                    >
                        {isPublished ? 'PUBLISHED' : 'UNPUBLISHED'}
                    </button>
                </div>

                <div className="pt-4 border-t border-neutral-800 flex justify-between gap-3">
                    <button
                        onClick={async () => {
                            if (confirm('Are you sure you want to delete this post? This cannot be undone.')) {
                                setSaving(true);
                                const { error } = await supabase.from('posts').delete().eq('id', id);
                                if (error) {
                                    alert('Failed to delete: ' + error.message);
                                    setSaving(false);
                                } else {
                                    router.push('/admin/dashboard');
                                    router.refresh();
                                }
                            }
                        }}
                        className="px-6 py-2 rounded text-sm font-bold text-red-500 hover:bg-red-950/30 border border-transparent hover:border-red-900 transition-all"
                    >
                        Delete Post
                    </button>

                    <div className="flex gap-3">
                        <button
                            onClick={() => router.back()}
                            className="px-6 py-2 rounded text-sm font-medium text-neutral-400 hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-8 py-2 bg-white text-black text-sm font-bold rounded hover:bg-neutral-200 disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
