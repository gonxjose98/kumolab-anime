
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Edit2, Plus, Zap, Newspaper, Image as ImageIcon, Loader2 } from 'lucide-react';
import { BlogPost } from '@/types';

interface PostManagerProps {
    initialPosts: BlogPost[];
}

export default function PostManager({ initialPosts }: PostManagerProps) {
    // Normalize posts to ensure isPublished is present (Supabase returns is_published)
    const normalizedPosts = initialPosts.map(p => ({
        ...p,
        isPublished: (p as any).is_published ?? p.isPublished
    }));
    const [posts, setPosts] = useState<BlogPost[]>(normalizedPosts);
    const [filter, setFilter] = useState<'ALL' | 'LIVE' | 'HIDDEN'>('ALL');
    const [isGenerating, setIsGenerating] = useState(false);
    const [showModal, setShowModal] = useState(false);

    // Modal State
    const [genType, setGenType] = useState<'INTEL' | 'TRENDING' | null>(null);
    const [topic, setTopic] = useState('');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [previewPost, setPreviewPost] = useState<BlogPost | null>(null);

    const filteredPosts = posts.filter(post => {
        if (filter === 'LIVE') return post.isPublished;
        if (filter === 'HIDDEN') return !post.isPublished;
        return true;
    });

    const handleGenerateClick = (type: 'INTEL' | 'TRENDING') => {
        setGenType(type);
        setTopic('');
        setTitle('');
        setContent('');
        setPreviewPost(null);
        setShowModal(true);
    };

    const handleGeneratePreview = async () => {
        if (!genType) return;
        setIsGenerating(true);
        setPreviewPost(null);

        try {
            const response = await fetch('/api/admin/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: genType,
                    topic: topic || undefined,
                    title: title || undefined,
                    content: content || undefined
                })
            });

            const data = await response.json();
            if (data.success && data.post) {
                setPreviewPost(data.post);
                // Also update the list immediately so it shows in HIDDEN tab
                // But since it's a draft, logic matches.
                // We add it to the top.
                setPosts([data.post, ...posts]);
            } else {
                alert('Generation failed: ' + (data.error || 'Unknown error'));
            }
        } catch (e: any) {
            alert('Error generating post: ' + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleConfirm = () => {
        // Post is already saved as draft by the API.
        // User just closes modal and sees it in list.
        setShowModal(false);
        setFilter('HIDDEN'); // Switch to Hidden tab to see it
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Edit2 size={18} className="text-neutral-500" />
                        Post Manager
                    </h2>

                    {/* Filters */}
                    <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
                        {(['ALL', 'LIVE', 'HIDDEN'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${filter === f
                                    ? 'bg-neutral-800 text-white shadow-sm'
                                    : 'text-neutral-500 hover:text-neutral-300'
                                    }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Generator Buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={() => handleGenerateClick('INTEL')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-900/30 text-blue-400 border border-blue-800/50 rounded-lg hover:bg-blue-900/50 transition-all text-xs font-bold uppercase tracking-wider"
                    >
                        <Newspaper size={14} />
                        Gen Intel
                    </button>
                    <button
                        onClick={() => handleGenerateClick('TRENDING')}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-900/30 text-purple-400 border border-purple-800/50 rounded-lg hover:bg-purple-900/50 transition-all text-xs font-bold uppercase tracking-wider"
                    >
                        <Zap size={14} />
                        Gen Trending
                    </button>
                </div>
            </div>

            {/* Post List */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-950/50 text-neutral-400 border-b border-neutral-800">
                        <tr>
                            <th className="p-4 font-medium pl-6 text-xs uppercase tracking-wider">Status</th>
                            <th className="p-4 font-medium text-xs uppercase tracking-wider">Process Preview</th>
                            <th className="p-4 font-medium w-full text-xs uppercase tracking-wider">Details</th>
                            <th className="p-4 font-medium text-right text-xs uppercase tracking-wider pr-6">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                        {filteredPosts.map((post) => (
                            <tr key={post.id} className="hover:bg-neutral-800/30 transition-colors group">
                                <td className="p-4 pl-6 align-top w-[100px]">
                                    <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold tracking-wider border mb-2 ${post.isPublished
                                        ? 'bg-green-950/30 text-green-400 border-green-900/50'
                                        : 'bg-red-950/30 text-red-500 border-red-900/50'
                                        }`}>
                                        {post.isPublished ? 'LIVE' : 'HIDDEN'}
                                    </span>
                                    <div className="text-[10px] text-neutral-500 font-mono">
                                        {post.type}
                                    </div>
                                </td>
                                <td className="p-4 align-top w-[120px]">
                                    {/* IMAGE PREVIEW IN ROW */}
                                    <div className="w-[100px] h-[100px] bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden relative">
                                        {post.image ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={post.image} alt={post.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-neutral-700">
                                                <ImageIcon size={24} />
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 align-top">
                                    <h3 className="font-bold text-white group-hover:text-purple-300 transition-colors mb-1 line-clamp-2">
                                        {post.title}
                                    </h3>
                                    <p className="text-neutral-400 text-xs line-clamp-2 mb-2">
                                        {post.excerpt || post.content?.substring(0, 100)}...
                                    </p>
                                    <div className="text-[10px] text-neutral-600 font-mono">
                                        Slug: {post.slug} • {new Date(post.timestamp).toLocaleString()}
                                    </div>
                                </td>
                                <td className="p-4 align-top text-right pr-6">
                                    <Link
                                        href={`/admin/post/${post.id}`}
                                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-black text-xs font-bold rounded hover:bg-neutral-200 transition-colors"
                                    >
                                        <Edit2 size={12} />
                                        Manage
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredPosts.length === 0 && (
                    <div className="p-12 text-center text-neutral-500">
                        No posts found in this filter.
                    </div>
                )}
            </div>

            {/* GENERATION MODAL */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-950/50">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                {genType === 'INTEL' ? <Newspaper size={18} className="text-blue-400" /> : <Zap size={18} className="text-purple-400" />}
                                Generate {genType === 'INTEL' ? 'Anime Intel' : 'Trending Post'}
                            </h3>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-neutral-500 hover:text-white"
                            >
                                Close
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-6">
                            {/* Input Section */}
                            <div className="grid gap-4 p-4 bg-neutral-950 rounded-lg border border-neutral-800">
                                <div>
                                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                        Topic / Anime (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="E.g. Solo Leveling, Demon Slayer, or leave empty for auto-search"
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white text-sm focus:border-purple-500 outline-none"
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                    />
                                    <p className="text-[10px] text-neutral-500 mt-1">
                                        If left empty, the engine will search for the latest live {genType === 'INTEL' ? 'news' : 'trends'} automatically.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                        Custom Title (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Headline for the post image"
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white text-sm focus:border-purple-500 outline-none"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                        Custom Description (Optional)
                                    </label>
                                    <textarea
                                        placeholder="The main body text of the post. If empty, it will be auto-generated."
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white text-sm focus:border-purple-500 outline-none h-24 resize-none"
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                    />
                                </div>

                                <button
                                    onClick={handleGeneratePreview}
                                    disabled={isGenerating}
                                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <ImageIcon size={18} />}
                                    {isGenerating ? 'Generating Preview...' : 'Generate Preview'}
                                </button>
                            </div>

                            {/* Preview Section */}
                            {previewPost && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-bold text-green-400 uppercase tracking-wider">Preview Generated</h4>
                                        <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-1 rounded">Draft Saved</span>
                                    </div>

                                    <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden flex flex-col md:flex-row">
                                        {/* Image Preview */}
                                        <div className="md:w-1/2 aspect-[4/5] bg-neutral-900 relative">
                                            {previewPost.image ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img src={previewPost.image} alt="Preview" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-neutral-600">No Image</div>
                                            )}
                                        </div>

                                        {/* Content Preview */}
                                        <div className="p-4 md:w-1/2 flex flex-col justify-center">
                                            <h3 className="text-lg font-bold text-white mb-2">{previewPost.title}</h3>
                                            <p className="text-sm text-neutral-400 leading-relaxed mb-4">{previewPost.content}</p>
                                            <div className="text-xs text-neutral-600 font-mono">
                                                Slug: {previewPost.slug}<br />
                                                Type: {previewPost.type}<br />
                                                Claim: {previewPost.claimType || 'N/A'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {previewPost && (
                            <div className="p-6 border-t border-neutral-800 bg-neutral-950/50 flex justify-end gap-3">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-sm font-semibold text-neutral-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors"
                                >
                                    Confirm & View in Drafts
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
