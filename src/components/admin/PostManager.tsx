'use client';

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Edit2, Plus, Zap, Newspaper, Image as ImageIcon, Loader2, ChevronLeft, ChevronRight, Trash2, Eye, EyeOff, Twitter, Instagram, Facebook, Share2, CheckCircle2, XCircle, Lock, Unlock, RotateCcw, Anchor, Move, MousePointer2, Type, Maximize2, ChevronRightCircle, ChevronLeftCircle, Terminal, RotateCw, Upload, Sparkles, Send, Check, X, Calendar, AlertTriangle } from 'lucide-react';

import { BlogPost } from '@/types';

interface PostManagerProps {
    initialPosts: BlogPost[];
}

const WIDTH = 1080;
const HEIGHT = 1350;

export interface LayoutMetadata {
    fontSize: number;
    lineHeight: number;
    y: number;
    lines: string[];
    finalScale: number;
    zone: 'HEADER' | 'FOOTER';
    numLines: number;
    totalHeight: number;
}

export default function PostManager({ initialPosts }: PostManagerProps) {
    // Normalize posts to ensure isPublished and social stats are present
    const normalizedPosts = initialPosts.map(p => {
        const scheduledTime = (p as any).scheduled_post_time ?? p.scheduledPostTime;
        const sourceTier = (p as any).source_tier ?? p.sourceTier ?? 3;
        const relevanceScore = (p as any).relevance_score ?? p.relevanceScore ?? 0;
        const scrapedAt = (p as any).scraped_at ?? p.scrapedAt;
        const source = (p as any).source ?? p.source ?? 'Unknown';

        return {
            ...p,
            isPublished: (p as any).is_published ?? p.isPublished,
            scheduledPostTime: scheduledTime,
            socialIds: (p as any).social_ids ?? (p.socialIds || {}),
            sourceTier,
            relevanceScore,
            scrapedAt,
            source
        };
    });

    console.log('[PostManager] Normalized posts sample:', normalizedPosts.slice(0, 1).map(p => ({ title: p.title, source: p.source, score: p.relevanceScore, tier: p.sourceTier })));


    const [posts, setPosts] = useState<BlogPost[]>(normalizedPosts);
    const [filter, setFilter] = useState<'ALL' | 'LIVE' | 'HIDDEN' | 'PENDING' | 'APPROVED'>('PENDING'); // Default to PENDING for admin review
    const [isGenerating, setIsGenerating] = useState(false);
    const [showModal, setShowModal] = useState(false);

    // Modal State
    const [genType, setGenType] = useState<'INTEL' | 'TRENDING' | 'CUSTOM' | 'CONFIRMATION_ALERT' | null>(null);
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
    const [searchPage, setSearchPage] = useState(1); // Pagination state

    // Advanced Image Manipulation State
    const [imageScale, setImageScale] = useState(1);
    const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
    const [isImageLocked, setIsImageLocked] = useState(false);
    const [isApplyingEffect, setIsApplyingEffect] = useState(false);
    const [isStageDirty, setIsStageDirty] = useState(false); // Track if edits happened since last process

    // Text Manipulation State
    const [textScale, setTextScale] = useState(1);
    const [textPosition, setTextPosition] = useState<{ x: number, y: number }>({ x: WIDTH / 2, y: 1113.75 }); // Regional Control Center (35% zone center)
    const [isTextLocked, setIsTextLocked] = useState(false);
    const [gradientPosition, setGradientPosition] = useState<'top' | 'bottom'>('bottom');
    const [purpleWordIndices, setPurpleWordIndices] = useState<number[]>([]);
    const [purpleCursorIndex, setPurpleCursorIndex] = useState(0);
    const textContainerRef = useRef<HTMLDivElement>(null);

    // Watermark State
    const [isApplyWatermark, setIsApplyWatermark] = useState(true);
    const [watermarkPosition, setWatermarkPosition] = useState<{ x: number, y: number } | null>(null);
    const [isWatermarkLocked, setIsWatermarkLocked] = useState(false);

    const [showExpandedPreview, setShowExpandedPreview] = useState(false);
    const [isAutoSnap, setIsAutoSnap] = useState(false);
    const [containerScale, setContainerScale] = useState(1);

    // --- STRICT STATE MACHINE ---
    type EditorMode = 'RAW' | 'PROCESSED';
    const [editorMode, setEditorMode] = useState<EditorMode>('RAW');

    // Callback ref to reliably track stage size, even if it mounts late
    const stageContainerRef = useCallback((node: HTMLDivElement | null) => {
        if (node !== null) {
            const updateScale = () => {
                const width = node.getBoundingClientRect().width;
                const newScale = width / 1080;
                setContainerScale(newScale > 0 ? newScale : 1);
            };
            updateScale();
            const observer = new ResizeObserver(updateScale);
            observer.observe(node);
        }
    }, []);

    useEffect(() => {
        console.log('[PostManager] Admin OS v2.2.5 Active', {
            totalPosts: posts.length,
            approved: posts.filter(p => p.status === 'approved').length
        });
        (window as any).debugPosts = posts;
    }, [posts]);

    const [layoutMetadata, setLayoutMetadata] = useState<LayoutMetadata | null>(null);

    const [isApplyGradient, setIsApplyGradient] = useState(true);
    const [isApplyText, setIsApplyText] = useState(true);
    const [dragTarget, setDragTarget] = useState<'image' | 'text' | 'watermark' | null>(null);


    // Multi-select state
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isPublishing, setIsPublishing] = useState(false);
    const [editingPostId, setEditingPostId] = useState<string | null>(null);
    const [schedulingPostId, setSchedulingPostId] = useState<string | null>(null);

    // Scheduler Logs State
    const [showLogsModal, setShowLogsModal] = useState(false);
    const [schedulerLogs, setSchedulerLogs] = useState<any[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState<string | null>(null);

    // AI Assistant State
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiChatHistory, setAiChatHistory] = useState<any[]>([]);
    const lastRequestTimestamp = useRef<number>(0);

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

    // --- DEBOUNCED AUTHORITATIVE SYNC ---
    useEffect(() => {
        // KILL SWITCH: If text is OFF, do NOT sync layout with headline
        if (!isApplyText) {
            if (layoutMetadata) setLayoutMetadata(null);
            return;
        }

        const signalText = (overlayTag || '').trim();

        if (signalText.length === 0) {
            if (layoutMetadata) setLayoutMetadata(null);
            return;
        }

        const timer = setTimeout(() => {
            handleApplyText();
        }, 300); // 300ms debounce for typing

        return () => clearTimeout(timer);
    }, [overlayTag, isApplyText]);

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

    const handleApprove = async (postIds: string[]) => {
        setIsPublishing(true);
        try {
            const resp = await fetch('/api/admin/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postIds })
            });
            const result = await resp.json();
            if (result.success) {
                // Fetch updated posts or update locally
                // For simplicity, update locally with estimated times (or refresh)
                setFilter('APPROVED');
                window.location.reload(); // Reliable sync
            } else {
                alert('Approve failed: ' + result.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsPublishing(false);
        }
    };

    const handleUpdateSchedule = async (postId: string, newTime: Date) => {
        setIsPublishing(true);
        try {
            const resp = await fetch('/api/admin/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postId, scheduledTime: newTime.toISOString() })
            });
            const result = await resp.json();
            if (result.success) {
                setPosts(prev => prev.map(p => p.id === postId ? { ...p, scheduledPostTime: newTime.toISOString() } : p));
                setSchedulingPostId(null);
            } else {
                alert('Schedule update failed: ' + result.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsPublishing(false);
        }
    };

    const handleCancelApproval = async (postId: string) => {
        if (!confirm('Revert this post to pending status?')) return;
        setIsPublishing(true);
        try {
            const resp = await fetch('/api/posts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: postId,
                    status: 'pending',
                    scheduled_post_time: null,
                    is_published: false
                })
            });
            const result = await resp.json();
            if (result.success) {
                setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'pending', scheduledPostTime: undefined } : p));
            } else {
                alert('Reset failed: ' + result.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsPublishing(false);
        }
    };

    const handleDecline = async (postIds: string[], reason: string = '') => {
        setIsPublishing(true);
        try {
            const resp = await fetch('/api/admin/decline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postIds, reason })
            });
            const result = await resp.json();
            if (result.success) {
                setPosts(prev => prev.filter(p => !postIds.includes(p.id!)));
                setSelectedIds([]);
            } else {
                alert('Decline failed: ' + result.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsPublishing(false);
        }
    };

    const filteredPosts = posts.filter((post) => {
        if (filter === 'ALL') return true;
        if (filter === 'LIVE') return post.isPublished === true;
        if (filter === 'HIDDEN') return post.isPublished === false && post.status !== 'pending' && post.status !== 'approved';
        if (filter === 'PENDING') return post.status === 'pending';
        if (filter === 'APPROVED') return post.status === 'approved';
        return true;
    }).sort((a, b) => {
        if (filter === 'PENDING') {
            if ((a.relevanceScore || 0) !== (b.relevanceScore || 0)) {
                return (b.relevanceScore || 0) - (a.relevanceScore || 0);
            }
            return (a.sourceTier || 3) - (b.sourceTier || 3);
        }
        if (filter === 'APPROVED') {
            return new Date(a.scheduledPostTime || 0).getTime() - new Date(b.scheduledPostTime || 0).getTime();
        }
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const pendingCount = posts.filter(p => p.status === 'pending').length;
    const approvedCount = posts.filter(p => p.status === 'approved').length;

    const handleGenerateClick = (type: 'INTEL' | 'TRENDING' | 'CUSTOM' | 'CONFIRMATION_ALERT') => {
        setEditingPostId(null);
        setGenType(type);
        setTopic('');
        setTitle('');
        setContent('');
        setOverlayTag('');
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
        setEditorMode('RAW'); // FORCE RAW
        setIsImageLocked(false);
        setTextScale(1);
        // Default to baseline inside the footer zone (Match Engine: 1210)
        setTextPosition({ x: WIDTH / 2, y: 1113.75 });
        setIsTextLocked(false);
        setGradientPosition('bottom');
        setPurpleWordIndices([]);
        setPurpleCursorIndex(0);
        setShowExpandedPreview(false);
        setIsApplyGradient(true);
        setIsApplyText(true);
        setIsApplyWatermark(true);
        setWatermarkPosition(null);
        setIsWatermarkLocked(false);
        // AI Reset
        setAiPrompt('');
        setAiChatHistory([]);
        setShowModal(true);
    };

    const handleEditClick = (post: BlogPost) => {
        setEditingPostId(post.id as string);
        setGenType(post.type as any);
        setTopic(post.title);
        setTitle(post.title);
        setContent(post.content);
        setOverlayTag(post.headline || '');
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
        setImagePosition({ x: 0, y: 0 });
        setEditorMode('RAW');
        setIsImageLocked(false);
        setTextScale(1);
        setTextPosition({ x: WIDTH / 2, y: 1113.75 });
        setIsTextLocked(false);
        setGradientPosition('bottom');
        setPurpleWordIndices([]);
        setPurpleCursorIndex(0);
        setShowExpandedPreview(false);

        setIsApplyGradient(!!(post.headline || post.title));
        setIsApplyText(!!(post.headline || post.title));
        setIsApplyWatermark(true); // Default to true for existing posts
        setWatermarkPosition(null);
        setIsWatermarkLocked(false);
        setShowModal(true);
    };


    // New Handlers
    const handleSearchImages = async (reset: boolean = true, searchTermOverride?: string) => {
        const queryTerm = searchTermOverride || title || topic;
        if (!queryTerm) return alert('Please enter a title or topic first.');
        setIsSearchingImages(true);
        const nextPage = reset ? 1 : searchPage + 1;

        try {
            const res = await fetch('/api/admin/search-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: queryTerm, page: nextPage })
            });
            const data = await res.json();
            if (data.success) {
                if (reset) {
                    setSearchedImages(data.images);
                    setSelectedImageIndex(0);
                    setProcessedImage(null);
                    setIsStageDirty(true);
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

    const handleAiAssistant = async () => {
        if (!aiPrompt.trim()) return;

        setIsAiLoading(true);
        const userMessage = { role: 'user', content: aiPrompt };

        try {
            const res = await fetch('/api/admin/ai-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: aiPrompt,
                    history: aiChatHistory,
                    currentDraft: { title, content }
                })
            });

            const data = await res.json();

            if (data.success) {
                const { draft } = data;
                setTitle(draft.title);
                setContent(draft.content);
                setTopic(draft.imageSearchTerm || draft.title);
                if (draft.type) setGenType(draft.type as any);
                if (draft.status) {
                    const tag = draft.status.replace(/_/g, ' ').toUpperCase();
                    setOverlayTag(tag);
                }

                // Add to interactive history
                setAiChatHistory(prev => [
                    ...prev,
                    userMessage,
                    { role: 'assistant', content: draft.reasoning || 'Draft updated.' }
                ]);
                setAiPrompt('');

                // Automatically search for suggested images
                if (draft.imageSearchTerm) {
                    await handleSearchImages(true, draft.imageSearchTerm);
                }
            } else {
                alert(data.error);
            }
        } catch (e) {
            console.error(e);
            alert('AI Assistant Error');
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleApplyText = async (manualScale?: number, manualPos?: { x: number, y: number }, forcedApplyText?: boolean, forcedApplyGradient?: boolean, manualPurpleIndices?: number[], manualGradientPos?: 'top' | 'bottom', forcedApplyWatermark?: boolean, manualTextScale?: number): Promise<string | null> => {
        const imageUrl = (searchedImages.length > 0 && selectedImageIndex !== null)
            ? searchedImages[selectedImageIndex]
            : customImagePreview;

        if (!imageUrl) return null;

        const signalText = (overlayTag || '').trim();
        setIsProcessingImage(true);
        setIsApplyingEffect(true);

        const timestamp = Date.now();
        lastRequestTimestamp.current = timestamp;

        // DEBUG TRACE
        const payload = {
            imageUrl: imageUrl.substring(0, 50) + '...',
            title: title || topic || '',
            topicState: topic,
            titleState: title,
            headline: signalText.toUpperCase(),
            applyText: forcedApplyText ?? isApplyText,
            forcedApplyText,
            isApplyText
        };
        console.log('[PostManager] handleApplyText Payload:', payload);

        try {
            const res = await fetch('/api/admin/process-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl,
                    title: "", // HARD SEPARATION: NEVER RENDER TOPIC/TITLE TEXT ON IMAGE
                    headline: signalText.toUpperCase(),
                    scale: manualScale ?? imageScale,
                    position: manualPos ?? imagePosition,
                    applyText: payload.applyText,
                    applyGradient: forcedApplyGradient ?? isApplyGradient,
                    textPos: textPosition, // Now always non-null
                    textScale: manualTextScale ?? textScale,
                    gradientPos: manualGradientPos ?? gradientPosition,
                    purpleIndex: manualPurpleIndices ?? purpleWordIndices,
                    applyWatermark: forcedApplyWatermark ?? isApplyWatermark,
                    watermarkPosition,
                    disableAutoScaling: false // ALLOW ENGINE TO SCALE
                })
            });
            const data = await res.json();

            // DROP OUTDATED RESPONSES
            if (timestamp < lastRequestTimestamp.current) {
                console.log('[PostManager] Dropping outdated response');
                return null;
            }

            if (data.success) {
                setProcessedImage(data.processedImage);
                // AUTHORITATIVE SYNC: Always update layoutMetadata, even if null.
                const newLayout = data.layout ?? null;
                setLayoutMetadata(newLayout);

                if (newLayout) {
                    // SYNC FRONTEND SCALE WITH BACKEND APPROVAL
                    setTextScale(newLayout.finalScale);
                } else {
                    // Reset text-specific states if layout is gone
                    setTextScale(1);
                }
                setEditorMode('PROCESSED'); // TRANSITION TO PROCESSED MODE
                setIsStageDirty(false);
                return data.processedImage;
            } else {
                console.error('FX configuration failed: ' + data.error);
                return null;
            }
        } catch (e) {
            console.error(e);
            return null;
        } finally {
            setIsProcessingImage(false);
            setIsApplyingEffect(false);
        }
    };

    // Advanced Image Interactions
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleImagePointerDown = (e: React.PointerEvent, target: 'image' | 'text' | 'watermark' = 'image') => {
        if (target === 'image' && isImageLocked) return;
        if (target === 'text' && isTextLocked) return;
        if (target === 'watermark' && isWatermarkLocked) return;

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
            setIsStageDirty(true);
            // STRICT SEPARATION: Image drag NEVER moves text
        } else if (dragTarget === 'text') {
            // LOCKED: No manual text drift allowed. 
            // Text position is governed strictly by region-based centering.
        } else if (dragTarget === 'watermark') {
            setWatermarkPosition(prev => {
                const base = prev || { x: WIDTH / 2, y: HEIGHT - 40 };
                return {
                    x: base.x + deltaX,
                    y: base.y + deltaY
                };
            });
            setIsStageDirty(true);
        }
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleImagePointerUp = (e: React.PointerEvent) => {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        setIsDragging(false);
        // Removed snap-back logic to ensure text stays where released
        if (dragTarget === 'watermark' && isAutoSnap) {
            setWatermarkPosition(null);
        }
        setDragTarget(null);

        // Only commit changes to backend if we are in PROCESSED mode
        if (editorMode === 'PROCESSED' && (dragTarget === 'text' || dragTarget === 'watermark')) {
            handleApplyText();
        }
    };

    const handleZoom = (delta: number, target: 'image' | 'text' = 'image') => {
        if (target === 'image') {
            if (editorMode === 'PROCESSED') return;
            const newScale = Math.max(0.1, Math.min(5, imageScale + delta));
            setImageScale(newScale);
            setIsStageDirty(true);
        } else {
            const newScale = Math.max(0.1, textScale + delta);
            setTextScale(newScale);
            setIsStageDirty(true);

            if (editorMode === 'PROCESSED') {
                handleApplyText(undefined, undefined, undefined, undefined, undefined, undefined, undefined, newScale);
            }
        }
    };

    const handleResetAll = () => {
        setImageScale(1);
        setImagePosition({ x: 0, y: 0 });
        setIsImageLocked(false);
        setProcessedImage(null);
        setEditorMode('RAW');
        setIsStageDirty(true);
        setTextScale(1);
        setTextPosition({ x: WIDTH / 2, y: 1113.75 });
        setIsTextLocked(false);
        setPurpleWordIndices([]);
        setPurpleCursorIndex(0);
        setLayoutMetadata(null);
        setIsApplyWatermark(true);
        setWatermarkPosition(null);
        setIsWatermarkLocked(false);
        setTextPosition({ x: WIDTH / 2, y: 1147.5 });
        handleApplyText(1, { x: 0, y: 0 });
    };

    const toggleFX = (type: 'text' | 'gradient') => {
        setIsStageDirty(true);
        if (type === 'text') {
            const newVal = !isApplyText;
            setIsApplyText(newVal);
            // In strict mode, we do NOT trigger backend. We rely on content length mostly, 
            // but if we keep this toggle for UI, it should just be local.
        } else {
            const newVal = !isApplyGradient;
            setIsApplyGradient(newVal);
            if (editorMode === 'PROCESSED') {
                handleApplyText(undefined, undefined, undefined, newVal);
            }
        }
    };



    // Modified Generate Preview to use the manually processed image if available
    const handleSavePost = async (autoClose: boolean = false) => {
        setIsGenerating(true);

        // FORCE REGENERATION: To ensure the latest text (Topic/Title) is applied
        // We cannot rely solely on cached 'processedImage' because the user might have just typed 
        // in the Topic box without triggering 'isStageDirty' if onBlur didn't fire yet.
        // So we ALWAYS regenerate if we have a source image.
        let finalImageToSave: string | null = null;

        const imageUrl = (searchedImages.length > 0 && selectedImageIndex !== null)
            ? searchedImages[selectedImageIndex]
            : customImagePreview;

        if (imageUrl) {
            // 3. forcedApplyText: Respect isApplyText (Do NOT force true)
            // 7. forcedApplyWatermark: TRUE (Always force watermark on save)
            console.log(`[Admin] Generating FINAL save image (Text: ${isApplyText ? 'ON' : 'OFF'})...`);
            finalImageToSave = await handleApplyText(undefined, undefined, isApplyText, undefined, undefined, undefined, true);
        } else {
            console.warn('[Admin] No image found to process for save.');
        }

        if (genType === 'CONFIRMATION_ALERT') {
            const validPrefixes = ['JUST CONFIRMED', 'OFFICIAL', 'CONFIRMED'];
            const upperTitle = (title || topic || '').toUpperCase().trim();
            const hasValidPrefix = validPrefixes.some(prefix => upperTitle.startsWith(prefix));

            if (!hasValidPrefix) {
                alert('CONFIRMATION ALERT titles must begin with JUST CONFIRMED, OFFICIAL, or CONFIRMED.');
                setIsGenerating(false);
                return;
            }
        }

        try {
            // AUTHORITATIVE VALIDATION: Title is only required for the DB record.
            // If TEXT OFF, we allow a metadata-only fallback to prevent UX deadlock.
            const finalTitle = (title || topic || (isApplyText ? '' : `UNTITLED DROP ${Date.now()}`)).trim();
            if (!finalTitle) {
                alert('Title or Topic is required to save a transmission.');
                setIsGenerating(false);
                return;
            }

            // Reliable Base64 to File conversion
            let imageFileToUpload: Blob | null = null;
            let imageFileName: string = "processed-vision.png";

            // STRICT HIERARCHY:
            // 1. Use the just-generated "Forced" image (Freshest)
            // 2. Use the cached "Preview" image (Next best)
            // 3. ERROR if strictly needed.
            const targetImageString = finalImageToSave || processedImage;

            if (targetImageString && targetImageString.startsWith('data:')) {
                const parts = targetImageString.split(',');
                const byteString = atob(parts[1]);
                const mimeString = parts[0].split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([ab], { type: mimeString });
                imageFileToUpload = blob;
            } else if (customImage && (genType === null || !isApplyText)) {
                // ONLY fall back to raw custom image if we are NOT applying text
                // or if it's a simple Community post.
                imageFileToUpload = customImage;
                imageFileName = customImage.name;
            } else if (!editingPostId) {
                // If new post and no processed image...
                alert('CRITICAL: Visual processing failed. Text overlay was not generated. Retrying...');
                setIsGenerating(false);
                return;
            }

            const formData = new FormData();
            formData.append('title', finalTitle);
            formData.append('content', content || `Transmission for ${finalTitle}.`);
            formData.append('type', genType === 'TRENDING' ? 'TRENDING' : genType === 'INTEL' ? 'INTEL' : genType === 'CONFIRMATION_ALERT' ? 'CONFIRMATION_ALERT' : 'COMMUNITY');
            formData.append('headline', (overlayTag || 'FEATURED').toUpperCase());

            if (imageFileToUpload) {
                formData.append('image', imageFileToUpload, imageFileName);
                formData.append('skipProcessing', 'true');
            } else if (editingPostId) {
                formData.append('skipProcessing', 'true');
            } else {
                alert('Visual asset is required for new transmissions.');
                setIsGenerating(false);
                return;
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
                if (editingPostId) {
                    setPosts(current => current.map(p => p.id === editingPostId ? data.post : p));
                } else {
                    setPosts(current => [data.post, ...current]);
                }

                if (autoClose) {
                    setShowModal(false);
                    setPreviewPost(null);
                    setFilter(genType === 'CONFIRMATION_ALERT' ? 'LIVE' : 'HIDDEN');
                    alert(`Transmission ${editingPostId ? 'updated' : 'deployed'} successfully.`);
                } else {
                    // CRITICAL: Ensure we use the processed image for the preview if we saved one
                    const previewData: any = {
                        ...data.post,
                        image: finalImageToSave || data.post.image,
                        isSaved: true
                    };

                    // Force the locally held visuals if they exist to avoid stale cloud versions
                    if (processedImage) previewData.image = processedImage;

                    setPreviewPost(previewData);
                }
            } else {
                alert('FAILURE: ' + (data.error || 'Server rejected the transmission signal.'));
            }
        } catch (e: any) {
            console.error("[Admin] Persistence Error:", e);
            alert('CRITICAL FAILURE: ' + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGeneratePreview = () => handleSavePost(false);

    const handleConfirm = async () => {
        // If it's a preview that hasn't been saved yet, save it now.
        if (previewPost && !(previewPost as any).isSaved) {
            await handleSavePost(true);
        } else {
            setShowModal(false);
            setPreviewPost(null);
            setFilter(genType === 'CONFIRMATION_ALERT' ? 'LIVE' : 'HIDDEN');
        }
    };

    // stageRef moved to top level

    const handleCommitToPreview = async () => {
        setIsProcessingImage(true);
        try {
            // STEP 1: RESOLVE THE IMAGE SOURCE
            let finalImageUrl = (searchedImages.length > 0 && selectedImageIndex !== null)
                ? searchedImages[selectedImageIndex]
                : customImagePreview;

            // If it's a blob (local file), convert to Base64 so the server can see it
            if (finalImageUrl?.startsWith('blob:')) {
                // Fetch the blob and convert to base64
                const blob = await fetch(finalImageUrl).then(r => r.blob());
                finalImageUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            }

            if (!finalImageUrl) throw new Error("No image selected to commit.");

            // STEP 2: TRIGGER BACKEND GENERATION (Guaranteed 1080x1350)

            // PRIORITY FIX: Use Topic first, as that is the active input for Intel/Trending
            const effectiveTitle = topic || title || '';
            const effectiveHeadline = (overlayTag || '').trim().toUpperCase();

            console.log('[PostManager] Committing Preview with:', {
                title: effectiveTitle,
                headline: effectiveHeadline,
                topicState: topic,
                titleState: title
            });

            const res = await fetch('/api/admin/process-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl: finalImageUrl,
                    title: effectiveTitle,
                    headline: effectiveHeadline,
                    position: imagePosition,
                    applyText: isApplyText,
                    applyGradient: isApplyGradient,
                    textPos: textPosition,

                    textScale,
                    gradientPos: gradientPosition,
                    purpleIndex: purpleWordIndices,
                    applyWatermark: isApplyWatermark,
                    watermarkPosition,
                    disableAutoScaling: false // ALLOW ENGINE TO SCALE
                })
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.error || "Generation failed");
            }

            // AUTHORITATIVE SYNC: Ensure state is cleared if backend returned no layout
            setLayoutMetadata(data.layout ?? null);

            // STEP 3: UPDATE STATE WITH HQ IMAGE
            setProcessedImage(data.processedImage); // Base64 HQ
            setEditorMode('PROCESSED');
            setIsStageDirty(false);

            const finalTitle = title || topic || 'UNTITLED SIGNAL';
            const finalContent = content || `Simulation content for ${finalTitle}.`;

            setPreviewPost({
                id: editingPostId || 'preview-' + Date.now(),
                title: finalTitle,
                content: finalContent,
                type: genType || 'COMMUNITY',
                image: data.processedImage, // Use the Perfect 1080x1350 Render
                headline: overlayTag,
                timestamp: new Date().toISOString(),
                isPublished: false,
                isSaved: false
            } as any);

            return true;
        } catch (e: any) {
            console.error("Commit failed:", e);
            alert('Error committing preview: ' + e.message);
            return false;
        } finally {
            setIsProcessingImage(false);
        }
    };


    const handleCancel = async () => {
        // If we are editing, JUST CLOSE. Do NOT delete the post!
        if (editingPostId) {
            setPreviewPost(null);
            setShowModal(false);
            return;
        }

        if (previewPost && (previewPost as any).isSaved) {
            // Only delete if it's a NEW post that was saved to the DB as a temporary draft
            try {
                const res = await fetch(`/api/posts?id=${encodeURIComponent(previewPost.id as string)}`, { method: 'DELETE' });
                if (res.ok) {
                    setPosts(currentPosts => currentPosts.filter(p => p.id !== previewPost.id));
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
                <div className="flex bg-white/60 dark:bg-black/40 p-1.5 rounded-xl border border-gray-200 dark:border-white/5 backdrop-blur-md shadow-sm dark:shadow-none overflow-x-auto">
                    {(['PENDING', 'APPROVED', 'LIVE', 'HIDDEN', 'ALL'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`relative px-4 py-2 text-[10px] md:text-xs font-bold uppercase tracking-widest rounded-lg transition-all duration-300 flex items-center gap-2 whitespace-nowrap ${filter === f
                                ? 'text-white shadow-[0_4px_10px_rgba(168,85,247,0.3)]'
                                : 'text-slate-500 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-white/5'
                                }`}
                        >
                            {filter === f && (
                                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg -z-10" />
                            )}
                            <span>{f}</span>
                            {f === 'PENDING' && pendingCount > 0 && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black ${filter === f ? 'bg-white text-purple-600' : 'bg-purple-600 text-white'}`}>
                                    {pendingCount}
                                </span>
                            )}
                            {f === 'APPROVED' && approvedCount > 0 && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black ${filter === f ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'}`}>
                                    {approvedCount}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Action Bar */}
            {/* Action Bar - Modern Glass Cards */}
            {/* Action Bar - Modern Aesthetic Compact */}
            <div className="flex flex-wrap gap-3 items-center">
                <button
                    onClick={() => handleGenerateClick('CUSTOM' as any)}
                    className="flex-1 md:flex-none group relative overflow-hidden px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 border border-purple-400 backdrop-blur-xl shadow-lg shadow-purple-500/20 hover:-translate-y-0.5 transition-all duration-300 min-w-[120px]"
                >
                    <div className="flex items-center justify-center gap-2 text-white group-hover:scale-105 transition-transform">
                        <Sparkles size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">AI Assist</span>
                    </div>
                </button>

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
                            onClick={() => handleApprove(selectedIds)}
                            disabled={isPublishing}
                            className="flex-1 md:flex-none group relative overflow-hidden px-4 py-3 rounded-xl bg-green-600 hover:bg-green-500 border border-green-400 backdrop-blur-xl shadow-lg shadow-green-500/20 hover:-translate-y-0.5 transition-all duration-300"
                        >
                            <div className="flex items-center justify-center gap-2 text-white group-hover:scale-105 transition-transform">
                                {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                <span className="text-[10px] font-black uppercase tracking-widest">Approve ({selectedIds.length})</span>
                            </div>
                        </button>

                        <button
                            onClick={() => handleDecline(selectedIds)}
                            disabled={isPublishing}
                            className="flex-1 md:flex-none group relative overflow-hidden px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 border border-red-400 backdrop-blur-xl shadow-lg shadow-red-500/20 hover:-translate-y-0.5 transition-all duration-300"
                        >
                            <div className="flex items-center justify-center gap-2 text-white group-hover:scale-105 transition-transform">
                                {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                                <span className="text-[10px] font-black uppercase tracking-widest">Decline ({selectedIds.length})</span>
                            </div>
                        </button>

                        <button
                            onClick={handlePublishToSocials}
                            disabled={isPublishing}
                            className="flex-1 md:flex-none group relative overflow-hidden px-4 py-3 rounded-xl bg-white/60 dark:bg-pink-950/10 hover:bg-pink-50 dark:hover:bg-pink-900/20 border border-gray-200 dark:border-pink-500/20 backdrop-blur-xl shadow-sm hover:shadow-lg hover:shadow-pink-500/10 hover:-translate-y-0.5 transition-all duration-300"
                        >
                            <div className="flex items-center justify-center gap-2 text-pink-600 dark:text-pink-400 group-hover:scale-105 transition-transform">
                                {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                                <span className="text-[10px] font-black uppercase tracking-widest">Broadcast ({selectedIds.length})</span>
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
                                <th className="p-4 text-xs font-bold uppercase tracking-wider">
                                    {filter === 'PENDING' ? 'Metadata' : 'Signal Status'}
                                </th>
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
                                    <td className="p-4 align-top w-[140px]">
                                        {filter === 'PENDING' ? (
                                            <div className="flex flex-col gap-1.5">
                                                {/* LOUD VERIFICATION LOG */}
                                                {(() => {
                                                    const logMsg = `[V3-REFRESH] METADATA RENDERING: Source=${post.source} | Score=${post.relevanceScore} | Tier=${post.sourceTier} | Time=${new Date().toISOString()}`;
                                                    console.log(`%c ${logMsg}`, 'background: #222; color: #bada55; font-size: 10px; font-weight: bold;');
                                                    return null;
                                                })()}
                                                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">
                                                    Source: <span className="text-white/60">{post.source || 'Unknown'}</span> | Score: <span className="text-white/60">{post.relevanceScore || 0}</span> | Tier <span className="text-white/60">{post.sourceTier || 3}</span>
                                                </div>
                                                <div className="text-[8px] font-mono text-neutral-600">
                                                    {post.scrapedAt ? new Date(post.scrapedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Manual'}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                <span className={`inline-flex items-center justify-center px-2 py-1 rounded text-[10px] font-black tracking-wider border shadow-sm ${post.status === 'approved' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20' : post.type === 'CONFIRMATION_ALERT' ? 'bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20' : post.isPublished
                                                    ? 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20'
                                                    : 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-500 border-red-200 dark:border-red-500/20'
                                                    }`}>
                                                    {post.status === 'approved' ? 'SCHEDULED' : post.type === 'CONFIRMATION_ALERT' ? 'ALERT' : post.isPublished ? 'LIVE SIGNAL' : 'HIDDEN'}
                                                </span>
                                                {post.status === 'approved' && (
                                                    <div className="flex flex-col items-center gap-1.5 pt-1">
                                                        {(post.scheduledPostTime || (post as any).scheduled_post_time) ? (
                                                            <div className="flex flex-col items-center text-[9px] font-black text-blue-400 uppercase tracking-tighter leading-tight">
                                                                <div className="flex items-center gap-1">
                                                                    <Calendar size={10} />
                                                                    {new Date(post.scheduledPostTime || (post as any).scheduled_post_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                                <div className="opacity-60">
                                                                    {new Date(post.scheduledPostTime || (post as any).scheduled_post_time).toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' })}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-[9px] font-black text-red-500 uppercase tracking-tighter flex items-center gap-1">
                                                                <AlertTriangle size={10} />
                                                                Pending Slot
                                                            </div>
                                                        )}

                                                        {schedulingPostId === post.id ? (
                                                            <div className="flex flex-col gap-1 w-full bg-blue-500/5 p-1.5 rounded-lg border border-blue-500/20 animate-in fade-in zoom-in-95">
                                                                {[10, 14, 18, 21].map(h => (
                                                                    <button
                                                                        key={h}
                                                                        onClick={() => {
                                                                            const sched = post.scheduledPostTime || (post as any).scheduled_post_time || new Date().toISOString();
                                                                            const d = new Date(sched);
                                                                            d.setHours(h, 0, 0, 0);
                                                                            handleUpdateSchedule(post.id!, d);
                                                                        }}
                                                                        className="text-[8px] font-black py-1 px-2 hover:bg-blue-500 text-blue-400 hover:text-white rounded transition-colors text-left uppercase"
                                                                    >
                                                                        {h > 12 ? `${h - 12}:00 PM` : h === 12 ? '12:00 PM' : `${h}:00 AM`}
                                                                    </button>
                                                                ))}
                                                                <input
                                                                    type="datetime-local"
                                                                    className="text-center text-[8px] font-bold bg-black/40 border border-white/10 rounded p-1 text-white outline-none focus:border-blue-500/50 mt-1"
                                                                    onChange={(e) => {
                                                                        if (e.target.value) handleUpdateSchedule(post.id!, new Date(e.target.value));
                                                                    }}
                                                                />
                                                                <button
                                                                    onClick={() => setSchedulingPostId(null)}
                                                                    className="text-[8px] font-black text-red-400/70 hover:text-red-400 uppercase tracking-widest mt-1 py-1"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col gap-1 w-full opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => setSchedulingPostId(post.id!)}
                                                                    className="text-[8px] font-black py-1 px-2 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white border border-blue-500/20 rounded uppercase tracking-widest transition-all"
                                                                >
                                                                    Change
                                                                </button>
                                                                <button
                                                                    onClick={() => handleCancelApproval(post.id!)}
                                                                    className="text-[8px] font-black py-1 px-2 text-neutral-500 hover:text-red-400 uppercase tracking-widest transition-colors"
                                                                >
                                                                    Revoke
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {filter === 'LIVE' && (
                                                    <div className="flex items-center justify-center gap-1.5 pt-1">
                                                        <Twitter size={10} className={post.socialIds?.twitter ? 'text-blue-400' : 'text-neutral-700 opacity-20'} />
                                                        <Instagram size={10} className={post.socialIds?.instagram ? 'text-pink-400' : 'text-neutral-700 opacity-20'} />
                                                        <Facebook size={10} className={post.socialIds?.facebook ? 'text-blue-600' : 'text-neutral-700 opacity-20'} />
                                                        <Share2 size={10} className={post.socialIds?.threads ? 'text-white' : 'text-neutral-700 opacity-20'} />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </td>

                                    <td className="p-4 align-top w-[100px]">
                                        <div className="w-16 h-20 rounded-lg bg-gray-200 dark:bg-black/50 border border-gray-200 dark:border-white/10 overflow-hidden relative group-hover:border-purple-300 dark:group-hover:border-white/30 transition-colors">
                                            {post.image ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img
                                                    src={post.image}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        console.error(`[PostManager] Image failed to load: ${post.image}. Falling back to /hero-bg-final.png`);
                                                        target.onerror = null; // Prevent infinite loop
                                                        target.src = '/hero-bg-final.png';
                                                    }}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-neutral-800">
                                                    <ImageIcon size={16} />
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 align-top">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors">
                                                {post.title}
                                            </h3>
                                            {post.isDuplicate && (
                                                <span className="px-1.5 py-0.5 bg-yellow-400/10 border border-yellow-400/20 text-yellow-500 text-[8px] font-black uppercase tracking-widest rounded flex items-center gap-1">
                                                    <AlertTriangle size={8} /> DUPLICATE
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-neutral-500 font-mono tracking-wide">
                                            <span>{new Date(post.timestamp).toLocaleDateString()}</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-neutral-700" />
                                            <span className="truncate max-w-[200px]">{post.slug}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 align-top text-right pr-6">
                                        <div className="flex justify-end gap-2">
                                            {filter === 'PENDING' && (
                                                <>
                                                    <button
                                                        onClick={() => handleApprove([post.id!])}
                                                        title="Approve Transmission"
                                                        className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white border border-green-500/20 transition-all"
                                                    >
                                                        <Check size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDecline([post.id!])}
                                                        title="Decline Transmission"
                                                        className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 transition-all"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                onClick={() => handleEditClick(post)}
                                                title="Edit Post"
                                                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/10 hover:bg-purple-500 text-purple-500 hover:text-white border border-purple-500/20 transition-all"
                                            >
                                                <Edit2 size={14} />
                                            </button>
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
                                            <img
                                                src={post.image}
                                                alt=""
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    console.error(`[PostManager-Mobile] Image failed to load: ${post.image}. Falling back to /hero-bg-final.png`);
                                                    target.onerror = null;
                                                    target.src = '/hero-bg-final.png';
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex flex-col gap-1">
                                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${post.status === 'approved' ? 'bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20' : post.isPublished
                                                ? 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20'
                                                : 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-500 border-red-200 dark:border-red-500/20'
                                                }`}>
                                                {post.status === 'approved' ? 'SCHEDULED' : post.isPublished ? 'LIVE' : 'HIDDEN'}
                                            </span>
                                            {filter === 'PENDING' && (
                                                <div className="flex flex-col gap-1 border-l border-white/10 pl-2">
                                                    <span className="text-[8px] font-bold text-neutral-500 uppercase">
                                                        Source: {post.source || 'Unknown'} | Score: {post.relevanceScore || 0} | Tier {post.sourceTier || 3}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            {filter === 'PENDING' && (
                                                <>
                                                    <button onClick={() => handleApprove([post.id!])} className="text-green-500 hover:text-green-400"><Check size={16} /></button>
                                                    <button onClick={() => handleDecline([post.id!])} className="text-red-500 hover:text-red-400"><X size={16} /></button>
                                                </>
                                            )}
                                            <button
                                                onClick={() => handleEditClick(post)}
                                                className="text-purple-600 dark:text-purple-400 hover:text-purple-700"
                                                title="Edit Post"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight mb-2 line-clamp-2">
                                        {post.title}
                                    </h3>
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] text-slate-500 dark:text-neutral-500 font-mono">
                                            {new Date(post.timestamp).toLocaleDateString()}
                                        </p>
                                        {post.status === 'approved' && (
                                            <div className="flex flex-col items-end text-right gap-2">
                                                {(post.scheduledPostTime || (post as any).scheduled_post_time) ? (
                                                    <div>
                                                        <p className="text-[9px] font-black text-blue-400 uppercase leading-none">
                                                            {new Date(post.scheduledPostTime || (post as any).scheduled_post_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                        <p className="text-[8px] font-bold text-blue-400/60 uppercase mt-0.5">
                                                            {new Date(post.scheduledPostTime || (post as any).scheduled_post_time).toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' })}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="text-[9px] font-black text-red-500 uppercase flex items-center gap-1">
                                                        <AlertTriangle size={10} />
                                                        Pending Slot
                                                    </div>
                                                )}

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setSchedulingPostId(post.id!)}
                                                        className="text-[8px] font-black py-1 px-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded uppercase tracking-widest"
                                                    >
                                                        Change
                                                    </button>
                                                    <button
                                                        onClick={() => handleCancelApproval(post.id!)}
                                                        className="text-[8px] font-black py-1 px-2 text-neutral-500 hover:text-red-400 uppercase tracking-widest"
                                                    >
                                                        Revoke
                                                    </button>
                                                </div>

                                                {schedulingPostId === post.id && (
                                                    <div className="flex flex-col gap-1 w-full bg-blue-500/5 p-2 rounded-lg border border-blue-500/20 mt-2">
                                                        <div className="grid grid-cols-2 gap-1">
                                                            {[10, 14, 18, 21].map(h => (
                                                                <button
                                                                    key={h}
                                                                    onClick={() => {
                                                                        const sched = post.scheduledPostTime || (post as any).scheduled_post_time;
                                                                        const d = new Date(sched);
                                                                        d.setHours(h, 0, 0, 0);
                                                                        handleUpdateSchedule(post.id!, d);
                                                                    }}
                                                                    className="text-[8px] font-black py-1 px-2 hover:bg-blue-500 text-blue-400 hover:text-white rounded transition-colors uppercase"
                                                                >
                                                                    {h > 12 ? `${h - 12} PM` : h === 12 ? '12 PM' : `${h} AM`}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <input
                                                            type="datetime-local"
                                                            className="text-center text-[10px] font-bold bg-black/40 border border-white/10 rounded p-1.5 text-white outline-none focus:border-blue-500/50 mt-1"
                                                            onChange={(e) => {
                                                                if (e.target.value) handleUpdateSchedule(post.id!, new Date(e.target.value));
                                                            }}
                                                        />
                                                        <button
                                                            onClick={() => setSchedulingPostId(null)}
                                                            className="text-[8px] font-black text-red-400/70 hover:text-red-400 uppercase tracking-widest mt-1 py-1"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
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
                                            {post?.image && (
                                                <img
                                                    src={post.image}
                                                    className="w-full h-full object-cover"
                                                    alt=""
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        const fallbackUrl = '/hero-bg-final.png';
                                                        console.log('PostManager (Grid) Image Error:', target.src);

                                                        if (!target.src.endsWith(fallbackUrl)) {
                                                            console.log('Applying fallback:', fallbackUrl);
                                                            target.src = fallbackUrl;
                                                        }
                                                    }}
                                                />
                                            )}
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
            )
            }

            {
                showModal && (
                    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-4 sm:p-6">
                        <div className="absolute inset-0 bg-slate-900/60 dark:bg-black/90 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowModal(false)} />
                        <div className="relative bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] md:max-h-[85vh] animate-in slide-in-from-bottom-8 duration-300 overflow-hidden">

                            {/* Modal Header */}
                            <div className="p-4 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">
                                    Edit Post
                                </h3>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-400 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                                >
                                    <Plus size={20} className="rotate-45" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                                <div className="space-y-4">
                                    {/* 1. TITLE */}
                                    <div className="group">
                                        <label className="block text-[10px] font-bold text-slate-500 dark:text-neutral-500 uppercase tracking-widest mb-2 group-focus-within:text-purple-500 transition-colors">
                                            1. Title
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Transmission Title..."
                                            className="w-full bg-slate-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-3 text-slate-900 dark:text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none transition-all"
                                            value={title}
                                            onChange={(e) => {
                                                setTitle(e.target.value);
                                                setOverlayTag(e.target.value);
                                            }}
                                        />
                                    </div>

                                    {/* 2. CONTENT/BODY */}
                                    <div className="group">
                                        <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 group-focus-within:text-purple-500 transition-colors">
                                            2. Content / Body
                                        </label>
                                        <textarea
                                            placeholder="Enter transmission content..."
                                            className="w-full bg-slate-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-3 text-slate-900 dark:text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none h-40 resize-none transition-all"
                                            value={content}
                                            onChange={(e) => setContent(e.target.value)}
                                        />
                                    </div>

                                    {/* 3. IMAGE PREVIEW & CONTROLS */}
                                    <div className="space-y-4">
                                        <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-0 group-focus-within:text-purple-500 transition-colors">
                                            3. Image Preview & Controls
                                        </label>
                                        <div className="bg-slate-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl p-4 space-y-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    onClick={() => handleSearchImages(true)}
                                                    disabled={isSearchingImages || !title}
                                                    className="text-[10px] font-bold bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg transition-all shadow-lg flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                    {isSearchingImages ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                                    Regenerate Image
                                                </button>
                                                <label className="text-[10px] font-bold bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition-all shadow-lg flex items-center gap-1.5 cursor-pointer">
                                                    <Upload size={12} />
                                                    Upload
                                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onloadend = () => {
                                                                const result = reader.result as string;
                                                                setSearchedImages([result]);
                                                                setSelectedImageIndex(0);
                                                                setImageScale(1);
                                                                setImagePosition({ x: 0, y: 0 });
                                                                setProcessedImage(null);
                                                                setIsStageDirty(true);
                                                                setEditorMode('RAW');
                                                            };
                                                            reader.readAsDataURL(file);
                                                        }
                                                    }} />
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {searchedImages.length > 0 ? (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                                            {/* --- THE PRO EDITOR STAGE --- */}
                                            <div className="flex flex-col lg:flex-row gap-6">
                                                <div
                                                    ref={stageContainerRef}
                                                    onPointerMove={handleImagePointerMove}
                                                    onPointerUp={handleImagePointerUp}
                                                    className="flex-1 relative group/editor bg-slate-900 dark:bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/5 aspect-[4/5] flex items-center justify-center touch-none z-0"
                                                >
                                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(157,123,255,0.05)_0%,transparent_100%)] pointer-events-none" />

                                                    {/* Arrow Controls (Floating) - STRICT MODE: Hide if processed preview is active */}
                                                    {searchedImages.length > 1 && !isDragging && editorMode === 'RAW' && (
                                                        <>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    // Explicitly reset to RAW state
                                                                    setProcessedImage(null);
                                                                    setEditorMode('RAW');
                                                                    setIsStageDirty(true);
                                                                    // Safe index math
                                                                    setSelectedImageIndex(prev => {
                                                                        const p = prev ?? 0;
                                                                        const len = searchedImages.length;
                                                                        return (p - 1 + len) % len;
                                                                    });
                                                                }}
                                                                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-white text-white hover:text-black rounded-full backdrop-blur-md border border-white/10 transition-all z-20 group-hover/editor:translate-x-0 -translate-x-12 opacity-0 group-hover/editor:opacity-100"
                                                            >
                                                                <ChevronLeft size={20} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    // Explicitly reset to RAW state
                                                                    setProcessedImage(null);
                                                                    setEditorMode('RAW');
                                                                    setIsStageDirty(true);
                                                                    setSelectedImageIndex(prev => {
                                                                        const p = prev ?? 0;
                                                                        const len = searchedImages.length;
                                                                        return (p + 1) % len;
                                                                    });
                                                                }}
                                                                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-white text-white hover:text-black rounded-full backdrop-blur-md border border-white/10 transition-all z-20 group-hover/editor:translate-x-0 translate-x-12 opacity-0 group-hover/editor:opacity-100"
                                                            >
                                                                <ChevronRight size={20} />
                                                            </button>
                                                        </>
                                                    )}

                                                    {/* Stage Content */}
                                                    <div className="relative w-full h-full overflow-hidden bg-black">
                                                        {/* 1. Background Image Layer */}
                                                        {/* 1. Background Image Layer */}
                                                        <div
                                                            className="absolute inset-0 cursor-move will-change-transform z-0"
                                                            onPointerDown={(e) => handleImagePointerDown(e, 'image')}
                                                            onPointerMove={handleImagePointerMove} // redundant but safe
                                                            onPointerUp={handleImagePointerUp}
                                                            style={{
                                                                // PREVENT DOUBLE TRANSFORM: 
                                                                // If in PROCESSED mode, the backend image has the crop baked in. 
                                                                // We must disable CSS transforms.
                                                                transform: (editorMode === 'PROCESSED')
                                                                    ? 'none'
                                                                    : `scale(${imageScale}) translate(${imagePosition.x * 100}%, ${imagePosition.y * 100}%)`,
                                                                transition: isDragging && dragTarget === 'image' ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)',
                                                                pointerEvents: editorMode === 'PROCESSED' ? 'none' : 'auto'
                                                            }}
                                                        >
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={editorMode === 'PROCESSED' && processedImage
                                                                    ? processedImage
                                                                    : (searchedImages.length > 0 && selectedImageIndex !== null)
                                                                        ? searchedImages[selectedImageIndex]
                                                                        : customImagePreview
                                                                }
                                                                crossOrigin="anonymous"
                                                                alt=""
                                                                className="w-full h-full object-cover pointer-events-none select-none"
                                                                onError={(e) => {
                                                                    const target = e.target as HTMLImageElement;
                                                                    const fallbackUrl = '/hero-bg-final.png';
                                                                    console.log('PostManager Image Error:', target.src);

                                                                    // Check if already in fallback to prevent loop
                                                                    if (!target.src.endsWith(fallbackUrl)) {
                                                                        console.log('Applying fallback:', fallbackUrl);
                                                                        target.src = fallbackUrl;
                                                                    }
                                                                }}
                                                            />
                                                        </div>

                                                        {/* 2. Gradient Layer (Visual Only) - Hide if processed */}
                                                        {isApplyGradient && editorMode === 'RAW' && (
                                                            <div
                                                                className={`absolute inset-x-0 h-1/2 pointer-events-none transition-all duration-500 ${gradientPosition === 'top' ? 'top-0 bg-gradient-to-b from-black/95 via-black/40 to-transparent' : 'bottom-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent'}`}
                                                            />
                                                        )}

                                                        {/* 3. Text Manipulation Proxy Layer - Hide if processed to avoid ghosting */}
                                                        {/* 3. Text Manipulation Proxy Layer - Hide if processed to avoid ghosting */}
                                                        {/* 3. Text Manipulation Proxy Layer - Hide if processed to avoid ghosting. Only render if content exists. */}
                                                        {/* 3. Text Manipulation Proxy Layer - Authoritative: Render if enabled and content exists. */}
                                                        {isApplyText && overlayTag && overlayTag.trim().length > 0 && (
                                                            <div className="absolute inset-0 pointer-events-none z-10">
                                                                <div
                                                                    className={`absolute pointer-events-auto cursor-grab active:cursor-grabbing select-none group/text transition-all ${isTextLocked ? 'ring-0' : 'ring-1 ring-white/20 hover:ring-purple-500/50'}`}
                                                                    onPointerDown={(e) => handleImagePointerDown(e, 'text')}
                                                                    style={{
                                                                        left: 0,
                                                                        top: 0,
                                                                        transformOrigin: 'top center',
                                                                        // STRICT PARITY: Horizontal center is always WIDTH / 2. Vertical is top of block (layoutMetadata.y or calculated region start).
                                                                        transform: `translate(${(WIDTH / 2) * containerScale}px, ${(layoutMetadata?.y ?? (gradientPosition === 'top' ? 202.5 - (135 * textScale / 2) : 1147.5 - (135 * textScale / 2))) * containerScale}px) scale(${containerScale}) translate(-50%, 0)`,
                                                                        transition: isDragging && dragTarget === 'text' ? 'none' : 'transform 0.4s cubic-bezier(0.2, 0, 0, 1)'
                                                                    }}
                                                                >
                                                                    <div className="text-center drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]">
                                                                        <div
                                                                            ref={textContainerRef}
                                                                            className={`text-white font-[900] uppercase tracking-tighter flex flex-col items-center justify-center break-words whitespace-pre-wrap transition-all duration-300 ${editorMode === 'PROCESSED' ? 'opacity-0' : 'opacity-100'}`}
                                                                            style={{
                                                                                fontFamily: 'Outfit, var(--font-outfit), sans-serif',
                                                                                fontSize: layoutMetadata?.fontSize ? `${layoutMetadata.fontSize * containerScale}px` : `${135 * textScale * containerScale}px`,
                                                                                lineHeight: layoutMetadata?.lineHeight ? `${layoutMetadata.lineHeight * containerScale}px` : '0.92',
                                                                                width: `${WIDTH * containerScale}px`,
                                                                                maxWidth: `${WIDTH * containerScale}px`,
                                                                                padding: `0 ${54 * containerScale}px`,
                                                                                textAlign: 'center'
                                                                            }}
                                                                        >
                                                                            {layoutMetadata?.lines ? (
                                                                                layoutMetadata.lines.map((line, lIdx) => (
                                                                                    <div key={lIdx} className="w-full flex justify-center gap-x-[0.2em]">
                                                                                        {line.split(/\s+/).filter(Boolean).map((word, wIdx) => {
                                                                                            // Calculate global word index
                                                                                            const wordsBeforeCount = layoutMetadata.lines.slice(0, lIdx).join(' ').split(/\s+/).filter(Boolean).length;
                                                                                            const globalIdx = wordsBeforeCount + wIdx;
                                                                                            return (
                                                                                                <span
                                                                                                    key={wIdx}
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        const newIndices = purpleWordIndices.includes(globalIdx)
                                                                                                            ? purpleWordIndices.filter(i => i !== globalIdx)
                                                                                                            : [...purpleWordIndices, globalIdx].sort((a, b) => a - b);
                                                                                                        setPurpleWordIndices(newIndices);
                                                                                                        setIsStageDirty(true);
                                                                                                        handleApplyText(undefined, undefined, undefined, undefined, newIndices);
                                                                                                    }}
                                                                                                    className={`${purpleWordIndices.includes(globalIdx) ? 'text-purple-400' : 'text-white'} cursor-pointer hover:opacity-80`}
                                                                                                >
                                                                                                    {word}
                                                                                                </span>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                ))
                                                                            ) : (
                                                                                // RAW FALLBACK (Authoritative Override Visual Title Only)
                                                                                `${(overlayTag || '')}`.trim().split(/\s+/).filter(Boolean).map((word, idx) => (
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
                                                                                        className={`${purpleWordIndices.includes(idx) ? 'text-purple-400' : 'text-white'} ${isTextLocked ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                                                                    >
                                                                                        {word}
                                                                                    </span>
                                                                                ))
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {/* LOCKED: Manual drag disabled to enforce regional centering */}
                                                            </div>
                                                        )}

                                                        {/* 4. Watermark Layer */}
                                                        {isApplyWatermark && (
                                                            <div className="absolute inset-0 pointer-events-none">
                                                                <div
                                                                    className={`absolute cursor-move select-none group/watermark transition-all ${isWatermarkLocked ? 'pointer-events-auto' : 'pointer-events-auto'}`}
                                                                    onPointerDown={(e) => handleImagePointerDown(e, 'watermark')}
                                                                    style={{
                                                                        left: (watermarkPosition?.x ?? WIDTH / 2) * containerScale,
                                                                        top: (watermarkPosition?.y ?? HEIGHT - 40) * containerScale,
                                                                        transform: `translate(-50%, -50%) scale(1)`,
                                                                    }}
                                                                >
                                                                    <div className={`text-white/70 text-[10px] sm:text-xs font-bold tracking-wider drop-shadow-md bg-black/20 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/10 ${isWatermarkLocked ? 'ring-0' : 'hover:bg-white/10 hover:border-white/30'}`}>
                                                                        @KUMOLABANIME
                                                                    </div>
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
                                                    {/* Text Tools */}
                                                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-3">
                                                        <div className="text-[9px] font-black text-neutral-500 uppercase tracking-widest flex justify-between items-center">
                                                            <span>Text Size</span>
                                                            <span className="font-mono text-white/50">{Math.round(textScale * 100)}%</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => handleZoom(-0.1, 'text')} className="flex-1 py-1 px-3 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10">-</button>
                                                            <button onClick={() => handleZoom(0.1, 'text')} className="flex-1 py-1 px-3 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10">+</button>
                                                            <button
                                                                onClick={() => setIsTextLocked(!isTextLocked)}
                                                                className={`p-2 rounded-lg border transition-all ${isTextLocked ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-white/5 text-neutral-500 border-white/10'}`}
                                                            >
                                                                {isTextLocked ? <Lock size={14} /> : <Unlock size={14} />}
                                                            </button>
                                                        </div>

                                                        <div className="flex flex-col gap-2 pt-2">
                                                            <button
                                                                onClick={() => {
                                                                    const newVal = !isApplyText;
                                                                    setIsApplyText(newVal);
                                                                    if (!newVal) setLayoutMetadata(null);
                                                                    handleApplyText(undefined, undefined, newVal);
                                                                }}
                                                                className={`w-full py-2 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-between transition-all ${isApplyText ? 'bg-purple-600 text-white shadow-lg' : 'bg-white/5 text-neutral-500'}`}
                                                            >
                                                                <span>Text</span>
                                                                <span className="text-[8px]">{isApplyText ? 'ON' : 'OFF'}</span>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const newVal = !isApplyGradient;
                                                                    setIsApplyGradient(newVal);
                                                                    handleApplyText(undefined, undefined, undefined, newVal);
                                                                }}
                                                                className={`w-full py-2 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-between transition-all ${isApplyGradient ? 'bg-purple-600 text-white shadow-lg' : 'bg-white/5 text-neutral-500'}`}
                                                            >
                                                                <span>Gradient</span>
                                                                <span className="text-[8px]">{isApplyGradient ? 'ON' : 'OFF'}</span>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const newVal = !isApplyWatermark;
                                                                    setIsApplyWatermark(newVal);
                                                                    handleApplyText(undefined, undefined, undefined, undefined, undefined, undefined, newVal);
                                                                }}
                                                                className={`w-full py-2 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-between transition-all ${isApplyWatermark ? 'bg-purple-600 text-white shadow-lg' : 'bg-white/5 text-neutral-500'}`}
                                                            >
                                                                <span>Watermark</span>
                                                                <span className="text-[8px]">{isApplyWatermark ? 'ON' : 'OFF'}</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <button onClick={handleResetAll} className="w-full py-2 text-[10px] font-bold text-neutral-500 hover:text-white hover:bg-white/5 border border-white/10 rounded-xl transition-all flex items-center justify-center gap-2">
                                                        <RotateCcw size={14} /> REVERT
                                                    </button>
                                                </div>
                                            </div>

                                            {/* --- PURPLE SIGNAL TARGETING --- */}
                                            <div className="bg-slate-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-5 h-5 rounded-full bg-purple-600/20 flex items-center justify-center">
                                                        <Sparkles size={12} className="text-purple-400" />
                                                    </div>
                                                    <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">🟣 Purple Signal Targeting</span>
                                                </div>
                                                <p className="text-[9px] text-neutral-500 uppercase tracking-widest font-mono">Select which words to highlight in purple:</p>

                                                <div className="flex flex-wrap gap-2 p-4 bg-black/40 rounded-xl border border-white/5">
                                                    {title.split(/\s+/).filter(Boolean).map((word, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={() => {
                                                                const newIndices = purpleWordIndices.includes(idx)
                                                                    ? purpleWordIndices.filter(i => i !== idx)
                                                                    : [...purpleWordIndices, idx].sort((a, b) => a - b);
                                                                setPurpleWordIndices(newIndices);
                                                                setIsStageDirty(true);
                                                                if (editorMode === 'PROCESSED') {
                                                                    handleApplyText(undefined, undefined, undefined, undefined, newIndices);
                                                                }
                                                            }}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all ${purpleWordIndices.includes(idx) ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50' : 'bg-white/5 text-neutral-500 hover:text-white'}`}
                                                        >
                                                            <div className={`w-2 h-2 rounded-full border ${purpleWordIndices.includes(idx) ? 'bg-white border-white' : 'border-neutral-700'}`} />
                                                            {word}
                                                        </button>
                                                    ))}
                                                </div>

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setPurpleWordIndices([]);
                                                            if (editorMode === 'PROCESSED') handleApplyText(undefined, undefined, undefined, undefined, []);
                                                        }}
                                                        className="text-[9px] font-black uppercase text-red-400 hover:text-white transition-colors px-2"
                                                    >
                                                        Remove All
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Preview Section */}
                                            <div className="mt-8 pt-8 border-t border-white/5">
                                                <button
                                                    onClick={async () => {
                                                        const result = await handleCommitToPreview();
                                                        if (result) setShowExpandedPreview(true);
                                                    }}
                                                    disabled={isProcessingImage}
                                                    className="w-full py-4 bg-neutral-900 border border-white/10 text-white font-black uppercase tracking-[0.2em] rounded-2xl transition-all hover:bg-neutral-800 active:scale-[0.98] flex items-center justify-center gap-3"
                                                >
                                                    {isProcessingImage ? <Loader2 className="animate-spin" size={18} /> : <Eye size={18} />}
                                                    Show Preview
                                                </button>
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

                            </div>

                            {/* Action Footer */}
                            <div className="p-5 border-t border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex gap-4">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleSavePost(true)}
                                    disabled={isGenerating || isApplyingEffect}
                                    className="flex-[2] py-4 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-purple-500/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                                    Save Changes
                                </button>
                            </div>

                            {/* PREVIEW POST CARD (Result) */}
                            {
                                previewPost && (
                                    <div className="p-5 border-t border-white/10 bg-black/40 animate-in fade-in slide-in-from-bottom-4">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-[10px] font-black text-green-400 uppercase tracking-widest">
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
                                                    <p className="text-sm text-neutral-400 leading-relaxed line-clamp-4">{previewPost.content}</p>
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

                                        <div className="mt-6 flex justify-end gap-3">
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
                                    </div>
                                )
                            }


                        </div>
                    </div>
                )} a

            {/* SCHEDULER LOGS MODAL */}
            {
                showLogsModal && (
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
                                            {schedulerLogs.map((log: any) => (
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
                )
            }

            <div className="pt-12 pb-8 flex justify-between items-center text-[10px] text-neutral-600 font-mono uppercase tracking-widest mt-auto border-t border-white/5">
                <span>KumoLab Admin OS v2.2.5 (UPDATED: 01:00 AM EST)</span>
                <span>System Status: ONLINE</span>
            </div>
        </div>
    );
}
