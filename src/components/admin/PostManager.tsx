
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Edit2, Plus, Zap, Newspaper, Image as ImageIcon, Loader2, ChevronLeft, ChevronRight, Trash2, Eye, EyeOff, Twitter, Instagram, Facebook, Share2, CheckCircle2, XCircle, Lock, Unlock, RotateCcw, Anchor, Move, MousePointer2, Type, Maximize2, ChevronRightCircle, ChevronLeftCircle, Terminal, RotateCw } from 'lucide-react';

import { BlogPost } from '@/types';

interface PostManagerProps {
    initialPosts: BlogPost[];
}

const WIDTH = 1080;
const HEIGHT = 1350;

export default function PostManager({ initialPosts }: PostManagerProps) {
    // Normalize posts to ensure isPublished and social stats are present
    const normalizedPosts = initialPosts.map(p => ({
        ...p,
        isPublished: (p as any).is_published ?? p.isPublished,
        socialIds: (p as any).social_ids ?? (p.socialIds || {})
    }));


    const [posts, setPosts] = useState<BlogPost[]>(normalizedPosts);
    const [filter, setFilter] = useState<'ALL' | 'LIVE' | 'HIDDEN'>('ALL');
    const [isGenerating, setIsGenerating] = useState(false);
    const [showModal, setShowModal] = useState(false);

    // Modal State
    const [genType, setGenType] = useState<'INTEL' | 'TRENDING' | 'CUSTOM' | 'CONFIRMATION_ALERT' | null>(null);
    const [topic, setTopic] = useState('');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [overlayTag, setOverlayTag] = useState('NEWS');
    const [customImage, setCustomImage] = useState<File | null>(null);
    const [customImagePreview, setCustomImagePreview] = useState<string>('');
    const [previewPost, setPreviewPost] = useState<BlogPost | null>(null);

    // New Image Search & Processing State
    const [searchedImages, setSearchedImages] = useState<string[]>([]);
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [processedImage, setProcessedImage] = useState<string | null>(null);
    const [isSearchingImages, setIsSearchingImages] = useState(false);
    const [isProcessingImage, setIsProcessingImage] = useState(false);
    const [searchPage, setSearchPage] = useState(1); // Pagination state

    // Advanced Image Manipulation State
    const [imageScale, setImageScale] = useState(1);
    const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
    const [isImageLocked, setIsImageLocked] = useState(false);

    // Text Manipulation State
    const [textScale, setTextScale] = useState(1);
    const [textPosition, setTextPosition] = useState<{ x: number, y: number } | null>(null);
    const [isTextLocked, setIsTextLocked] = useState(false);
    const [gradientPosition, setGradientPosition] = useState<'top' | 'bottom'>('bottom');
    const [purpleWordIndices, setPurpleWordIndices] = useState<number[]>([]);
    const [purpleCursorIndex, setPurpleCursorIndex] = useState(0);
    const [showExpandedPreview, setShowExpandedPreview] = useState(false);
    const [isAutoSnap, setIsAutoSnap] = useState(true);

    const [isApplyGradient, setIsApplyGradient] = useState(true);
    const [isApplyText, setIsApplyText] = useState(true);
    const [dragTarget, setDragTarget] = useState<'image' | 'text' | null>(null);


    // Multi-select state
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isPublishing, setIsPublishing] = useState(false);
    const [editingPostId, setEditingPostId] = useState<string | null>(null);

    // Scheduler Logs State
    const [showLogsModal, setShowLogsModal] = useState(false);
    const [schedulerLogs, setSchedulerLogs] = useState<any[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState<string | null>(null);

    const handleFetchLogs = async () => {
        setIsLoadingLogs(true);
        try {
            const res = await fetch('/api/admin/logs');
            const data = await res.json();
            if (data.success) {
                setSchedulerLogs(data.logs);
            } else {
                console.error("Failed to fetch logs:", data.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingLogs(false);
        }
    };

    const handleRegenerateSlot = async (slot: string) => {
        if (!confirm(`Force regenerate post for slot ${slot}? This will bypass schedule checks.`)) return;
        setIsRegenerating(slot);
        try {
            // Call the manual trigger (which is now cron/route.ts or similar)
            // Actually manual trigger is usually /api/cron?slot=... (legacy) or /api/cron/run-blog-engine?slot=...
            // Let's use the robust one: run-blog-engine
            const res = await fetch(`/api/cron/run-blog-engine?slot=${slot}`);
            const data = await res.json();
            if (data.success) {
                alert(data.message || 'Regeneration successful');
                handleFetchLogs(); // Refresh logs
                // Refresh posts list?
                // window.location.reload(); // Hard refresh to see new post
            } else {
                alert('Regeneration failed: ' + (data.message || data.error));
            }
        } catch (e: any) {
            alert('Error: ' + e.message);
        } finally {
            setIsRegenerating(null);
        }
    };

    const filteredPosts = posts.filter(post => {
        if (filter === 'LIVE') return post.isPublished;
        if (filter === 'HIDDEN') return !post.isPublished;
        return true;
    });

    const handleGenerateClick = (type: 'INTEL' | 'TRENDING' | 'CUSTOM' | 'CONFIRMATION_ALERT') => {
        setEditingPostId(null);
        setGenType(type);
        setTopic('');
        setTitle('');
        setContent('');
        setOverlayTag(type === 'TRENDING' ? 'TRENDING' : type === 'CONFIRMATION_ALERT' ? 'OFFICIAL' : 'NEWS');
        setCustomImage(null);
        setCustomImagePreview('');
        setPreviewPost(null);
        // Reset new state
        setSearchedImages([]);
        setSelectedImageIndex(null);
        setProcessedImage(null);
        setSearchPage(1); // Reset page
        setImageScale(1);
        setImagePosition({ x: 0, y: 0 });
        setIsImageLocked(false);
        setTextScale(1);
        setTextPosition(null);
        setIsTextLocked(false);
        setGradientPosition('bottom');
        setPurpleWordIndices([]);
        setPurpleCursorIndex(0);
        setShowExpandedPreview(false);
        setIsApplyGradient(true);
        setIsApplyText(true);
        setShowModal(true);

    };

    const handleEditClick = (post: BlogPost) => {
        setEditingPostId(post.id as string);
        setGenType(post.type as any);
        setTopic(post.title);
        setTitle(post.title);
        setContent(post.content);
        setOverlayTag(post.headline || 'NEWS');
        setCustomImage(null);
        setCustomImagePreview(post.image || '');
        setPreviewPost(null);
        // Load existing image into the "Pro Editor" so it's visible immediately
        if (post.image) {
            setSearchedImages([post.image]);
            setSelectedImageIndex(0);
        } else {
            setSearchedImages([]);
            setSelectedImageIndex(null);
        }
        setProcessedImage(null);
        setSearchPage(1);
        setImageScale(1);
        setImagePosition({ x: 0, y: 0 });
        setIsImageLocked(false);
        setTextScale(1);
        setTextPosition(null);
        setIsTextLocked(false);
        setGradientPosition('bottom');
        setPurpleWordIndices([]);
        setPurpleCursorIndex(0);
        setShowExpandedPreview(false);
        setIsApplyGradient(false);
        setIsApplyText(false);
        setShowModal(true);
    };


    // New Handlers
    const handleSearchImages = async (reset: boolean = true) => {
        if (!topic) return alert('Please enter a topic first.');
        setIsSearchingImages(true);
        const nextPage = reset ? 1 : searchPage + 1;

        try {
            const res = await fetch('/api/admin/search-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, page: nextPage })
            });
            const data = await res.json();
            if (data.success) {
                if (reset) {
                    setSearchedImages(data.images);
                    setSelectedImageIndex(0);
                } else {
                    // Append new unique images
                    setSearchedImages(prev => [...new Set([...prev, ...data.images])]);
                }
                setSearchPage(nextPage);
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

    const handleApplyText = async (manualScale?: number, manualPos?: { x: number, y: number }, forcedApplyText?: boolean, forcedApplyGradient?: boolean, manualPurpleIndices?: number[], manualGradientPos?: 'top' | 'bottom') => {
        const imageUrl = (searchedImages.length > 0 && selectedImageIndex !== null)
            ? searchedImages[selectedImageIndex]
            : customImagePreview;

        if (!imageUrl) return;

        // User says overlayTag is the text in the picture. 
        // We pass empty title to avoid deduplication with topic.
        const signalText = overlayTag || '';
        // Allow processing even if text is empty, as long as image exists
        // if (isApplyText && !signalText) return; 

        setIsProcessingImage(true);
        try {
            const res = await fetch('/api/admin/process-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl,
                    title: '', // Empty to avoid deduplication and extra text
                    headline: signalText,
                    scale: manualScale ?? imageScale,
                    position: manualPos ?? imagePosition,
                    applyText: forcedApplyText ?? isApplyText,
                    applyGradient: forcedApplyGradient ?? isApplyGradient,
                    textPos: textPosition,
                    textScale,
                    gradientPos: manualGradientPos ?? gradientPosition,
                    purpleIndex: manualPurpleIndices ?? purpleWordIndices
                })
            });
            const data = await res.json();
            if (data.success) {
                setProcessedImage(data.processedImage);
            } else {
                alert('FX configuration failed: ' + data.error);
            }
        } catch (e) {
            console.error(e);
            alert('Error applying FX');
        } finally {
            setIsProcessingImage(false);
        }
    };

    // Advanced Image Interactions
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleImagePointerDown = (e: React.PointerEvent, target: 'image' | 'text' = 'image') => {
        if (target === 'image' && isImageLocked) return;
        if (target === 'text' && isTextLocked) return;

        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setIsDragging(true);
        setDragTarget(target);
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleImagePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || !dragStart || !dragTarget) return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const scaleX = WIDTH / rect.width;
        const scaleY = HEIGHT / rect.height;

        const deltaX = (e.clientX - dragStart.x) * scaleX;
        const deltaY = (e.clientY - dragStart.y) * scaleY;

        if (dragTarget === 'image') {
            setImagePosition(prev => ({
                x: prev.x + (deltaX / WIDTH),
                y: prev.y + (deltaY / HEIGHT)
            }));
        } else if (dragTarget === 'text') {
            setTextPosition(prev => {
                const base = prev || { x: WIDTH / 2, y: gradientPosition === 'top' ? 100 : HEIGHT - 300 };
                return {
                    x: base.x + deltaX,
                    y: base.y + deltaY
                };
            });
        }
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleImagePointerUp = (e: React.PointerEvent) => {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        setIsDragging(false);
        if (dragTarget === 'text' && isAutoSnap) {
            setTextPosition(null); // Snap back to default calculated position
        }
        setDragTarget(null);
        handleApplyText();
    };

    const handleZoom = (delta: number, target: 'image' | 'text' = 'image') => {
        if (target === 'image') {
            const newScale = Math.max(0.1, Math.min(5, imageScale + delta));
            setImageScale(newScale);
            handleApplyText(newScale);
        } else {
            const newScale = Math.max(0.1, Math.min(5, textScale + delta));
            setTextScale(newScale);
            handleApplyText(undefined, undefined, undefined, undefined); // Uses latest textScale state
        }
    };

    const handleResetAll = () => {
        setImageScale(1);
        setImagePosition({ x: 0, y: 0 });
        setIsImageLocked(false);
        setTextScale(1);
        setTextPosition(null);
        setIsTextLocked(false);
        setPurpleWordIndices([]);
        setPurpleCursorIndex(0);
        handleApplyText(1, { x: 0, y: 0 });
    };

    const toggleFX = (type: 'text' | 'gradient') => {
        if (type === 'text') {
            const newVal = !isApplyText;
            setIsApplyText(newVal);
            handleApplyText(undefined, undefined, newVal, undefined);
        } else {
            const newVal = !isApplyGradient;
            setIsApplyGradient(newVal);
            handleApplyText(undefined, undefined, undefined, newVal);
        }
    };



    // Modified Generate Preview to use the manually processed image if available
    const handleGeneratePreview = async () => {
        setIsGenerating(true);
        setPreviewPost(null);

        // Enforce title requirements for Confirmation Alerts
        if (genType === 'CONFIRMATION_ALERT') {
            const validPrefixes = ['JUST CONFIRMED', 'OFFICIAL', 'CONFIRMED'];
            const upperTitle = (title || topic).toUpperCase().trim();
            const hasValidPrefix = validPrefixes.some(prefix => upperTitle.startsWith(prefix));

            if (!hasValidPrefix) {
                alert('CONFIRMATION ALERT titles must begin with JUST CONFIRMED, OFFICIAL, or CONFIRMED.');
                setIsGenerating(false);
                return;
            }
        }

        try {
            if (genType === 'CUSTOM' || processedImage || editingPostId) {
                // If we have a processed image, use Custom Post flow to save it
                // Or if it's a manual custom post OR an edit
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

                if (!imagePayload && !customImage && !editingPostId) {
                    alert('Image required');
                    setIsGenerating(false);
                    return;
                }

                const formData = new FormData();
                formData.append('title', finalTitle);
                formData.append('content', finalContent);
                formData.append('type', genType === 'TRENDING' ? 'TRENDING' : genType === 'INTEL' ? 'INTEL' : genType === 'CONFIRMATION_ALERT' ? 'CONFIRMATION_ALERT' : 'COMMUNITY');
                formData.append('headline', overlayTag);
                if (imagePayload) formData.append('image', imagePayload as Blob);
                if (processedImage || (!imagePayload && customImagePreview)) {
                    formData.append('skipProcessing', 'true');
                }
                if (editingPostId) {
                    formData.append('postId', editingPostId);
                }

                const response = await fetch('/api/admin/custom-post', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                if (data.success && data.post) {
                    setPreviewPost(data.post);
                    if (editingPostId) {
                        setPosts(current => current.map(p => p.id === editingPostId ? data.post : p));
                    } else {
                        setPosts([data.post, ...posts]);
                    }
                } else {
                    alert('Save failed: ' + (data.error || 'Unknown error'));
                }
            } else {
                // ... Original Auto-Gen Logic (Fallback if no manual image intervention) ...
                if (editingPostId) {
                    alert('Direct auto-gen in edit mode not supported. Please use the visual editor tools above.');
                    setIsGenerating(false);
                    return;
                }
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
        // Post is already saved by the API.
        // User just closes modal and sees it in list.
        setShowModal(false);
        setFilter(genType === 'CONFIRMATION_ALERT' ? 'LIVE' : 'HIDDEN');
    };

    const handleCancel = async () => {
        if (previewPost) {
            // Remove from local state immediately so it 'disappears' for user
            // Use functional update to ensure we have latest state
            setPosts(currentPosts => currentPosts.filter(p => p.id !== previewPost.id));

            // Delete from DB (Cleanup)
            try {
                const res = await fetch(`/api/posts?id=${encodeURIComponent(previewPost.id as string)}`, { method: 'DELETE' });
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
            setSelectedIds(filteredPosts.map(p => p.id as string));
        }
    };



    // Social Publish Modal State
    const [showSocialModal, setShowSocialModal] = useState(false);
    const [socialPlatforms, setSocialPlatforms] = useState({
        x: true,
        instagram: true,
        facebook: true
    });
    const [publishStatus, setPublishStatus] = useState<Record<string, Record<string, 'idle' | 'loading' | 'success' | 'error'>>>({});
    const [publishLogs, setPublishLogs] = useState<Record<string, string[]>>({}); // Detailed text logs per post

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const runSocialPublish = async () => {
        if (selectedIds.length === 0) return;

        setIsPublishing(true);
        // Initialize status map for selected posts
        const initStatus: any = {};
        const initLogs: any = {};

        selectedIds.forEach(id => {
            initStatus[id] = {};
            if (socialPlatforms.x) initStatus[id]['x'] = 'idle';
            if (socialPlatforms.instagram) initStatus[id]['instagram'] = 'idle';
            if (socialPlatforms.facebook) initStatus[id]['facebook'] = 'idle';
            initLogs[id] = ["Initializing sequence..."];
        });

        setPublishStatus(initStatus);
        setPublishLogs(initLogs);

        const platformsList = Object.keys(socialPlatforms).filter(k => (socialPlatforms as any)[k]);
        if (platformsList.length === 0) return alert('Select at least one platform');


        try {
            for (const id of selectedIds) {
                const post = posts.find(p => p.id === id);
                if (!post) continue;

                // Update Status to Loading for all active plaforms
                setPublishStatus(prev => {
                    const next = { ...prev };
                    platformsList.forEach(p => next[id][p] = 'loading');
                    return next;
                });

                // Call API
                const res = await fetch('/api/admin/social/publish-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        postId: id,
                        platforms: platformsList
                    })
                });

                const data = await res.json();

                // Parse Results
                setPublishStatus(prev => {
                    const next = { ...prev };
                    const results = data.results || {};

                    platformsList.forEach(p => {
                        const platformKey = p === 'x' ? 'twitter' : p;
                        if (results[p] && results[p].success) {
                            next[id][p] = 'success';
                        } else {
                            next[id][p] = 'error';
                        }
                    });

                    // Update local post state with social IDs if success
                    const anySuccess = Object.values(results).some((r: any) => r && r.success);
                    if (anySuccess) {
                        setPosts(current => current.map(curr => {
                            if (curr.id === id) {
                                const newSocialIds = { ...curr.socialIds };
                                if (results.x?.success) newSocialIds.twitter = results.x.id;
                                if (results.facebook?.success) newSocialIds.facebook = results.facebook.id;
                                if (results.instagram?.success) newSocialIds.instagram = results.instagram.id;

                                return {
                                    ...curr,
                                    isPublished: true,
                                    is_published: true,
                                    socialIds: newSocialIds
                                };
                            }
                            return curr;
                        }));
                    }

                    return next;
                });
            }
        } catch (e: any) {
            console.error('Broadcast protocol failure:', e);
        } finally {
            setIsPublishing(false);
        }
    };



    const handlePublishToSocials = () => {
        if (selectedIds.length === 0) return;
        setShowSocialModal(true);
        // Reset statuses
        setPublishStatus({});
        setPublishLogs({});
        setIsPublishing(false);
    };


    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to PERMANENTLY DELETE ${selectedIds.length} posts? This cannot be undone.`)) return;

        setIsPublishing(true);
        try {
            for (const id of selectedIds) {
                await fetch(`/api/posts?id=${id as string}`, { method: 'DELETE' });
            }
            setPosts(posts.filter(p => !selectedIds.includes(p.id as string)));
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
                    body: JSON.stringify({ id: id as string, is_published: false })
                });
            }

            setPosts(posts.map(p => (p.id && selectedIds.includes(p.id)) ? { ...p, isPublished: false, is_published: false } : p));
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
                <div className="flex bg-white/60 dark:bg-black/40 p-1.5 rounded-xl border border-gray-200 dark:border-white/5 backdrop-blur-md shadow-sm dark:shadow-none">
                    {(['ALL', 'LIVE', 'HIDDEN'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`relative px-4 py-2 text-[10px] md:text-xs font-bold uppercase tracking-widest rounded-lg transition-all duration-300 ${filter === f
                                ? 'text-white shadow-[0_4px_10px_rgba(168,85,247,0.3)]'
                                : 'text-slate-500 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-white/5'
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
            {/* Action Bar - Modern Glass Cards */}
            {/* Action Bar - Modern Aesthetic Compact */}
            <div className="flex flex-wrap gap-3 items-center">
                <button
                    onClick={() => handleGenerateClick('INTEL')}
                    className="flex-1 md:flex-none group relative overflow-hidden px-4 py-3 rounded-xl bg-white/60 dark:bg-blue-950/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-blue-500/20 backdrop-blur-xl shadow-sm hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-0.5 transition-all duration-300 min-w-[100px]"
                >
                    <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                        <Newspaper size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Intel</span>
                    </div>
                </button>

                <button
                    onClick={() => handleGenerateClick('TRENDING')}
                    className="flex-1 md:flex-none group relative overflow-hidden px-4 py-3 rounded-xl bg-white/60 dark:bg-purple-950/10 hover:bg-purple-50 dark:hover:bg-purple-900/20 border border-gray-200 dark:border-purple-500/20 backdrop-blur-xl shadow-sm hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-0.5 transition-all duration-300 min-w-[100px]"
                >
                    <div className="flex items-center justify-center gap-2 text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">
                        <Zap size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Trending</span>
                    </div>
                </button>

                <button
                    onClick={() => handleGenerateClick('CUSTOM' as any)}
                    className="flex-1 md:flex-none group relative overflow-hidden px-4 py-3 rounded-xl bg-white/60 dark:bg-green-950/10 hover:bg-green-50 dark:hover:bg-green-900/20 border border-gray-200 dark:border-green-500/20 backdrop-blur-xl shadow-sm hover:shadow-lg hover:shadow-green-500/10 hover:-translate-y-0.5 transition-all duration-300 min-w-[100px]"
                >
                    <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400 group-hover:scale-105 transition-transform">
                        <Plus size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Create</span>
                    </div>
                </button>

                <button
                    onClick={() => handleGenerateClick('CONFIRMATION_ALERT')}
                    className="flex-1 md:flex-none group relative overflow-hidden px-4 py-3 rounded-xl bg-white/60 dark:bg-orange-950/10 hover:bg-orange-50 dark:hover:bg-orange-900/20 border border-gray-200 dark:border-orange-500/20 backdrop-blur-xl shadow-sm hover:shadow-lg hover:shadow-orange-500/10 hover:-translate-y-0.5 transition-all duration-300 min-w-[100px]"
                >
                    <div className="flex items-center justify-center gap-2 text-orange-600 dark:text-orange-400 group-hover:scale-105 transition-transform">
                        <CheckCircle2 size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Alert</span>
                    </div>
                </button>

                <button
                    onClick={() => { setShowLogsModal(true); handleFetchLogs(); }}
                    className="flex-1 md:flex-none group relative overflow-hidden px-4 py-3 rounded-xl bg-white/60 dark:bg-slate-950/10 hover:bg-slate-50 dark:hover:bg-slate-900/20 border border-gray-200 dark:border-slate-500/20 backdrop-blur-xl shadow-sm hover:shadow-lg hover:shadow-slate-500/10 hover:-translate-y-0.5 transition-all duration-300 min-w-[100px]"
                >
                    <div className="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400 group-hover:scale-105 transition-transform">
                        <Terminal size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Logs</span>
                    </div>
                </button>

                {selectedIds.length > 0 && (
                    <div className="flex gap-2 ml-auto w-full md:w-auto">
                        <button
                            onClick={handleBulkDelete}
                            disabled={isPublishing}
                            className="flex-1 md:flex-none group relative overflow-hidden px-4 py-3 rounded-xl bg-white/60 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-200 dark:border-red-500/20 backdrop-blur-xl shadow-sm hover:shadow-lg hover:shadow-red-500/10 hover:-translate-y-0.5 transition-all duration-300"
                        >
                            <div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400 group-hover:scale-105 transition-transform">
                                {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Delete</span>
                            </div>
                        </button>

                        <button
                            onClick={handleBulkHide}
                            disabled={isPublishing}
                            className="flex-1 md:flex-none group relative overflow-hidden px-4 py-3 rounded-xl bg-white/60 dark:bg-neutral-900/40 hover:bg-gray-50 dark:hover:bg-neutral-800 border border-gray-200 dark:border-neutral-500/20 backdrop-blur-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                        >
                            <div className="flex items-center justify-center gap-2 text-slate-600 dark:text-neutral-400 group-hover:scale-105 transition-transform">
                                <EyeOff size={16} />
                                <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Hide</span>
                            </div>
                        </button>

                        <button
                            onClick={handlePublishToSocials}
                            disabled={isPublishing}
                            className="flex-1 md:flex-none group relative overflow-hidden px-4 py-3 rounded-xl bg-white/60 dark:bg-pink-950/10 hover:bg-pink-50 dark:hover:bg-pink-900/20 border border-gray-200 dark:border-pink-500/20 backdrop-blur-xl shadow-sm hover:shadow-lg hover:shadow-pink-500/10 hover:-translate-y-0.5 transition-all duration-300"
                        >
                            <div className="flex items-center justify-center gap-2 text-pink-600 dark:text-pink-400 group-hover:scale-105 transition-transform">
                                {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                                <span className="text-[10px] font-black uppercase tracking-widest">Publish ({selectedIds.length})</span>
                            </div>
                        </button>
                    </div>
                )}
            </div>

            {/* Content Display - Hybrid Table (Desktop) / Cards (Mobile) */}
            <div className="bg-white/60 dark:bg-black/20 backdrop-blur-xl border border-gray-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-xl dark:shadow-2xl">
                {/* Desktop Table View */}
                <div className="hidden md:block">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/50 dark:bg-white/5 text-slate-500 dark:text-neutral-400 border-b border-gray-200 dark:border-white/5">
                            <tr>
                                <th className="p-4 pl-6 w-[40px]">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.length === filteredPosts.length && filteredPosts.length > 0}
                                        onChange={toggleSelectAll}
                                        className="rounded border-gray-300 dark:border-neutral-700 bg-white dark:bg-black/50 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                </th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider">Signal Status</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider">Visual</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider w-full">Intel</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-right pr-6">Controls</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                            {filteredPosts.map((post) => (
                                <tr key={post.id} className={`group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${post.id && selectedIds.includes(post.id) ? 'bg-purple-50 dark:bg-purple-900/10' : ''}`}>
                                    <td className="p-4 pl-6 align-top">
                                        <input
                                            type="checkbox"
                                            checked={!!post.id && selectedIds.includes(post.id)}
                                            onChange={() => post.id && toggleSelect(post.id)}
                                            className="rounded border-gray-300 dark:border-neutral-700 bg-white dark:bg-black/50 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                        />
                                    </td>
                                    <td className="p-4 align-top w-[120px]">
                                        <div className="flex flex-col gap-2">
                                            <span className={`inline-flex items-center justify-center px-2 py-1 rounded text-[10px] font-black tracking-wider border shadow-sm ${post.type === 'CONFIRMATION_ALERT' ? 'bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20' : post.isPublished
                                                ? 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20'
                                                : 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-500 border-red-200 dark:border-red-500/20'
                                                }`}>
                                                {post.type === 'CONFIRMATION_ALERT' ? 'ALERT' : post.isPublished ? 'LIVE SIGNAL' : 'HIDDEN'}
                                            </span>
                                            <div className="flex items-center justify-center gap-1.5 pt-1">
                                                <Twitter size={10} className={post.socialIds?.twitter ? 'text-blue-400' : 'text-neutral-700 opacity-20'} />
                                                <Instagram size={10} className={post.socialIds?.instagram ? 'text-pink-400' : 'text-neutral-700 opacity-20'} />
                                                <Facebook size={10} className={post.socialIds?.facebook ? 'text-blue-600' : 'text-neutral-700 opacity-20'} />
                                                <Share2 size={10} className={post.socialIds?.threads ? 'text-white' : 'text-neutral-700 opacity-20'} />
                                            </div>
                                            <span className="text-[10px] text-center font-mono text-slate-500 dark:text-neutral-600 uppercase">
                                                {post.type}
                                            </span>
                                        </div>
                                    </td>

                                    <td className="p-4 align-top w-[100px]">
                                        <div className="w-16 h-20 rounded-lg bg-gray-200 dark:bg-black/50 border border-gray-200 dark:border-white/10 overflow-hidden relative group-hover:border-purple-300 dark:group-hover:border-white/30 transition-colors">
                                            {post.image ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img src={post.image} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-neutral-800">
                                                    <ImageIcon size={16} />
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 align-top">
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors mb-1">
                                            {post.title}
                                        </h3>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-neutral-500 font-mono tracking-wide">
                                            <span>{new Date(post.timestamp).toLocaleDateString()}</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-neutral-700" />
                                            <span className="truncate max-w-[200px]">{post.slug}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 align-top text-right pr-6">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => handleEditClick(post)}
                                                title="Visual Mission Control"
                                                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-purple-100 dark:hover:bg-purple-500/20 text-slate-400 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all scale-90 hover:scale-100"
                                            >
                                                <Zap size={14} />
                                            </button>
                                            <Link
                                                href={`/admin/post/${post.id || ''}`}
                                                title="Edit Details"
                                                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-slate-400 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all scale-90 hover:scale-100"
                                            >
                                                <Edit2 size={14} />
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View */}
                <div className="block md:hidden divide-y divide-gray-100 dark:divide-white/5">
                    {filteredPosts.map((post) => (
                        <div key={post.id} className={`p-4 ${post.id && selectedIds.includes(post.id) ? 'bg-purple-50 dark:bg-purple-900/10' : ''}`}>
                            <div className="flex gap-4">
                                {/* Checkbox & Image */}
                                <div className="flex flex-col gap-3">
                                    <input
                                        type="checkbox"
                                        checked={!!post.id && selectedIds.includes(post.id)}
                                        onChange={() => post.id && toggleSelect(post.id)}
                                        className="rounded border-gray-300 dark:border-neutral-700 bg-white dark:bg-black/50 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                    <div className="w-16 h-20 rounded-lg bg-gray-200 dark:bg-black/50 border border-gray-200 dark:border-white/10 overflow-hidden">
                                        {post.image && (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={post.image} alt="" className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex flex-col gap-1">
                                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${post.isPublished
                                                ? 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20'
                                                : 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-500 border-red-200 dark:border-red-500/20'
                                                }`}>
                                                {post.isPublished ? 'LIVE' : 'HIDDEN'}
                                            </span>
                                            <div className="flex gap-1">
                                                <Twitter size={8} className={post.socialIds?.twitter ? 'text-blue-400' : 'text-neutral-700 opacity-20'} />
                                                <Instagram size={8} className={post.socialIds?.instagram ? 'text-pink-400' : 'text-neutral-700 opacity-20'} />
                                                <Facebook size={8} className={post.socialIds?.facebook ? 'text-blue-600' : 'text-neutral-700 opacity-20'} />
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleEditClick(post)}
                                                className="text-purple-600 dark:text-purple-400 hover:text-purple-700"
                                            >
                                                <Zap size={16} />
                                            </button>
                                            <Link
                                                href={`/admin/post/${post.id}`}
                                                className="text-slate-400 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-white"
                                            >
                                                <Edit2 size={16} />
                                            </Link>
                                        </div>
                                    </div>

                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight mb-2 line-clamp-2">
                                        {post.title}
                                    </h3>
                                    <p className="text-[10px] text-slate-500 dark:text-neutral-500 font-mono">
                                        {new Date(post.timestamp).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {filteredPosts.length === 0 && (
                    <div className="p-12 text-center">
                        <div className="inline-flex p-4 rounded-full bg-slate-100 dark:bg-neutral-900/50 text-slate-400 dark:text-neutral-700 mb-4">
                            <Newspaper size={24} />
                        </div>
                        <p className="text-neutral-500 text-sm font-medium">No transmissions found in this sector.</p>
                    </div>
                )}
            </div>

            {/* SOCIAL PUBLISH MODAL OVERHAUL */}
            {showSocialModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => !isPublishing && setShowSocialModal(false)} />
                    <div className="relative bg-[#0a0a0a]/90 border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">

                        {/* Header */}
                        <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                            <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 uppercase tracking-tighter">Broadcast Protocol</h3>
                            <p className="text-[10px] text-neutral-500 font-mono tracking-widest uppercase mt-1">Deploying {selectedIds.length} transmission(s)</p>
                        </div>

                        {/* Platform Selectors */}
                        <div className="p-6 space-y-4">
                            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Select Target Networks</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {(['x', 'instagram', 'facebook', 'threads'] as const).map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setSocialPlatforms(prev => ({ ...prev, [p]: !(prev as any)[p] }))}
                                        disabled={isPublishing}
                                        className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${(socialPlatforms as any)[p]
                                            ? 'bg-white/10 border-white/20 text-white'
                                            : 'bg-black border-white/5 text-neutral-600 opacity-40 hover:opacity-100'
                                            }`}
                                    >
                                        {p === 'x' && <Twitter size={20} />}
                                        {p === 'instagram' && <Instagram size={20} />}
                                        {p === 'facebook' && <Facebook size={20} />}
                                        {p === 'threads' && <Share2 size={20} />}
                                        <span className="text-[10px] font-bold uppercase mt-2">{p === 'x' ? 'X / Twitter' : p}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Active Progress List */}
                        <div className="px-6 pb-6 flex-1 overflow-y-auto max-h-60 custom-scrollbar space-y-3">
                            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block mb-2">Transmission Queue</label>
                            {selectedIds.map(id => {
                                const post = posts.find(p => p.id === id);
                                const status = publishStatus[id] || {};
                                return (
                                    <div key={id} className="p-3 bg-white/[0.03] border border-white/5 rounded-xl flex items-center gap-4">
                                        <div className="w-10 h-12 bg-neutral-900 rounded border border-white/5 overflow-hidden flex-shrink-0">
                                            {post?.image && <img src={post.image} className="w-full h-full object-cover" alt="" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-xs font-bold text-white truncate">{post?.title}</h4>
                                            <div className="flex gap-2 mt-1">
                                                {Object.keys(socialPlatforms).filter(k => (socialPlatforms as any)[k]).map(plat => (
                                                    <div key={plat} className="flex items-center gap-1">
                                                        <span className="text-[9px] text-neutral-500 uppercase font-mono">{plat}:</span>
                                                        {status[plat] === 'loading' ? <Loader2 size={10} className="animate-spin text-purple-400" /> :
                                                            status[plat] === 'success' ? <CheckCircle2 size={10} className="text-green-500" /> :
                                                                status[plat] === 'error' ? <XCircle size={10} className="text-red-500" /> :
                                                                    <div className="w-2.5 h-2.5 rounded-full border border-white/10" />}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer / Action */}
                        <div className="p-6 border-t border-white/5 bg-white/[0.02] flex justify-end gap-4">
                            <button
                                onClick={() => setShowSocialModal(false)}
                                disabled={isPublishing}
                                className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-white disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={runSocialPublish}
                                disabled={isPublishing}
                                className="px-8 py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-black uppercase tracking-widest rounded-lg shadow-lg shadow-purple-500/20 disabled:opacity-50 flex items-center gap-3"
                            >
                                {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                                {isPublishing ? 'Broadcasting...' : 'Execute Protocol'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-slate-900/60 dark:bg-black/90 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowModal(false)} />
                    <div className="relative bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] md:max-h-[85vh] animate-in slide-in-from-bottom-8 duration-300 overflow-hidden">

                        {/* Modal Header */}
                        <div className="p-5 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${genType === 'INTEL' ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : genType === 'TRENDING' ? 'bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400'}`}>
                                    {genType === 'INTEL' ? <Newspaper size={18} /> : genType === 'TRENDING' ? <Zap size={18} /> : <Plus size={18} />}
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest leading-none mb-1">
                                        {genType === 'INTEL' ? 'Initiate Intel Drop' :
                                            genType === 'TRENDING' ? 'Broadcast Trending' :
                                                genType === 'CONFIRMATION_ALERT' ? 'CONFIRMATION ALERT' :
                                                    'Custom Transmission'}
                                    </h3>
                                    <p className="text-[10px] text-slate-500 dark:text-neutral-500 font-mono uppercase">
                                        Protocol: {genType}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-400 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                            >
                                <span className="sr-only">Close</span>
                                <Plus size={20} className="rotate-45" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                            {/* Input Fields Container */}
                            <div className="space-y-4">
                                {genType === 'CUSTOM' || genType === 'CONFIRMATION_ALERT' ? (
                                    <>
                                        {/* Custom Post Inputs */}
                                        <div className="space-y-4">
                                            <div className="group">
                                                <label className="block text-[10px] font-bold text-slate-500 dark:text-neutral-500 uppercase tracking-widest mb-2 group-focus-within:text-green-600 dark:group-focus-within:text-green-500 transition-colors">
                                                    Frequency Title
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder={genType === 'CONFIRMATION_ALERT' ? "JUST CONFIRMED: One Piece Season 2..." : "Enter main headline..."}
                                                    className="w-full bg-slate-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-3 text-slate-900 dark:text-white text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500/50 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                                                    value={title}
                                                    onChange={(e) => setTitle(e.target.value)}
                                                />
                                                {genType === 'CONFIRMATION_ALERT' && (
                                                    <p className="mt-1 text-[9px] text-orange-500 font-bold uppercase tracking-tighter">
                                                        Must start with: JUST CONFIRMED, OFFICIAL, or CONFIRMED
                                                    </p>
                                                )}
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
                                                        className="w-full bg-slate-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-3 text-slate-400 dark:text-neutral-400 text-xs file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wide file:bg-green-100 dark:file:bg-green-500/10 file:text-green-600 dark:file:text-green-400 hover:file:bg-green-200 dark:hover:file:bg-green-500/20 cursor-pointer"
                                                    />
                                                </div>
                                                {customImagePreview && (
                                                    <div className="mt-4 space-y-4">
                                                        {/* Advanced Editor for Custom Uploads */}
                                                        <div className="relative group/carousel bg-slate-100 dark:bg-black/40 rounded-xl p-6 border border-gray-200 dark:border-white/5 min-h-[320px] flex items-center justify-center overflow-hidden">
                                                            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(ellipse_at_center,black,transparent:80%)] pointer-events-none" />

                                                            <div
                                                                className="relative z-10 w-[240px] aspect-[4/5] perspective-1000 cursor-grab active:cursor-grabbing touch-none select-none"
                                                                onPointerDown={handleImagePointerDown}
                                                                onPointerMove={handleImagePointerMove}
                                                                onPointerUp={handleImagePointerUp}
                                                            >
                                                                <div className="relative w-full h-full rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 bg-neutral-900 transition-transform duration-500">
                                                                    <div
                                                                        className="w-full h-full will-change-transform"
                                                                        style={{
                                                                            transform: `scale(${imageScale}) translate(${imagePosition.x * 100}%, ${imagePosition.y * 100}%)`,
                                                                            transition: isDragging ? 'none' : 'transform 0.3s ease-out'
                                                                        }}
                                                                    >
                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                        <img src={customImagePreview} alt="" className="w-full h-full object-cover pointer-events-none" />
                                                                    </div>
                                                                    {isProcessingImage && (
                                                                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-30">
                                                                            <Loader2 size={32} className="text-purple-500 animate-spin" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* FX Control protocol for Custom Upload */}
                                                        <div className="space-y-3">
                                                            <div className="flex items-center justify-between p-2 bg-white/[0.03] border border-white/5 rounded-xl gap-4">
                                                                <div className="flex items-center gap-1">
                                                                    <button onClick={() => handleZoom(-0.1)} className="p-2 hover:bg-white/10 text-white rounded-lg transition-colors"><Plus size={14} className="rotate-45" /></button>
                                                                    <div className="text-[10px] font-mono text-neutral-500 w-12 text-center">SCAL: {(imageScale * 100).toFixed(0)}%</div>
                                                                    <button onClick={() => handleZoom(0.1)} className="p-2 hover:bg-white/10 text-white rounded-lg transition-colors"><Plus size={14} /></button>
                                                                </div>
                                                                <div className="h-4 w-[1px] bg-white/10" />
                                                                <div className="flex-1 flex justify-center text-[9px] font-mono text-neutral-600 uppercase tracking-widest text-center">
                                                                    PAN VISUAL ASSET
                                                                </div>
                                                                <div className="h-4 w-[1px] bg-white/10" />
                                                                <button
                                                                    onClick={() => { setImageScale(1); setImagePosition({ x: 0, y: 0 }); handleApplyText(1, { x: 0, y: 0 }); }}
                                                                    className="text-[9px] font-bold text-neutral-500 hover:text-white uppercase tracking-tighter px-2"
                                                                >
                                                                    Reset
                                                                </button>
                                                            </div>

                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => toggleFX('text')}
                                                                    disabled={isProcessingImage}
                                                                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isApplyText ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'bg-neutral-900 text-neutral-600 border border-white/5'}`}
                                                                >
                                                                    Overlay Text: {isApplyText ? 'ON' : 'OFF'}
                                                                </button>
                                                                <button
                                                                    onClick={() => toggleFX('gradient')}
                                                                    disabled={isProcessingImage}
                                                                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isApplyGradient ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'bg-neutral-900 text-neutral-600 border border-white/5'}`}
                                                                >
                                                                    Gradient: {isApplyGradient ? 'ON' : 'OFF'}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleApplyText()}
                                                                    disabled={isProcessingImage}
                                                                    className="bg-green-600 hover:bg-green-500 text-white text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-xl transition-all flex items-center gap-2"
                                                                >
                                                                    {isProcessingImage ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                                                                    Commit
                                                                </button>
                                                            </div>
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
                                                    className="w-full bg-slate-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-3 text-slate-900 dark:text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-700"
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
                                                    className="w-full bg-slate-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-3 text-slate-900 dark:text-white text-sm focus:border-white/30 focus:ring-1 focus:ring-white/20 outline-none h-32 resize-none transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
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
                                                    className="w-full bg-slate-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-3 text-slate-900 dark:text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                                                    value={topic}
                                                    onChange={(e) => setTopic(e.target.value)}
                                                />
                                            </div>

                                            {/* IMAGE SELECTOR V2 */}
                                            <div className="bg-slate-50/50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-2xl p-4 md:p-5">
                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                                        <label className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">
                                                            Visual Feed Selector (v2)
                                                        </label>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={async () => {
                                                                await handleSearchImages(true);
                                                            }}
                                                            disabled={isSearchingImages || !topic}
                                                            className="text-[10px] font-bold bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg transition-all shadow-lg hover:shadow-green-500/25 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-1.5"
                                                        >
                                                            {isSearchingImages && searchPage === 1 ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                                                            {isSearchingImages && searchPage === 1 ? 'Scanning...' : 'Fetch'}
                                                        </button>
                                                        {searchedImages.length > 0 && (
                                                            <button
                                                                onClick={async () => {
                                                                    await handleSearchImages(false);
                                                                }}
                                                                disabled={isSearchingImages}
                                                                className="text-[10px] font-bold bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-white px-3 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5"
                                                            >
                                                                {isSearchingImages && searchPage > 1 ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                                                More
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {searchedImages.length > 0 ? (
                                                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                                                        {/* --- THE PRO EDITOR STAGE --- */}
                                                        <div className="flex flex-col lg:flex-row gap-6">
                                                            <div className="flex-1 relative group/editor bg-slate-900 dark:bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/5 aspect-[4/5] flex items-center justify-center">
                                                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(157,123,255,0.05)_0%,transparent_100%)] pointer-events-none" />

                                                                {/* Arrow Controls (Floating) */}
                                                                {searchedImages.length > 1 && !isDragging && (
                                                                    <>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setSelectedImageIndex(prev => ((prev ?? 0) - 1 + searchedImages.length) % searchedImages.length); }}
                                                                            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-white text-white hover:text-black rounded-full backdrop-blur-md border border-white/10 transition-all z-20 group-hover/editor:translate-x-0 -translate-x-12 opacity-0 group-hover/editor:opacity-100"
                                                                        >
                                                                            <ChevronLeft size={20} />
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setSelectedImageIndex(prev => ((prev ?? 0) + 1) % searchedImages.length); }}
                                                                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-white text-white hover:text-black rounded-full backdrop-blur-md border border-white/10 transition-all z-20 group-hover/editor:translate-x-0 translate-x-12 opacity-0 group-hover/editor:opacity-100"
                                                                        >
                                                                            <ChevronRight size={20} />
                                                                        </button>
                                                                    </>
                                                                )}

                                                                {/* Stage Content */}
                                                                <div className="relative w-full h-full">
                                                                    {/* 1. Background Image Layer */}
                                                                    <div
                                                                        className="absolute inset-0 cursor-move will-change-transform"
                                                                        onPointerDown={(e) => handleImagePointerDown(e, 'image')}
                                                                        onPointerMove={handleImagePointerMove}
                                                                        onPointerUp={handleImagePointerUp}
                                                                        style={{
                                                                            transform: `scale(${imageScale}) translate(${imagePosition.x * 100}%, ${imagePosition.y * 100}%)`,
                                                                            transition: isDragging && dragTarget === 'image' ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)'
                                                                        }}
                                                                    >
                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                        <img src={searchedImages[selectedImageIndex ?? 0]} alt="" className="w-full h-full object-cover pointer-events-none select-none" />
                                                                    </div>

                                                                    {/* 2. Gradient Layer (Visual Only) */}
                                                                    {isApplyGradient && (
                                                                        <div
                                                                            className={`absolute inset-x-0 h-1/2 pointer-events-none transition-all duration-500 ${gradientPosition === 'top' ? 'top-0 bg-gradient-to-b from-black/95 via-black/40 to-transparent' : 'bottom-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent'}`}
                                                                        />
                                                                    )}

                                                                    {/* 3. Text Manipulation Proxy Layer */}
                                                                    {isApplyText && (
                                                                        <div
                                                                            className={`absolute inset-0 flex pointer-events-none ${gradientPosition === 'top' ? 'items-start' : 'items-end'} justify-center p-8`}
                                                                        >
                                                                            <div
                                                                                className={`pointer-events-auto cursor-grab active:cursor-grabbing select-none group/text transition-all ${isTextLocked ? 'ring-0' : 'ring-1 ring-white/20 hover:ring-purple-500/50'}`}
                                                                                onPointerDown={(e) => handleImagePointerDown(e, 'text')}
                                                                                style={{
                                                                                    transform: textPosition
                                                                                        ? `translate(${textPosition.x - (WIDTH / 2)}px, ${textPosition.y - (HEIGHT * (gradientPosition === 'top' ? 0.1 : 0.85))}px) scale(${textScale})`
                                                                                        : `scale(${textScale})`,
                                                                                    transition: isDragging && dragTarget === 'text' ? 'none' : 'transform 0.4s cubic-bezier(0.2, 0, 0, 1)'
                                                                                }}
                                                                            >
                                                                                <div className="text-center drop-shadow-2xl">
                                                                                    <div
                                                                                        className="text-white text-lg font-black uppercase leading-[0.9] max-w-sm flex flex-wrap justify-center gap-x-1.5"
                                                                                        style={{ fontFamily: 'var(--font-outfit), system-ui, sans-serif' }}
                                                                                    >
                                                                                        {(overlayTag || 'AWAITING SIGNAL').split(/\s+/).filter(Boolean).map((word, idx) => (
                                                                                            <span
                                                                                                key={idx}
                                                                                                onPointerDown={(e) => {
                                                                                                    if (isTextLocked) e.stopPropagation();
                                                                                                }}
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    e.preventDefault();
                                                                                                    const newIndices = purpleWordIndices.includes(idx)
                                                                                                        ? purpleWordIndices.filter(i => i !== idx)
                                                                                                        : [...purpleWordIndices, idx].sort((a, b) => a - b);
                                                                                                    setPurpleWordIndices(newIndices);
                                                                                                }}
                                                                                                className={`${purpleWordIndices.includes(idx) ? 'text-purple-400' : 'text-white'} ${isTextLocked ? 'cursor-pointer hover:opacity-80' : 'cursor-move'}`}
                                                                                            >
                                                                                                {word}
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                                {!isTextLocked && !isDragging && (
                                                                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group/text-hover:opacity-100 transition-opacity bg-purple-600 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter shadow-xl">
                                                                                        Drag to Place
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Processing Loader */}
                                                                    {isProcessingImage && (
                                                                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                                                                            <div className="flex flex-col items-center gap-3">
                                                                                <Loader2 size={32} className="text-purple-500 animate-spin" />
                                                                                <span className="text-[10px] text-purple-400 font-black uppercase tracking-[0.2em]">Processing FX...</span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Side Control Panel */}
                                                            <div className="w-full lg:w-48 flex flex-col gap-4">
                                                                {/* Global Tools */}
                                                                <div className="p-3 bg-white/[0.03] border border-white/5 rounded-2xl flex flex-wrap lg:flex-col gap-2">
                                                                    <button onClick={handleResetAll} className="flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                                                                        <RotateCcw size={14} /> REVERT
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setIsAutoSnap(!isAutoSnap)}
                                                                        className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold rounded-lg transition-all ${isAutoSnap ? 'text-blue-400 bg-blue-400/10' : 'text-neutral-500 bg-white/5'}`}
                                                                    >
                                                                        <Anchor size={14} /> {isAutoSnap ? 'SNAP: ON' : 'SNAP: OFF'}
                                                                    </button>
                                                                </div>

                                                                {/* Image Tools */}
                                                                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-3">
                                                                    <div className="text-[9px] font-black text-neutral-500 uppercase tracking-widest flex justify-between items-center">
                                                                        <span>Asset Zoom</span>
                                                                        <span className="font-mono text-white/50">{Math.round(imageScale * 100)}%</span>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button onClick={() => handleZoom(-0.1, 'image')} className="flex-1 py-1.5 hover:bg-white/5 text-white rounded-lg border border-white/10">-</button>
                                                                        <button onClick={() => handleZoom(0.1, 'image')} className="flex-1 py-1.5 hover:bg-white/5 text-white rounded-lg border border-white/10">+</button>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setIsImageLocked(!isImageLocked)}
                                                                        className={`w-full py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${isImageLocked ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-neutral-800 text-neutral-400 border border-white/5'}`}
                                                                    >
                                                                        {isImageLocked ? <Lock size={12} /> : <Unlock size={12} />} {isImageLocked ? 'LOCKED' : 'UNLOCK'}
                                                                    </button>
                                                                </div>

                                                                {/* Text Tools */}
                                                                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-3">
                                                                    <div className="text-[9px] font-black text-neutral-500 uppercase tracking-widest flex justify-between items-center">
                                                                        <span>Text Scale</span>
                                                                        <span className="font-mono text-white/50">{Math.round(textScale * 100)}%</span>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button onClick={() => handleZoom(-0.1, 'text')} className="flex-1 py-1.5 hover:bg-white/5 text-white rounded-lg border border-white/10">-</button>
                                                                        <button onClick={() => handleZoom(0.1, 'text')} className="flex-1 py-1.5 hover:bg-white/5 text-white rounded-lg border border-white/10">+</button>
                                                                    </div>
                                                                    <div className="text-[9px] font-black text-neutral-500 uppercase tracking-widest mt-2">Position</div>
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <button
                                                                            onClick={() => {
                                                                                setGradientPosition('top');
                                                                                handleApplyText(undefined, undefined, undefined, undefined, undefined, 'top');
                                                                            }}
                                                                            className={`py-2 rounded-lg text-[9px] font-bold ${gradientPosition === 'top' ? 'bg-purple-600 text-white' : 'bg-white/5 text-neutral-500'}`}
                                                                        >
                                                                            HEADER
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                setGradientPosition('bottom');
                                                                                handleApplyText(undefined, undefined, undefined, undefined, undefined, 'bottom');
                                                                            }}
                                                                            className={`py-2 rounded-lg text-[9px] font-bold ${gradientPosition === 'bottom' ? 'bg-purple-600 text-white' : 'bg-white/5 text-neutral-500'}`}
                                                                        >
                                                                            FOOTER
                                                                        </button>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setIsTextLocked(!isTextLocked)}
                                                                        className={`w-full py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${isTextLocked ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-neutral-800 text-neutral-400 border border-white/5'}`}
                                                                    >
                                                                        {isTextLocked ? <Lock size={12} /> : <Unlock size={12} />} {isTextLocked ? 'FIXED' : 'FREE'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* --- PURPLE WORD SELECTOR INTEGRATED --- */}
                                                        <div className="bg-slate-50/50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-2xl overflow-hidden mt-6">
                                                            <div className="p-4 border-b border-gray-100 dark:border-white/5 bg-slate-100/50 dark:bg-white/[0.03] flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <Type size={14} className="text-purple-400" />
                                                                    <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Override Visual Title</span>
                                                                </div>
                                                            </div>

                                                            <div className="p-5 space-y-4">
                                                                <div className="relative group">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="ENTER IMAGE TEXT (e.g. MONSTER ANIME CONFIRMED)"
                                                                        className="w-full bg-slate-100 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-4 text-slate-900 dark:text-white text-sm font-bold focus:border-purple-500 outline-none transition-all uppercase"
                                                                        value={overlayTag}
                                                                        onChange={(e) => {
                                                                            setOverlayTag(e.target.value);
                                                                            setPurpleWordIndices([]); // Reset when text changes
                                                                        }}
                                                                    />
                                                                </div>

                                                                {/* Tactical Selector - Box inside box */}
                                                                <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-4">
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="text-[9px] font-black text-purple-400/50 uppercase tracking-[0.2em]">Purple Signal Targeting</div>
                                                                        <button
                                                                            onClick={() => {
                                                                                const nextVal = !isApplyGradient;
                                                                                setIsApplyGradient(nextVal);
                                                                                handleApplyText(undefined, undefined, undefined, nextVal);
                                                                            }}
                                                                            className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${isApplyGradient ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-neutral-800 text-neutral-500 border border-white/5'}`}
                                                                        >
                                                                            {isApplyGradient ? <Eye size={10} /> : <EyeOff size={10} />} Gradient
                                                                        </button>
                                                                    </div>

                                                                    <div className="flex flex-col sm:flex-row items-center gap-4">
                                                                        <div className="flex-1 flex items-center gap-4">
                                                                            <div className="flex gap-1">
                                                                                <button
                                                                                    onClick={() => setPurpleCursorIndex(prev => Math.max(0, prev - 1))}
                                                                                    className="p-2 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg transition-colors"
                                                                                >
                                                                                    <ChevronLeftCircle size={20} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => setPurpleCursorIndex(prev => {
                                                                                        const wordsCount = overlayTag.split(/\s+/).filter(Boolean).length;
                                                                                        return Math.min(Math.max(0, wordsCount - 1), prev + 1);
                                                                                    })}
                                                                                    className="p-2 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg transition-colors"
                                                                                >
                                                                                    <ChevronRightCircle size={20} />
                                                                                </button>
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-1.5 flex-1 p-2 bg-black/40 rounded-lg border border-white/5 min-h-[36px] items-center">
                                                                                {overlayTag.split(/\s+/).filter(Boolean).map((word, idx) => (
                                                                                    <span
                                                                                        key={idx}
                                                                                        className={`text-[10px] font-black uppercase tracking-tight px-1.5 py-0.5 rounded transition-all ${purpleWordIndices.includes(idx) ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' :
                                                                                            idx === purpleCursorIndex ? 'bg-white/20 text-white ring-1 ring-white/50' : 'text-neutral-600'
                                                                                            }`}
                                                                                    >
                                                                                        {word}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex gap-2 w-full sm:w-auto">
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (!purpleWordIndices.includes(purpleCursorIndex)) {
                                                                                        const newIndices = [...purpleWordIndices, purpleCursorIndex].sort((a, b) => a - b);
                                                                                        setPurpleWordIndices(newIndices);
                                                                                        handleApplyText(undefined, undefined, undefined, undefined, newIndices);
                                                                                    }
                                                                                }}
                                                                                className="flex-1 sm:flex-none px-4 py-2 bg-purple-600 text-white text-[9px] font-black uppercase rounded-lg shadow-lg shadow-purple-500/20 active:scale-95 transition-all"
                                                                            >
                                                                                APPLY PURPLE
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setPurpleWordIndices([]);
                                                                                    handleApplyText(undefined, undefined, undefined, undefined, []);
                                                                                }}
                                                                                className="flex-1 sm:flex-none px-4 py-2 bg-red-500/20 text-red-400 text-[9px] font-black uppercase rounded-lg border border-red-500/30 active:scale-95 transition-all"
                                                                            >
                                                                                REMOVE ALL
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Action Bar */}
                                                        <div className="mt-8 flex flex-col sm:flex-row gap-4">
                                                            <button
                                                                onClick={() => handleApplyText()}
                                                                disabled={isProcessingImage}
                                                                className="flex-1 py-4 bg-white dark:bg-white text-black font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
                                                            >
                                                                {isProcessingImage ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                                                                COMMIT CHANGES TO PREVIEW
                                                            </button>

                                                            {processedImage && (
                                                                <button
                                                                    onClick={() => setShowExpandedPreview(true)}
                                                                    className="py-4 px-8 bg-neutral-900 text-white border border-white/10 font-black uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all flex items-center justify-center gap-2"
                                                                >
                                                                    <Maximize2 size={18} />
                                                                    EXPAND
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Fullscreen Preview Modal */}
                                                        {showExpandedPreview && processedImage && (
                                                            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-12 animate-in fade-in zoom-in-95 duration-300">
                                                                <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setShowExpandedPreview(false)} />
                                                                <div className="relative w-full max-w-4xl aspect-[4/5] bg-neutral-900 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(157,123,255,0.2)] border border-white/10">
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img src={processedImage} alt="Large Preview" className="w-full h-full object-contain" />
                                                                    <button
                                                                        onClick={() => setShowExpandedPreview(false)}
                                                                        className="absolute top-6 right-6 p-4 bg-black/50 hover:bg-red-500 text-white rounded-full backdrop-blur-md border border-white/10 transition-all shadow-2xl z-[201]"
                                                                    >
                                                                        <XCircle size={28} />
                                                                    </button>
                                                                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 px-8 py-4 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl text-[10px] font-black text-white/50 uppercase tracking-[0.5em]">
                                                                        MASTER VISUAL INSPECTION
                                                                    </div>
                                                                </div>
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
                                            <div className="pt-4 border-t border-white/5">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Editor Notes</label>
                                                    <textarea
                                                        placeholder="Optional content body..."
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white text-xs focus:border-white/20 outline-none h-[64px] resize-none overflow-hidden focus:h-24 transition-all"
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
                                    {isGenerating ? 'Saving...' : editingPostId ? 'Deploy Update' : genType === 'CONFIRMATION_ALERT' ? 'Broadcast Live' : 'Save As Hidden'}
                                </button>
                            </div>

                            {/* PREVIEW POST CARD (Result) */}
                            {previewPost && (
                                <div className="mt-8 border-t-2 border-dashed border-white/10 pt-8 animate-in fade-in slide-in-from-bottom-8">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-xs font-black text-green-400 uppercase tracking-widest">
                                            {genType === 'CONFIRMATION_ALERT' ? 'LIVE BROADCAST SIGNAL' : 'Simulation Result'}
                                        </h4>
                                        <span className="text-[10px] bg-white/10 text-white px-2 py-1 rounded font-mono">DRAFT_ID: {previewPost.id?.split('-')[1] || 'NEW'}</span>

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
                                    {genType === 'CONFIRMATION_ALERT' ? 'Acknowledge' : 'Confirm Transmission'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SCHEDULER LOGS MODAL */}
            {showLogsModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#0A0A0A] border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                                    <Terminal size={20} className="text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">System Logs</h3>
                                    <p className="text-xs text-neutral-500 font-mono tracking-widest uppercase">Automation History</p>
                                </div>
                            </div>
                            <button onClick={() => setShowLogsModal(false)} className="p-2 hover:bg-white/5 rounded-full text-neutral-500 hover:text-white transition-colors">
                                <XCircle size={24} />
                            </button>
                        </div>

                        {/* Logs Content */}
                        <div className="flex-1 overflow-auto p-0 md:p-6">
                            {isLoadingLogs ? (
                                <div className="flex flex-col items-center justify-center h-64 gap-4 text-neutral-600">
                                    <Loader2 size={32} className="animate-spin text-blue-500" />
                                    <span className="text-xs font-mono uppercase tracking-widest">Fetching Telemetry...</span>
                                </div>
                            ) : schedulerLogs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 gap-4 text-neutral-600">
                                    <Terminal size={32} className="opacity-20" />
                                    <span className="text-xs font-mono uppercase tracking-widest">No Logs Available</span>
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-white/[0.02] text-neutral-500 text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                                        <tr>
                                            <th className="p-4 border-b border-white/5">Time</th>
                                            <th className="p-4 border-b border-white/5">Slot</th>
                                            <th className="p-4 border-b border-white/5">Status</th>
                                            <th className="p-4 border-b border-white/5 w-full">Message</th>
                                            <th className="p-4 border-b border-white/5 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-xs font-mono">
                                        {schedulerLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="p-4 text-neutral-400 whitespace-nowrap">
                                                    {new Date(log.timestamp).toLocaleDateString()} <span className="text-neutral-600">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                </td>
                                                <td className="p-4 text-white font-bold">{log.slot}</td>
                                                <td className="p-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide border ${log.status === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                                            log.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                                'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                                        }`}>
                                                        {log.status === 'success' ? <CheckCircle2 size={10} /> : log.status === 'error' ? <XCircle size={10} /> : <RotateCcw size={10} />}
                                                        {log.status}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-neutral-300">
                                                    {log.message}
                                                    {log.details && (
                                                        <div className="mt-1 text-[10px] text-neutral-600 truncate max-w-[300px] group-hover:whitespace-normal group-hover:max-w-none transition-all">
                                                            {log.details}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-4 text-right">
                                                    {log.status !== 'success' && (
                                                        <button
                                                            onClick={() => handleRegenerateSlot(log.slot)}
                                                            disabled={isRegenerating === log.slot}
                                                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-purple-500/20 text-neutral-400 hover:text-purple-400 border border-white/10 hover:border-purple-500/30 rounded transition-all text-[10px] font-bold uppercase tracking-wider"
                                                        >
                                                            {isRegenerating === log.slot ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
                                                            Regenerate
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="p-4 border-t border-white/5 bg-white/[0.02] flex justify-between items-center text-[10px] text-neutral-600 font-mono">
                            <span>Logs persist for 7 days</span>
                            <button onClick={handleFetchLogs} className="flex items-center gap-2 hover:text-white transition-colors uppercase tracking-widest">
                                <RotateCcw size={12} /> Refresh
                            </button>
                        </div>
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
