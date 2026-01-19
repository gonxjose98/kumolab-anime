
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Edit2, Plus, Zap, Newspaper, Image as ImageIcon, Loader2, ChevronLeft, ChevronRight, Trash2, EyeOff } from 'lucide-react';
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

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to PERMANENTLY DELETE ${selectedIds.length} posts? This cannot be undone.`)) return;

        setIsPublishing(true);
        try {
            for (const id of selectedIds) {
                await fetch(`/api/posts?id=${id}`, { method: 'DELETE' });
            }
            setPosts(posts.filter(p => !selectedIds.includes(p.id)));
            setSelectedIds([]);
        } catch (e) {
            alert('Delete failed');
            console.error(e);
        } finally {
            setIsPublishing(false);
        }
    };

    const handleBulkHide = async () => {
        if (!confirm(`Hide ${selectedIds.length} posts from the public feed?`)) return;

        setIsPublishing(true);
        try {
            for (const id of selectedIds) {
                await fetch('/api/posts', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, is_published: false })
                });
            }
            setPosts(posts.map(p => selectedIds.includes(p.id) ? { ...p, isPublished: false, is_published: false } : p));
            setSelectedIds([]);
        } catch (e) {
            alert('Hide failed');
            console.error(e);
        } finally {
            setIsPublishing(false);
        }
    };



    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <h2 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 tracking-tighter uppercase drop-shadow-sm">
                        Mission Control
                    </h2>
                    <p className="text-neutral-500 text-xs md:text-sm font-mono tracking-widest uppercase">
                        Admin Intelligence System v2.0
                    </p>
                </div>

                {/* Filters */}
                <div className="flex bg-black/40 p-1.5 rounded-xl border border-white/5 backdrop-blur-md">
                    {(['ALL', 'LIVE', 'HIDDEN'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`relative px-4 py-2 text-[10px] md:text-xs font-bold uppercase tracking-widest rounded-lg transition-all duration-300 ${filter === f
                                ? 'text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                                : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                                }`}
                        >
                            {filter === f && (
                                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg -z-10" />
                            )}
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Action Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button
                    onClick={() => handleGenerateClick('INTEL')}
                    className="group relative overflow-hidden p-4 rounded-xl border border-blue-500/20 bg-blue-950/10 hover:bg-union-blue/20 transition-all active:scale-95"
                >
                    <div className="absolute inset-0 bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors" />
                    <div className="relative flex flex-col items-center gap-2 text-blue-400 group-hover:text-blue-300">
                        <Newspaper size={20} className="drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                        <span className="text-xs font-black uppercase tracking-widest">Gen Intel</span>
                    </div>
                </button>

                <button
                    onClick={() => handleGenerateClick('TRENDING')}
                    className="group relative overflow-hidden p-4 rounded-xl border border-purple-500/20 bg-purple-950/10 hover:bg-purple-900/20 transition-all active:scale-95"
                >
                    <div className="absolute inset-0 bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors" />
                    <div className="relative flex flex-col items-center gap-2 text-purple-400 group-hover:text-purple-300">
                        <Zap size={20} className="drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                        <span className="text-xs font-black uppercase tracking-widest">Gen Trending</span>
                    </div>
                </button>

                <button
                    onClick={() => handleGenerateClick('CUSTOM' as any)}
                    className="group relative overflow-hidden p-4 rounded-xl border border-green-500/20 bg-green-950/10 hover:bg-green-900/20 transition-all active:scale-95"
                >
                    <div className="absolute inset-0 bg-green-500/10 group-hover:bg-green-500/20 transition-colors" />
                    <div className="relative flex flex-col items-center gap-2 text-green-400 group-hover:text-green-300">
                        <Plus size={20} className="drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                        <span className="text-xs font-black uppercase tracking-widest">Create Post</span>
                    </div>
                </button>

                {selectedIds.length > 0 && (
                    <>
                        <button
                            onClick={handleBulkDelete}
                            disabled={isPublishing}
                            className="group relative overflow-hidden p-4 rounded-xl border border-red-500/20 bg-red-950/10 hover:bg-red-900/20 transition-all active:scale-95"
                        >
                            <div className="absolute inset-0 bg-red-500/10 group-hover:bg-red-500/20 transition-colors" />
                            <div className="relative flex flex-col items-center gap-2 text-red-400 group-hover:text-red-300">
                                {isPublishing ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
                                <span className="text-xs font-black uppercase tracking-widest">Delete ({selectedIds.length})</span>
                            </div>
                        </button>

                        <button
                            onClick={handleBulkHide}
                            disabled={isPublishing}
                            className="group relative overflow-hidden p-4 rounded-xl border border-neutral-500/20 bg-neutral-900/40 hover:bg-neutral-800 transition-all active:scale-95"
                        >
                            <div className="absolute inset-0 bg-white/5 group-hover:bg-white/10 transition-colors" />
                            <div className="relative flex flex-col items-center gap-2 text-neutral-400 group-hover:text-neutral-300">
                                {isPublishing ? <Loader2 size={20} className="animate-spin" /> : <EyeOff size={20} />}
                                <span className="text-xs font-black uppercase tracking-widest">Hide ({selectedIds.length})</span>
                            </div>
                        </button>

                        <button
                            onClick={handlePublishToSocials}
                            disabled={isPublishing}
                            className="group relative overflow-hidden p-4 rounded-xl border border-pink-500/20 bg-pink-950/10 hover:bg-pink-900/20 transition-all active:scale-95"
                        >
                            <div className="absolute inset-0 bg-pink-500/10 group-hover:bg-pink-500/20 transition-colors" />
                            <div className="relative flex flex-col items-center gap-2 text-pink-400 group-hover:text-pink-300 animate-pulse">
                                {isPublishing ? <Loader2 size={20} className="animate-spin" /> : <Zap size={20} />}
                                <span className="text-xs font-black uppercase tracking-widest">Publish ({selectedIds.length})</span>
                            </div>
                        </button>
                    </>
                )}
            </div>

            {/* Content Display - Hybrid Table (Desktop) / Cards (Mobile) */}
            <div className="bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                {/* Desktop Table View */}
                <div className="hidden md:block">
                    <table className="w-full text-left">
                        <thead className="bg-white/5 text-neutral-400 border-b border-white/5">
                            <tr>
                                <th className="p-4 pl-6 w-[40px]">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.length === filteredPosts.length && filteredPosts.length > 0}
                                        onChange={toggleSelectAll}
                                        className="rounded border-neutral-700 bg-black/50 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                </th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-500">Signal Status</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-500">Visual</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-500 w-full">Intel</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-500 text-right pr-6">Controls</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredPosts.map((post) => (
                                <tr key={post.id} className={`group hover:bg-white/5 transition-colors ${selectedIds.includes(post.id) ? 'bg-purple-900/10' : ''}`}>
                                    <td className="p-4 pl-6 align-top">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(post.id)}
                                            onChange={() => toggleSelect(post.id)}
                                            className="rounded border-neutral-700 bg-black/50 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                        />
                                    </td>
                                    <td className="p-4 align-top w-[120px]">
                                        <div className="flex flex-col gap-2">
                                            <span className={`inline-flex items-center justify-center px-2 py-1 rounded text-[10px] font-black tracking-wider border shadow-[0_0_10px_inset] ${post.isPublished
                                                ? 'bg-green-950/30 text-green-400 border-green-500/20 shadow-green-500/10'
                                                : 'bg-red-950/30 text-red-500 border-red-500/20 shadow-red-500/10'
                                                }`}>
                                                {post.isPublished ? 'LIVE SIGNAL' : 'HIDDEN'}
                                            </span>
                                            <span className="text-[10px] text-center font-mono text-neutral-600 uppercase">
                                                {post.type}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-4 align-top w-[100px]">
                                        <div className="w-16 h-20 rounded-lg bg-black/50 border border-white/10 overflow-hidden relative group-hover:border-white/30 transition-colors">
                                            {post.image ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img src={post.image} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-neutral-800">
                                                    <ImageIcon size={16} />
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 align-top">
                                        <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors mb-1">
                                            {post.title}
                                        </h3>
                                        <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-mono tracking-wide">
                                            <span>{new Date(post.timestamp).toLocaleDateString()}</span>
                                            <span className="w-1 h-1 rounded-full bg-neutral-700" />
                                            <span className="truncate max-w-[200px]">{post.slug}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 align-top text-right pr-6">
                                        <Link
                                            href={`/admin/post/${post.id}`}
                                            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all"
                                        >
                                            <Edit2 size={14} />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View */}
                <div className="block md:hidden divide-y divide-white/5">
                    {filteredPosts.map((post) => (
                        <div key={post.id} className={`p-4 ${selectedIds.includes(post.id) ? 'bg-purple-900/10' : ''}`}>
                            <div className="flex gap-4">
                                {/* Checkbox & Image */}
                                <div className="flex flex-col gap-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(post.id)}
                                        onChange={() => toggleSelect(post.id)}
                                        className="rounded border-neutral-700 bg-black/50 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                    <div className="w-16 h-20 rounded-lg bg-black/50 border border-white/10 overflow-hidden">
                                        {post.image && (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={post.image} alt="" className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between mb-2">
                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${post.isPublished
                                            ? 'bg-green-950/30 text-green-400 border-green-500/20'
                                            : 'bg-red-950/30 text-red-500 border-red-500/20'
                                            }`}>
                                            {post.isPublished ? 'LIVE' : 'HIDDEN'}
                                        </span>
                                        <Link
                                            href={`/admin/post/${post.id}`}
                                            className="text-neutral-500 hover:text-white"
                                        >
                                            <Edit2 size={16} />
                                        </Link>
                                    </div>
                                    <h3 className="text-sm font-bold text-white leading-tight mb-2 line-clamp-2">
                                        {post.title}
                                    </h3>
                                    <p className="text-[10px] text-neutral-500 font-mono">
                                        {new Date(post.timestamp).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {filteredPosts.length === 0 && (
                    <div className="p-12 text-center">
                        <div className="inline-flex p-4 rounded-full bg-neutral-900/50 text-neutral-700 mb-4">
                            <Newspaper size={24} />
                        </div>
                        <p className="text-neutral-500 text-sm font-medium">No transmissions found in this sector.</p>
                    </div>
                )}
            </div>

            {/* GENERATION MODAL OVERHAUL */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => setShowModal(false)} />
                    <div className="relative bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] md:max-h-[85vh] animate-in slide-in-from-bottom-8 duration-300 overflow-hidden">

                        {/* Modal Header */}
                        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${genType === 'INTEL' ? 'bg-blue-500/10 text-blue-400' : genType === 'TRENDING' ? 'bg-purple-500/10 text-purple-400' : 'bg-green-500/10 text-green-400'}`}>
                                    {genType === 'INTEL' ? <Newspaper size={18} /> : genType === 'TRENDING' ? <Zap size={18} /> : <Plus size={18} />}
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-white uppercase tracking-widest leading-none mb-1">
                                        {genType === 'INTEL' ? 'Initiate Intel Drop' :
                                            genType === 'TRENDING' ? 'Broadcast Trending' :
                                                'Custom Transmission'}
                                    </h3>
                                    <p className="text-[10px] text-neutral-500 font-mono uppercase">
                                        Protocol: {genType}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 hover:bg-white/5 rounded-full text-neutral-500 hover:text-white transition-colors"
                            >
                                <span className="sr-only">Close</span>
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                            {/* Input Fields Container */}
                            <div className="space-y-4">
                                {genType === 'CUSTOM' ? (
                                    <>
                                        {/* Custom Post Inputs */}
                                        <div className="space-y-4">
                                            <div className="group">
                                                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 group-focus-within:text-green-500 transition-colors">
                                                    Frequency Title
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Enter main headline..."
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500/50 outline-none transition-all"
                                                    value={title}
                                                    onChange={(e) => setTitle(e.target.value)}
                                                />
                                            </div>

                                            <div className="group">
                                                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 group-focus-within:text-green-500 transition-colors">
                                                    Visual Asset
                                                </label>
                                                <div className="relative">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                setCustomImage(file);
                                                                const reader = new FileReader();
                                                                reader.onloadend = () => setCustomImagePreview(reader.result as string);
                                                                reader.readAsDataURL(file);
                                                            }
                                                        }}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-neutral-400 text-xs file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wide file:bg-green-500/10 file:text-green-400 hover:file:bg-green-500/20 cursor-pointer"
                                                    />
                                                </div>
                                                {customImagePreview && (
                                                    <div className="mt-4 relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 group">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={customImagePreview} alt="Preview" className="w-full h-full object-cover" />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                                            <span className="text-white text-xs font-bold">Image loaded</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="group">
                                                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 group-focus-within:text-purple-500 transition-colors">
                                                    Overlay Callout
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. BREAKING • OFFICIAL • REVEAL"
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none transition-all placeholder:text-neutral-700"
                                                    value={overlayTag}
                                                    onChange={(e) => setOverlayTag(e.target.value)}
                                                />
                                            </div>

                                            <div className="group">
                                                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 group-focus-within:text-neutral-300 transition-colors">
                                                    Description
                                                </label>
                                                <textarea
                                                    placeholder="Enter transmission content..."
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm focus:border-white/30 focus:ring-1 focus:ring-white/20 outline-none h-32 resize-none transition-all"
                                                    value={content}
                                                    onChange={(e) => setContent(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* AUTO / INTEL Form */}
                                        <div className="space-y-6">
                                            <div className="group">
                                                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 group-focus-within:text-blue-500 transition-colors">
                                                    Target Topic / Anime
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. One Piece, Jujutsu Kaisen (Leave empty for auto-scout)"
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all"
                                                    value={topic}
                                                    onChange={(e) => setTopic(e.target.value)}
                                                />
                                            </div>

                                            {/* IMAGE SELECTOR V2 */}
                                            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 md:p-5">
                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                                        <label className="text-xs font-black text-white uppercase tracking-widest">
                                                            Visual Feed Selector (v2)
                                                        </label>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            console.log("Search button clicked for:", topic);
                                                            handleSearchImages();
                                                        }}
                                                        disabled={isSearchingImages || !topic}
                                                        className="w-full sm:w-auto text-[10px] font-bold bg-green-600 hover:bg-green-500 text-white px-4 py-2.5 rounded-lg transition-all shadow-lg hover:shadow-green-500/25 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                                                    >
                                                        {isSearchingImages ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                                                        {isSearchingImages ? 'SCANNING...' : 'ACQUIRE IMAGES'}
                                                    </button>
                                                </div>

                                                {searchedImages.length > 0 ? (
                                                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                                                        {/* Carousel */}
                                                        <div className="relative group/carousel bg-black/40 rounded-xl p-6 border border-white/5 min-h-[320px] flex items-center justify-center overflow-hidden">
                                                            {/* Grid Background Effect */}
                                                            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)] pointer-events-none" />

                                                            {/* Arrow Controls */}
                                                            {searchedImages.length > 1 && (
                                                                <>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const newIndex = (selectedImageIndex ?? 0) - 1;
                                                                            setSelectedImageIndex(newIndex < 0 ? searchedImages.length - 1 : newIndex);
                                                                        }}
                                                                        className="absolute left-4 p-3 bg-black/50 hover:bg-white text-white hover:text-black rounded-full backdrop-blur-sm border border-white/10 transition-all z-20"
                                                                    >
                                                                        <ChevronLeft size={20} />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const newIndex = (selectedImageIndex ?? 0) + 1;
                                                                            setSelectedImageIndex(newIndex >= searchedImages.length ? 0 : newIndex);
                                                                        }}
                                                                        className="absolute right-4 p-3 bg-black/50 hover:bg-white text-white hover:text-black rounded-full backdrop-blur-sm border border-white/10 transition-all z-20"
                                                                    >
                                                                        <ChevronRight size={20} />
                                                                    </button>
                                                                </>
                                                            )}

                                                            {/* Image Stage */}
                                                            <div className="relative z-10 w-[220px] aspect-[4/5] perspective-1000">
                                                                {searchedImages.map((img, idx) => {
                                                                    if (idx !== (selectedImageIndex ?? 0)) return null;
                                                                    return (
                                                                        <div key={idx} className="relative w-full h-full rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 bg-neutral-900 group-hover/carousel:scale-[1.02] transition-transform duration-500">
                                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                            <img src={img} alt="" className="w-full h-full object-cover" />
                                                                            {/* Selection Dots */}
                                                                            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
                                                                                {searchedImages.map((_, dotIdx) => (
                                                                                    <div
                                                                                        key={dotIdx}
                                                                                        className={`w-1.5 h-1.5 rounded-full transition-all ${dotIdx === selectedImageIndex ? 'bg-white w-4' : 'bg-white/30'}`}
                                                                                    />
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {/* Text Application Control */}
                                                        {selectedImageIndex !== null && (
                                                            <div className="flex gap-2 p-3 bg-black/30 rounded-xl border border-white/5">
                                                                <input
                                                                    type="text"
                                                                    placeholder="OVERLAY TEXT (e.g. S2 ANNOUNCED)"
                                                                    className="flex-1 bg-transparent text-white text-xs font-bold tracking-wide placeholder:text-neutral-600 outline-none uppercase"
                                                                    value={overlayTag}
                                                                    onChange={(e) => setOverlayTag(e.target.value)}
                                                                />
                                                                <button
                                                                    onClick={handleApplyText}
                                                                    disabled={isProcessingImage}
                                                                    className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                                                                >
                                                                    {isProcessingImage ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                                                                    Apply FX
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="py-12 flex flex-col items-center justify-center text-neutral-600 border border-dashed border-neutral-800 rounded-xl">
                                                        <ImageIcon size={32} className="mb-2 opacity-20" />
                                                        <span className="text-xs uppercase tracking-widest font-medium">Awaiting Signal Acquisition</span>
                                                    </div>
                                                )}

                                                {/* Final Preview Output */}
                                                {processedImage && (
                                                    <div className="mt-4 p-4 bg-purple-900/10 border border-purple-500/20 rounded-xl flex items-center gap-4 animate-in slide-in-from-top-2">
                                                        <div className="w-16 h-20 rounded-lg overflow-hidden border border-white/10 bg-black flex-shrink-0">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img src={processedImage} alt="Final" className="w-full h-full object-cover" />
                                                        </div>
                                                        <div>
                                                            <div className="text-purple-400 text-[10px] font-black uppercase tracking-widest mb-1">Status: Processed</div>
                                                            <div className="text-white text-xs">Visual asset ready for deployment.</div>
                                                        </div>
                                                        <div className="ml-auto w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Extra Fields for Manual Override */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Override Title</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Optional title override..."
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white text-xs focus:border-white/20 outline-none"
                                                        value={title}
                                                        onChange={(e) => setTitle(e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Editor Notes</label>
                                                    <textarea
                                                        placeholder="Optional content body..."
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white text-xs focus:border-white/20 outline-none h-[42px] resize-none overflow-hidden focus:h-24 transition-all"
                                                        value={content}
                                                        onChange={(e) => setContent(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Main Generation Action */}
                                <button
                                    onClick={handleGeneratePreview}
                                    disabled={isGenerating}
                                    className="w-full py-4 mt-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_30px_rgba(147,51,234,0.5)] active:scale-[0.99] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-3"
                                >
                                    {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} />}
                                    {isGenerating ? 'Compiling Intel...' : genType === 'CUSTOM' ? 'Construct Post' : 'Generate Preview'}
                                </button>
                            </div>

                            {/* PREVIEW POST CARD (Result) */}
                            {previewPost && (
                                <div className="mt-8 border-t-2 border-dashed border-white/10 pt-8 animate-in fade-in slide-in-from-bottom-8">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-xs font-black text-green-400 uppercase tracking-widest">
                                            Simulation Result
                                        </h4>
                                        <span className="text-[10px] bg-white/10 text-white px-2 py-1 rounded font-mono">DRAFT_ID: {previewPost.id.split('-')[1]}</span>
                                    </div>

                                    <div className="bg-black/80 border border-white/10 rounded-2xl overflow-hidden flex flex-col md:flex-row shadow-2xl">
                                        <div className="md:w-[40%] aspect-[4/5] bg-neutral-900 relative border-b md:border-b-0 md:border-r border-white/10">
                                            {previewPost.image ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img src={previewPost.image} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center text-neutral-700">NO VISUAL</div>
                                            )}
                                        </div>
                                        <div className="p-6 md:w-[60%] flex flex-col">
                                            <div className="mb-auto">
                                                <h3 className="text-xl font-bold text-white mb-3 leading-tight">{previewPost.title}</h3>
                                                <p className="text-sm text-neutral-400 leading-relaxed">{previewPost.content}</p>
                                            </div>
                                            <div className="mt-6 pt-6 border-t border-white/5 grid grid-cols-2 gap-4 text-[10px] font-mono text-neutral-500 uppercase">
                                                <div>
                                                    <span className="block text-neutral-700">Type</span>
                                                    {previewPost.type}
                                                </div>
                                                <div>
                                                    <span className="block text-neutral-700">Timestamp</span>
                                                    {new Date(previewPost.timestamp).toLocaleTimeString()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        {previewPost && (
                            <div className="p-5 border-t border-white/5 bg-white/[0.02] flex justify-end gap-3 backdrop-blur-md">
                                <button
                                    onClick={handleCancel}
                                    className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-white transition-colors"
                                >
                                    Discard
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.5)]"
                                >
                                    Confirm Transmission
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <div className="pt-8 border-t border-white/5 flex justify-between items-center text-[10px] text-neutral-600 font-mono uppercase tracking-widest">
                <span>KumoLab Admin OS v2.1.0 (UI Re-Engineered)</span>
                <span>System Status: ONLINE</span>
            </div>
        </div>
    );
}
