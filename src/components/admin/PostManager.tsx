
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Edit2, Plus, Zap, Newspaper, Image as ImageIcon, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
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
    const [genType, setGenType] = useState<'INTEL' | 'TRENDING' | 'CUSTOM' | null>(null);
    const [topic, setTopic] = useState('');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [overlayTag, setOverlayTag] = useState('');
    const [customImage, setCustomImage] = useState<File | null>(null);
    const [customImagePreview, setCustomImagePreview] = useState<string>('');
    const [previewPost, setPreviewPost] = useState<BlogPost | null>(null);

    // New Image Search & Processing State
    const [searchedImages, setSearchedImages] = useState<string[]>([]);
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [processedImage, setProcessedImage] = useState<string | null>(null);
    const [isSearchingImages, setIsSearchingImages] = useState(false);
    const [isProcessingImage, setIsProcessingImage] = useState(false);

    // Multi-select state
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isPublishing, setIsPublishing] = useState(false);

    const filteredPosts = posts.filter(post => {
        if (filter === 'LIVE') return post.isPublished;
        if (filter === 'HIDDEN') return !post.isPublished;
        return true;
    });

    const handleGenerateClick = (type: 'INTEL' | 'TRENDING' | 'CUSTOM') => {
        setGenType(type);
        setTopic('');
        setTitle('');
        setContent('');
        setOverlayTag('');
        setCustomImage(null);
        setCustomImagePreview('');
        setCustomImagePreview('');
        setPreviewPost(null);
        // Reset new state
        setSearchedImages([]);
        setSelectedImageIndex(null);
        setProcessedImage(null);
        setShowModal(true);
    };


    // New Handlers
    const handleSearchImages = async () => {
        if (!topic) return alert('Please enter a topic first.');
        setIsSearchingImages(true);
        try {
            const res = await fetch('/api/admin/search-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic })
            });
            const data = await res.json();
            if (data.success) {
                setSearchedImages(data.images);
                setSelectedImageIndex(0); // Default to first
            } else {
                alert('Image search failed: ' + data.error);
            }
        } catch (e) {
            console.error(e);
            alert('Error searching images');
        } finally {
            setIsSearchingImages(false);
        }
    };

    const handleApplyText = async () => {
        const imageUrl = (searchedImages.length > 0 && selectedImageIndex !== null)
            ? searchedImages[selectedImageIndex]
            : customImagePreview; // Fallback to upload if needed

        if (!imageUrl) return alert('No image selected to apply text to.');

        // Use either custom title or topic
        const displayTitle = title || topic;
        if (!displayTitle) return alert('Title is required for text overlay.');

        setIsProcessingImage(true);
        try {
            const res = await fetch('/api/admin/process-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl,
                    title: displayTitle,
                    headline: overlayTag || (genType === 'TRENDING' ? 'TRENDING' : 'NEWS')
                })
            });
            const data = await res.json();
            if (data.success) {
                setProcessedImage(data.processedImage);
            } else {
                alert('Text application failed: ' + data.error);
            }
        } catch (e) {
            console.error(e);
            alert('Error applying text');
        } finally {
            setIsProcessingImage(false);
        }
    };

    // Modified Generate Preview to use the manually processed image if available
    const handleGeneratePreview = async () => {
        setIsGenerating(true);
        setPreviewPost(null);

        try {
            if (genType === 'CUSTOM' || processedImage) {
                // If we have a processed image, use Custom Post flow to save it
                // Or if it's a manual custom post
                if (!title) {
                    // If title missing but we have topic (from manual flow), use topic
                    if (genType !== 'CUSTOM' && !topic) {
                        alert('Title or Topic is required');
                        setIsGenerating(false);
                        return;
                    }
                }

                const finalTitle = title || topic;
                const finalContent = content || `Check out the latest on ${finalTitle}.`;

                // If we have a processed Base64 image, we need to send it.
                // The /api/admin/custom-post expects formData with 'image' file.
                // We might need to convert base64 to blob or update the API.
                // For now, let's assume we can Convert Base64 -> File

                let imagePayload: File | string | null = customImage;

                if (processedImage) {
                    // Convert Base64 to Blob
                    const res = await fetch(processedImage);
                    const blob = await res.blob();
                    imagePayload = new File([blob], "processed-image.png", { type: "image/png" });
                }

                if (!imagePayload && !customImage) {
                    alert('Image required');
                    setIsGenerating(false);
                    return;
                }

                const formData = new FormData();
                formData.append('title', finalTitle);
                formData.append('content', finalContent);
                formData.append('type', genType === 'TRENDING' ? 'TRENDING' : genType === 'INTEL' ? 'INTEL' : 'COMMUNITY');
                formData.append('headline', overlayTag || 'FEATURED');
                formData.append('image', imagePayload as Blob);
                if (processedImage) {
                    formData.append('skipProcessing', 'true');
                }

                const response = await fetch('/api/admin/custom-post', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                if (data.success && data.post) {
                    setPreviewPost(data.post);
                    setPosts([data.post, ...posts]);
                } else {
                    alert('Save failed: ' + (data.error || 'Unknown error'));
                }
            } else {
                // ... Original Auto-Gen Logic (Fallback if no manual image intervention) ...
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
                    setPosts([data.post, ...posts]);
                } else {
                    alert('Generation failed: ' + (data.error || 'Unknown error'));
                }
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

    const handleCancel = async () => {
        if (previewPost) {
            // Remove from local state immediately so it 'disappears' for user
            // Use functional update to ensure we have latest state
            setPosts(currentPosts => currentPosts.filter(p => p.id !== previewPost.id));

            // Delete from DB (Cleanup)
            try {
                const res = await fetch(`/api/posts?id=${encodeURIComponent(previewPost.id)}`, { method: 'DELETE' });
                if (!res.ok) {
                    console.error("Delete draft failed:", await res.text());
                } else {
                    console.log("Draft deleted successfully");
                }
            } catch (e) {
                console.error("Failed to delete draft:", e);
            }
        }
        setShowModal(false);
        setPreviewPost(null);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredPosts.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredPosts.map(p => p.id));
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handlePublishToSocials = async () => {
        if (selectedIds.length === 0) return;

        // Respecting user rule: DO NOT PUBLISH ANYTHING UNLESS I APPROVE
        if (!confirm(`Are you sure you want to publish ${selectedIds.length} selected post(s) to ALL Social Media (X, Facebook, Instagram, Threads)?`)) {
            return;
        }

        setIsPublishing(true);
        let successCount = 0;
        try {
            for (const id of selectedIds) {
                const post = posts.find(p => p.id === id);
                if (!post) continue;

                const res = await fetch('/api/admin/social/publish-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ postId: id })
                });

                const data = await res.json();
                if (data.success) {
                    successCount++;
                } else {
                    alert(`Failed to publish "${post.title}": ${data.error}`);
                    break;
                }
            }
            alert(`Process complete. Successfully published ${successCount} out of ${selectedIds.length} posts to all platforms.`);
            setSelectedIds([]);
        } catch (e: any) {
            alert('Error during social publishing: ' + e.message);
        } finally {
            setIsPublishing(false);
        }
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
                    {selectedIds.length > 0 && (
                        <button
                            onClick={handlePublishToSocials}
                            disabled={isPublishing}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-500 hover:to-blue-500 transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                        >
                            {isPublishing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                            Publish to Socials ({selectedIds.length})
                        </button>
                    )}
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
                    <button
                        onClick={() => handleGenerateClick('CUSTOM' as any)}
                        className="flex items-center gap-2 px-4 py-2 bg-green-900/30 text-green-400 border border-green-800/50 rounded-lg hover:bg-green-900/50 transition-all text-xs font-bold uppercase tracking-wider"
                    >
                        <Plus size={14} />
                        Custom Post
                    </button>
                </div>
            </div>

            {/* Post List */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-950/50 text-neutral-400 border-b border-neutral-800">
                        <tr>
                            <th className="p-4 pl-6 w-[40px]">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.length === filteredPosts.length && filteredPosts.length > 0}
                                    onChange={toggleSelectAll}
                                    className="rounded border-neutral-700 bg-neutral-950 text-purple-600 focus:ring-purple-500"
                                />
                            </th>
                            <th className="p-4 font-medium text-xs uppercase tracking-wider">Status</th>
                            <th className="p-4 font-medium text-xs uppercase tracking-wider">Process Preview</th>
                            <th className="p-4 font-medium w-full text-xs uppercase tracking-wider">Details</th>
                            <th className="p-4 font-medium text-right text-xs uppercase tracking-wider pr-6">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                        {filteredPosts.map((post) => (
                            <tr key={post.id} className={`hover:bg-neutral-800/30 transition-colors group ${selectedIds.includes(post.id) ? 'bg-purple-900/10' : ''}`}>
                                <td className="p-4 pl-6 align-top">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(post.id)}
                                        onChange={() => toggleSelect(post.id)}
                                        className="rounded border-neutral-700 bg-neutral-950 text-purple-600 focus:ring-purple-500"
                                    />
                                </td>
                                <td className="p-4 align-top w-[100px]">
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
                                {genType === 'INTEL' ? <Newspaper size={18} className="text-blue-400" /> :
                                    genType === 'TRENDING' ? <Zap size={18} className="text-purple-400" /> :
                                        <Plus size={18} className="text-green-400" />}
                                {genType === 'INTEL' ? 'Generate Anime Intel' :
                                    genType === 'TRENDING' ? 'Generate Trending Post' :
                                        'Create Custom Post'}
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
                                {genType === 'CUSTOM' ? (
                                    <>
                                        {/* Custom Post Form */}
                                        <div>
                                            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                                Post Title (Required)
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Enter post title (will appear on image)"
                                                className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white text-sm focus:border-green-500 outline-none"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                                Upload Image (Required)
                                            </label>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        setCustomImage(file);
                                                        const reader = new FileReader();
                                                        reader.onloadend = () => {
                                                            setCustomImagePreview(reader.result as string);
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
                                                }}
                                                className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white text-sm focus:border-green-500 outline-none file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-900/30 file:text-green-400 hover:file:bg-green-900/50"
                                            />
                                            {customImagePreview && (
                                                <div className="mt-3 aspect-[4/5] max-w-xs bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={customImagePreview} alt="Preview" className="w-full h-full object-cover" />
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                                Overlay Tag (Purple Text - Optional)
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="E.g. SEASON 2, TRAILER, REVEALED"
                                                className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white text-sm focus:border-green-500 outline-none"
                                                value={overlayTag}
                                                onChange={(e) => setOverlayTag(e.target.value)}
                                            />
                                            <p className="text-[10px] text-neutral-500 mt-1">
                                                This text will appear in purple below the main title.
                                            </p>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                                Description (Optional)
                                            </label>
                                            <textarea
                                                placeholder="Post description..."
                                                className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white text-sm focus:border-green-500 outline-none h-24 resize-none"
                                                value={content}
                                                onChange={(e) => setContent(e.target.value)}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Intel/Trending Form */}
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

                                        {/* IMAGE SEARCH & SELECTION */}
                                        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                                                    Official Image Selector
                                                </label>
                                                <button
                                                    onClick={handleSearchImages}
                                                    disabled={isSearchingImages || !topic}
                                                    className="text-[10px] bg-blue-900/50 text-blue-400 px-2 py-1 rounded border border-blue-800 hover:bg-blue-900 transition-colors disabled:opacity-50"
                                                >
                                                    {isSearchingImages ? 'Searching...' : 'Search Official Images'}
                                                </button>
                                            </div>

                                            {searchedImages.length > 0 ? (
                                                <div className="space-y-3">
                                                    {/* Carousel / Grid */}
                                                    <div className="relative flex items-center justify-center gap-4 bg-black/40 rounded-xl p-4 border border-white/5 min-h-[300px]">
                                                        {/* LEFT ARROW */}
                                                        {searchedImages.length > 1 && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const newIndex = (selectedImageIndex ?? 0) - 1;
                                                                    setSelectedImageIndex(newIndex < 0 ? searchedImages.length - 1 : newIndex);
                                                                }}
                                                                className="absolute left-2 p-2 bg-black/60 hover:bg-black/90 text-white rounded-full border border-white/20 transition-all z-10"
                                                            >
                                                                <ChevronLeft size={24} />
                                                            </button>
                                                        )}

                                                        {/* MAIN IMAGE DISPLAY */}
                                                        <div className="relative group w-[200px] aspect-[4/5] perspective-1000">
                                                            {searchedImages.map((img, idx) => {
                                                                // Simple logic to show current one, maybe slide later. For now, just show active.
                                                                if (idx !== (selectedImageIndex ?? 0)) return null;
                                                                return (
                                                                    <div
                                                                        key={idx}
                                                                        className="relative w-full h-full rounded-xl overflow-hidden shadow-2xl border-2 border-green-500/50"
                                                                    >
                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                        <img src={img} alt={`Result ${idx}`} className="w-full h-full object-cover" />

                                                                        {/* SELECTION INDICATOR (Always Selected in this view) */}
                                                                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                                                                            {searchedImages.map((_, dotIdx) => (
                                                                                <div
                                                                                    key={dotIdx}
                                                                                    className={`w-3 h-3 rounded-full border border-white/80 transition-all ${dotIdx === selectedImageIndex ? 'bg-green-500 scale-110' : 'bg-transparent'}`}
                                                                                />
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        {/* RIGHT ARROW */}
                                                        {searchedImages.length > 1 && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const newIndex = (selectedImageIndex ?? 0) + 1;
                                                                    setSelectedImageIndex(newIndex >= searchedImages.length ? 0 : newIndex);
                                                                }}
                                                                className="absolute right-2 p-2 bg-black/60 hover:bg-black/90 text-white rounded-full border border-white/20 transition-all z-10"
                                                            >
                                                                <ChevronRight size={24} />
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* TEXT OVERLAY ACTION */}
                                                    {selectedImageIndex !== null && (
                                                        <div className="flex flex-col gap-2 pt-2 border-t border-neutral-800">
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Overlay Text (e.g. BREAKING NEWS)"
                                                                    className="flex-1 bg-neutral-950 border border-neutral-700 rounded p-2 text-white text-xs"
                                                                    value={overlayTag}
                                                                    onChange={(e) => setOverlayTag(e.target.value)}
                                                                />
                                                                <button
                                                                    onClick={handleApplyText}
                                                                    disabled={isProcessingImage}
                                                                    className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-2 rounded transition-colors disabled:opacity-50 flex items-center gap-2"
                                                                >
                                                                    {isProcessingImage ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                                                                    Apply Text
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-center py-4 text-xs text-neutral-600 italic">
                                                    Click 'Search' to find official images for this topic.
                                                </div>
                                            )}

                                            {/* Processed Preview */}
                                            {processedImage && (
                                                <div className="mt-4 p-3 bg-neutral-950 rounded border border-purple-500/30">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-xs font-bold text-purple-400">Final Image Preview</span>
                                                        <span className="text-[10px] text-neutral-500">Ready to Save</span>
                                                    </div>
                                                    <div className="aspect-[4/5] w-32 bg-neutral-900 rounded overflow-hidden mx-auto border border-neutral-800">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={processedImage} alt="Processed" className="w-full h-full object-cover" />
                                                    </div>
                                                </div>
                                            )}
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
                                    </>
                                )}

                                <button
                                    onClick={handleGeneratePreview}
                                    disabled={isGenerating}
                                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <ImageIcon size={18} />}
                                    {isGenerating ? 'Generating Preview...' : genType === 'CUSTOM' ? 'Create Preview' : 'Generate Preview'}
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
                                    onClick={handleCancel}
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
            <div className="mt-8 pt-4 border-t border-white/10 text-white/20 text-[10px] uppercase tracking-widest flex justify-between items-center">
                <span>KumoLab Admin Engine v1.2.0</span>
                <span>Last Push: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</span>
            </div>
        </div>
    );
}
