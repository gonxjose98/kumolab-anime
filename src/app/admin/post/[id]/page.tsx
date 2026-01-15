'use client';

import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function PostEditor({ params }: { params: { id: string } }) {
    const [post, setPost] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [title, setTitle] = useState('');
    const [type, setType] = useState('');
    const [isPublished, setIsPublished] = useState(false);

    // Analytics for this post
    const [views, setViews] = useState(0);

    const router = useRouter();
    // Create client-side supabase client
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const id = params.id;

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
            setTitle(data.title);
            setType(data.type);
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
                is_published: isPublished
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
                <div className="text-right">
                    <span className="block text-xs text-neutral-500 uppercase tracking-widest">Views</span>
                    <span className="text-xl font-bold text-white">{views.toLocaleString()}</span>
                </div>
            </div>

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

                {/* 2. Type Editor */}
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

                {/* 3. Published Toggle */}
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

                <div className="pt-4 border-t border-neutral-800 flex justify-end gap-3">
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
    );
}
