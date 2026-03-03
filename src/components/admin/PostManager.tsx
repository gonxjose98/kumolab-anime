'use client';

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Edit2, Plus, Zap, Newspaper, Image as ImageIcon, Loader2, ChevronLeft, ChevronRight, Trash2, Eye, EyeOff, Twitter, Instagram, Facebook, Share2, CheckCircle2, XCircle, Lock, Unlock, RotateCcw, Anchor, Move, MousePointer2, Type, Maximize2, ChevronRightCircle, ChevronLeftCircle, Terminal, RotateCw, Upload, Sparkles, Send, Check, X, Calendar, AlertTriangle } from 'lucide-react';

import { BlogPost } from '@/types';

interface PostManagerProps {
    initialPosts: BlogPost[];
}

/** Detect if a post has embedded video (YouTube or X/Twitter) */
function getPostVideoInfo(post: BlogPost): { type: 'youtube'; id: string } | { type: 'twitter'; id: string } | null {
    if (post.youtube_video_id) {
        return { type: 'youtube', id: post.youtube_video_id };
    }
    const match = post.content?.match(/Tweet ID:\s*(\d+)/);
    if (match) {
        return { type: 'twitter', id: match[1] };
    }
    return null;
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
        
        // Derive status from multiple sources
        let derivedStatus = (p as any).status ?? p.status;
        const isPublished = (p as any).is_published ?? p.isPublished;
        
        // If no valid status, derive from is_published
        if (!derivedStatus || !['pending', 'approved', 'published', 'declined'].includes(derivedStatus)) {
            if (isPublished === true) {
                derivedStatus = 'published';
            } else {
                // New posts (X/YouTube added via URL) are pending
                derivedStatus = 'pending';
            }
        }

        return {
            ...p,
            isPublished: isPublished,
            status: derivedStatus,
            scheduledPostTime: scheduledTime,
            socialIds: (p as any).social_ids ?? (p.socialIds || {}),
            sourceTier,
            relevanceScore,
            scrapedAt,
            source
        };
    });
    
    // DEBUG: Log normalized posts
    console.log('[PostManager] Normalized posts:', normalizedPosts.slice(0, 5).map((p: any) => ({ 
        id: p.id?.slice(0,8), 
        title: p.title?.substring(0, 30),
        status: p.status, 
        isPublished: p.isPublished 
    })));

    console.log('[PostManager] Normalized posts sample:', normalizedPosts.slice(0, 3).map(p => ({ 
        title: p.title, 
        status: p.status, 
        isPublished: p.isPublished,
        type: p.type,
        source: p.source 
    })));


    const [posts, setPosts] = useState<BlogPost[]>(normalizedPosts);
    const [filter, setFilter] = useState<'ALL' | 'LIVE' | 'HIDDEN' | 'PENDING' | 'APPROVED'>('PENDING'); // Default to PENDING for admin review
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'tier'>('newest'); // NEW: Sort filter
    const [isGenerating, setIsGenerating] = useState(false);
    const [showModal, setShowModal] = useState(false);

    // Modal State
    const [genType, setGenType] = useState<'INTEL' | 'TRENDING' | 'CUSTOM' | 'CONFIRMATION_ALERT' | 'TRAILER' | null>(null);
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
    const [verticalOffset, setVerticalOffset] = useState(0); // NEW: Manual vertical adjustment in pixels
    const [isTextLocked, setIsTextLocked] = useState(false);
    const [gradientPosition, setGradientPosition] = useState<'top' | 'bottom'>('bottom');
    const [purpleWordIndices, setPurpleWordIndices] = useState<number[]>([]);
    const [purpleCursorIndex, setPurpleCursorIndex] = useState(0);
    const textContainerRef = useRef<HTMLDivElement>(null);

    // Watermark State
    const [isApplyWatermark, setIsApplyWatermark] = useState(true);
    const [watermarkPosition, setWatermarkPosition] = useState<{ x: number, y: number } | null>(null);
    const [isWatermarkLocked, setIsWatermarkLocked] = useState(false);

    // Website Publication State
    const [isWebsitePublished, setIsWebsitePublished] = useState(false);

    // Video Preview State
    const [videoPreviewPost, setVideoPreviewPost] = useState<BlogPost | null>(null);
    const twitterWidgetRef = useRef<HTMLDivElement>(null);

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
                try {
                    const rect = node.getBoundingClientRect();
                    const width = rect.width;
                    const newScale = width / WIDTH; // Use WIDTH constant (1080)
                    const finalScale = newScale > 0 ? newScale : 1;
                    console.log('[DEBUG] Container scale updated:', finalScale, 'width:', width);
                    setContainerScale(finalScale);
                } catch (err) {
                    console.error('[DEBUG] Error calculating container scale:', err);
                    setContainerScale(1); // Fallback to 1
                }
            };
            
            // Initial calculation with slight delay to ensure layout is complete
            setTimeout(updateScale, 0);
            
            const observer = new ResizeObserver(() => {
                updateScale();
            });
            observer.observe(node);
            
            // Cleanup
            return () => {
                observer.disconnect();
            };
        }
    }, []);

    useEffect(() => {
        console.log('[PostManager] Admin OS v2.2.5 Active', {
            totalPosts: posts.length,
            approved: posts.filter(p => p.status === 'approved').length
        });
        (window as any).debugPosts = posts;
    }, [posts]);

    // Load Twitter widget when video preview opens
    useEffect(() => {
        if (videoPreviewPost) {
            const videoInfo = getPostVideoInfo(videoPreviewPost);
            if (videoInfo?.type === 'twitter') {
                if (!document.getElementById('twitter-widget-script')) {
                    const script = document.createElement('script');
                    script.id = 'twitter-widget-script';
                    script.src = 'https://platform.twitter.com/widgets.js';
                    script.async = true;
                    script.charset = 'utf-8';
                    document.body.appendChild(script);
                    script.onload = () => {
                        if ((window as any).twttr && twitterWidgetRef.current) {
                            (window as any).twttr.widgets.load(twitterWidgetRef.current);
                        }
                    };
                } else if ((window as any).twttr && twitterWidgetRef.current) {
                    setTimeout(() => {
                        (window as any).twttr.widgets.load(twitterWidgetRef.current);
                    }, 100);
                }
            }
        }
    }, [videoPreviewPost]);

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

    // Scan Sources Modal State
    const [showScanModal, setShowScanModal] = useState(false);
    const [scanSources, setScanSources] = useState({
        youtube: true,
        twitter: true,
        rss: true
    });
    const [scanResults, setScanResults] = useState<any>(null);

    // AI Assistant State
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiChatHistory, setAiChatHistory] = useState<any[]>([]);
    const [showAiPromptModal, setShowAiPromptModal] = useState(false);
    const [aiGeneratedDraft, setAiGeneratedDraft] = useState<any>(null);
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
            console.log('[Decline] Sending decline request:', postIds);
            const resp = await fetch('/api/admin/decline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postIds, reason })
            });
            
            const result = await resp.json();
            console.log('[Decline] API response:', result);
            
            if (result.success) {
                // Check if all were successful
                const failed = result.results?.filter((r: any) => !r.success) || [];
                const succeeded = result.results?.filter((r: any) => r.success) || [];
                
                if (failed.length > 0) {
                    console.error('[Decline] Some posts failed:', failed);
                    alert(`Decline partial failure:\n${failed.map((f: any) => `${f.id}: ${f.error}`).join('\n')}`);
                }
                
                if (succeeded.length > 0) {
                    // Remove successfully declined posts from local state
                    const successIds = succeeded.map((s: any) => s.id);
                    setPosts(prev => prev.filter(p => !successIds.includes(p.id!)));
                    console.log('[Decline] Posts declined successfully:', successIds);
                }
                
                setSelectedIds([]);
            } else {
                console.error('[Decline] API error:', result);
                alert('Decline failed: ' + (result.error || 'Unknown error'));
            }
        } catch (e: any) {
            console.error('[Decline] Exception:', e);
            alert('Decline error: ' + e.message);
        } finally {
            setIsPublishing(false);
        }
    };

    const filteredPosts = posts.filter((post) => {
        // Derive effective status from multiple sources
        const effectiveStatus = post.status || (post.isPublished ? 'published' : 'pending');
        
        if (filter === 'ALL') return true;
        if (filter === 'LIVE') return post.isPublished === true;
        if (filter === 'HIDDEN') return post.isPublished === false && effectiveStatus !== 'pending' && effectiveStatus !== 'approved';
        if (filter === 'PENDING') return effectiveStatus === 'pending' || (post.isPublished === false && !effectiveStatus);
        if (filter === 'APPROVED') return effectiveStatus === 'approved';
        return true;
    }).sort((a, b) => {
        // NEW: Sort by user selection
        if (sortBy === 'newest') {
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        }
        if (sortBy === 'oldest') {
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        }
        if (sortBy === 'tier') {
            // Highest tier first (Tier 1 > Tier 2 > Tier 3)
            if ((a.sourceTier || 3) !== (b.sourceTier || 3)) {
                return (a.sourceTier || 3) - (b.sourceTier || 3);
            }
            // If same tier, sort by score
            return (b.relevanceScore || 0) - (a.relevanceScore || 0);
        }
        // Default fallback
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const pendingCount = posts.filter(p => p.status === 'pending').length;
    const approvedCount = posts.filter(p => p.status === 'approved').length;

    const handleGenerateClick = (type?: 'INTEL' | 'TRENDING' | 'CUSTOM' | 'CONFIRMATION_ALERT') => {
        setEditingPostId(null);
        setGenType(type || null);
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
        
        // Reset website publication state for new posts (default to not published)
        setIsWebsitePublished(false);
        
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
        
        // FIX: Use title as fallback for overlayTag if headline is empty
        // This ensures text is always visible by default when editing
        const headlineText = post.headline || post.title || '';
        setOverlayTag(headlineText);
        console.log('[DEBUG] Edit modal opening - overlayTag set to:', headlineText);
        
        setCustomImage(null);

        // SOURCE IMAGE PRIORITIZATION: Use background_image for raw editing
        const sourceUrl = post.background_image || post.image || '';
        setCustomImagePreview(sourceUrl);

        // Load existing image into the "Pro Editor" so it's visible immediately
        if (sourceUrl) {
            setSearchedImages([sourceUrl]);
            setSelectedImageIndex(0);
        } else {
            setSearchedImages([]);
            setSelectedImageIndex(null);
        }

        setPreviewPost(null);
        setProcessedImage(null);
        setSearchPage(1);

        // LOAD IMAGE SETTINGS
        const settings = post.image_settings || {};
        setImageScale(settings.imageScale || 1);
        setImagePosition(settings.imagePosition || { x: 0, y: 0 });
        setTextScale(settings.textScale || 1);
        setTextPosition(settings.textPosition || { x: WIDTH / 2, y: 1113.75 });
        setVerticalOffset(settings.verticalOffset || 0); // NEW: Load vertical offset
        
        // FIX: Default isApplyText to true if there's a headline or title
        const shouldApplyText = settings.isApplyText ?? !!(post.headline || post.title);
        setIsApplyText(shouldApplyText);
        console.log('[DEBUG] isApplyText set to:', shouldApplyText);
        
        setIsApplyGradient(settings.isApplyGradient ?? !!(post.headline || post.title));
        setIsApplyWatermark(settings.isApplyWatermark ?? true);
        
        // Load website publication status
        setIsWebsitePublished(post.is_published ?? false);
        setPurpleWordIndices(settings.purpleWordIndices || []);
        setGradientPosition(settings.gradientPosition || 'bottom');

        setEditorMode('RAW');
        setIsImageLocked(false);
        setIsTextLocked(false);
        setPurpleCursorIndex(0);
        setShowExpandedPreview(false);
        setWatermarkPosition(null);
        setIsWatermarkLocked(false);
        
        // FIX: Reset layoutMetadata to ensure fresh text positioning calculation
        setLayoutMetadata(null);
        
        setShowModal(true);
        
        console.log('[DEBUG] Modal opened - Text should be visible:', {
            overlayTag: headlineText,
            isApplyText: shouldApplyText,
            hasHeadline: !!post.headline,
            hasTitle: !!post.title
        });
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
            if (data.success && data.images && data.images.length > 0) {
                if (reset) {
                    setSearchedImages(data.images);
                    setSelectedImageIndex(0);
                    setIsStageDirty(true);
                } else {
                    setSearchedImages(prev => [...new Set([...prev, ...data.images])]);
                }
                setSearchPage(nextPage);
            } else {
                alert('Couldn\'t find a better image. Keeping current selection.');
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

    const handleApplyText = async (manualScale?: number, manualPos?: { x: number, y: number }, forcedApplyText?: boolean, forcedApplyGradient?: boolean, manualPurpleIndices?: number[], manualGradientPos?: 'top' | 'bottom', forcedApplyWatermark?: boolean, manualTextScale?: number, manualVerticalOffset?: number): Promise<string | null> => {
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
                    applyText: forcedApplyText ?? isApplyText,
                    applyGradient: forcedApplyGradient ?? isApplyGradient,
                    textPos: textPosition, // Now always non-null
                    textScale: manualTextScale ?? textScale,
                    gradientPos: manualGradientPos ?? gradientPosition,
                    purpleIndex: manualPurpleIndices ?? purpleWordIndices,
                    applyWatermark: forcedApplyWatermark ?? isApplyWatermark,
                    watermarkPosition,
                    disableAutoScaling: false, // ALLOW ENGINE TO SCALE
                    verticalOffset: manualVerticalOffset ?? verticalOffset // NEW: Pass vertical offset
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
                }
                // DO NOT TRANSITION TO PROCESSED MODE IN THE MAIN EDITOR
                // setEditorMode('PROCESSED'); 
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
        } else if (dragTarget === 'text') {
            // Allow vertical shifting of the text block for better framing
            setLayoutMetadata(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    y: prev.y + deltaY
                };
            });
            setIsStageDirty(true);
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
            const newScale = Math.max(0.1, Math.min(5, imageScale + delta));
            setImageScale(newScale);
            setIsStageDirty(true);
        } else {
            // HARD CONSTRAINT: Text scale cannot exceed zone boundaries
            // Calculate max scale based on current text content and zone height
            const zoneHeight = HEIGHT * 0.35; // 35% zone
            const lineHeightFactor = 0.88;
            const words = (overlayTag || '').trim().split(/\s+/).filter(Boolean);
            // Estimate lines needed at current scale
            const charsPerLine = 25; // Approximate at base scale
            const estimatedLines = Math.max(2, Math.ceil(words.length / 4));
            const currentFontSize = 120 * textScale; // Base 120px
            const textHeight = estimatedLines * currentFontSize * lineHeightFactor;
            
            // Only allow zoom if it won't overflow zone (with 5% buffer)
            const proposedNewScale = textScale + delta;
            const proposedTextHeight = estimatedLines * (120 * proposedNewScale) * lineHeightFactor;
            
            if (proposedTextHeight <= zoneHeight * 0.95 || delta < 0) {
                const newScale = Math.max(0.5, Math.min(3, proposedNewScale)); // Constrain between 0.5x and 3x
                setTextScale(newScale);
                setIsStageDirty(true);
            } else {
                console.log('[DEBUG] Text zoom blocked: would exceed zone height');
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
        setVerticalOffset(0); // Reset vertical offset
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
            console.log('[DEBUG] Text toggle clicked, new value:', newVal);
            setIsApplyText(newVal);
            
            // FIX: When turning text ON, ensure we have layoutMetadata for positioning
            // When turning text OFF, clear layoutMetadata
            if (!newVal) {
                setLayoutMetadata(null);
            } else if (newVal && !layoutMetadata && overlayTag.trim().length > 0) {
                // If turning text on and no layout, trigger text application
                console.log('[DEBUG] Text turned ON, triggering handleApplyText');
                handleApplyText();
            }
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

        // USE EXISTING PROCESSED IMAGE: If user clicked "Show Preview", we already have the processed image.
        // Only regenerate if we don't have a processed image yet.
        let finalImageToSave: string | null = processedImage;

        const imageUrl = (searchedImages.length > 0 && selectedImageIndex !== null)
            ? searchedImages[selectedImageIndex]
            : customImagePreview;

        if (!finalImageToSave && imageUrl) {
            // No processed image yet - generate it now
            console.log(`[Admin] No processed image exists, generating... (Text: ${isApplyText ? 'ON' : 'OFF'})`);
            finalImageToSave = await handleApplyText(undefined, undefined, isApplyText, undefined, undefined, undefined, true);
            console.log(`[Admin] Image generation result:`, finalImageToSave ? `Base64 length: ${finalImageToSave.length}` : 'NULL');
        } else if (finalImageToSave) {
            console.log(`[Admin] Using existing processed image, length: ${finalImageToSave.length}`);
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
            console.log(`[Admin] Target image string:`, targetImageString ? `Length: ${targetImageString.length}, starts with: ${targetImageString.substring(0, 50)}...` : 'NULL');

            if (targetImageString && targetImageString.startsWith('data:')) {
                console.log(`[Admin] Converting base64 to blob...`);
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
                console.log(`[Admin] Blob created, size: ${blob.size} bytes`);
            } else if (customImage && (genType === null || !isApplyText)) {
                // ONLY fall back to raw custom image if we are NOT applying text
                // or if it's a simple Community post.
                imageFileToUpload = customImage;
                imageFileName = customImage.name;
            } else {
                // Check if this is a video post (no image needed)
                const isVideoPost = content?.match(/Tweet ID:\s*(\d+)/) || (editingPostId && posts.find(p => p.id === editingPostId)?.youtube_video_id);
                if (!isVideoPost) {
                    console.error('[Admin] Save failed: No valid processed image');
                    alert('ERROR: No processed image available. Click "Show Preview" first to generate the image, then save.');
                    setIsGenerating(false);
                    return;
                }
                console.log('[Admin] Video post detected — saving without image.');
            }

            const formData = new FormData();
            formData.append('title', finalTitle);
            formData.append('content', content || `Transmission for ${finalTitle}.`);
            formData.append('type', genType === 'TRENDING' ? 'TRENDING' : genType === 'INTEL' ? 'INTEL' : genType === 'CONFIRMATION_ALERT' ? 'CONFIRMATION_ALERT' : genType === 'TRAILER' ? 'TRAILER' : 'COMMUNITY');
            formData.append('headline', (overlayTag || 'FEATURED').toUpperCase());
            formData.append('isWebsitePublished', isWebsitePublished ? 'true' : 'false');

            if (imageFileToUpload) {
                formData.append('image', imageFileToUpload, imageFileName);
                formData.append('skipProcessing', 'true');
            } else if (editingPostId) {
                // Editing an existing post — if no new image, that's OK (video posts have no image, or keeping existing)
                console.log('[Admin] Editing post without new image — preserving existing.');
            } else {
                // New post — check if video post (no image needed)
                const isVideoPost = content?.match(/Tweet ID:\s*(\d+)/);
                if (!isVideoPost) {
                    alert('Visual asset is required for new transmissions.');
                    setIsGenerating(false);
                    return;
                }
            }

            if (editingPostId) {
                formData.append('postId', editingPostId);
            }

            // PERSIST LOGIC: Save the raw ingredients for the next edit session
            const imageSettings = {
                textScale,
                textPosition,
                verticalOffset, // NEW: Save vertical offset
                isApplyText,
                isApplyGradient,
                isApplyWatermark,
                purpleWordIndices,
                gradientPosition,
                imageScale,
                imagePosition
            };
            formData.append('imageSettings', JSON.stringify(imageSettings));

            // Ensure we save the original anime image as the background source
            const backgroundImageUrl = (searchedImages.length > 0 && selectedImageIndex !== null)
                ? searchedImages[selectedImageIndex]
                : customImagePreview;

            if (backgroundImageUrl) {
                formData.append('background_image', backgroundImageUrl);
            }

            const response = await fetch('/api/admin/custom-post', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            console.log(`[Admin] Save response:`, data.success ? 'SUCCESS' : 'FAILED', data.post ? `Post image: ${data.post.image?.substring(0, 100)}...` : 'No post data');
            if (data.success && data.post) {
                if (editingPostId) {
                    console.log(`[Admin] Updating post ${editingPostId} in local state`);
                    setPosts(current => current.map(p => p.id === editingPostId ? data.post : p));
                } else {
                    setPosts(current => [data.post, ...current]);
                }

                if (autoClose) {
                    setShowModal(false);
                    setPreviewPost(null);
                    // Smart filter switching: stay on current view for edits, switch for new posts
                    if (!editingPostId) {
                        // New post - switch to appropriate filter
                        setFilter(genType === 'CONFIRMATION_ALERT' ? 'LIVE' : 'PENDING');
                    }
                    // For edits, stay on current filter so user sees the updated post
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
            // FIX: Don't switch filter on edit - stay on current view
            // Only new posts should potentially switch filters
            if (!editingPostId) {
                setFilter(genType === 'CONFIRMATION_ALERT' ? 'LIVE' : 'HIDDEN');
            }
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
                    disableAutoScaling: false, // ALLOW ENGINE TO SCALE
                    verticalOffset // NEW: Include vertical offset
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
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
                <div className="space-y-1">
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase" style={{ fontFamily: 'var(--font-display)', background: 'linear-gradient(135deg, #00d4ff 0%, #7b61ff 40%, #ff3cac 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Mission Control
                    </h2>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                        Intelligence System v2.0
                    </p>
                </div>

                {/* Filters */}
                <div className="flex p-1 rounded-xl overflow-x-auto" style={{ background: 'rgba(12,12,24,0.5)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
                    {(['PENDING', 'APPROVED', 'LIVE', 'HIDDEN', 'ALL'] as const).map((f) => {
                        const tabColors: Record<string, string> = { PENDING: '#ff3cac', APPROVED: '#00d4ff', LIVE: '#00ff88', HIDDEN: '#7b61ff', ALL: '#7b61ff' };
                        const c = tabColors[f];
                        return (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className="relative px-3 md:px-4 py-2 text-[9px] md:text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center gap-1.5 whitespace-nowrap"
                                style={{
                                    color: filter === f ? '#fff' : 'var(--text-muted)',
                                    background: filter === f ? `${c}18` : 'transparent',
                                    border: filter === f ? `1px solid ${c}35` : '1px solid transparent',
                                    fontFamily: 'var(--font-display)',
                                    boxShadow: filter === f ? `0 4px 15px ${c}15` : 'none',
                                }}
                            >
                                <span>{f}</span>
                                {f === 'PENDING' && pendingCount > 0 && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black" style={{ background: filter === f ? '#ff3cac' : 'rgba(255,60,172,0.2)', color: filter === f ? '#fff' : '#ff3cac' }}>
                                        {pendingCount}
                                    </span>
                                )}
                                {f === 'APPROVED' && approvedCount > 0 && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black" style={{ background: filter === f ? '#00d4ff' : 'rgba(0,212,255,0.2)', color: filter === f ? '#fff' : '#00d4ff' }}>
                                        {approvedCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Sort Filter */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(12,12,24,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#7b61ff' }}>
                        <path d="m3 16 4 4 4-4"/>
                        <path d="M7 20V4"/>
                        <path d="m21 8-4-4-4 4"/>
                        <path d="M17 4v16"/>
                    </svg>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'tier')}
                        className="bg-transparent text-[9px] font-bold uppercase tracking-wider cursor-pointer outline-none"
                        style={{ color: '#fff', fontFamily: 'var(--font-display)' }}
                    >
                        <option value="newest" style={{ background: '#0c0c18', color: '#fff' }}>Newest First</option>
                        <option value="oldest" style={{ background: '#0c0c18', color: '#fff' }}>Oldest First</option>
                        <option value="tier" style={{ background: '#0c0c18', color: '#fff' }}>Highest Tier</option>
                    </select>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap gap-2 items-center">
                <button
                    onClick={() => setShowAiPromptModal(true)}
                    className="flex-1 md:flex-none group relative overflow-hidden px-4 py-2.5 rounded-xl hover:-translate-y-0.5 transition-all duration-300 min-w-[110px]"
                    style={{ background: 'linear-gradient(135deg, rgba(123,97,255,0.2), rgba(255,60,172,0.2))', border: '1px solid rgba(123,97,255,0.3)', boxShadow: '0 4px 15px rgba(123,97,255,0.15)' }}
                >
                    <div className="flex items-center justify-center gap-2 text-white group-hover:scale-105 transition-transform">
                        <Sparkles size={14} />
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>AI Assist</span>
                    </div>
                </button>

                {[
                    { label: 'Create', icon: <Plus size={14} />, color: '#7b61ff', onClick: () => handleGenerateClick() },
                    { label: 'Logs', icon: <Terminal size={14} />, color: '#00d4ff', onClick: () => { setShowLogsModal(true); handleFetchLogs(); } },
                    { label: 'Add URL', icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, color: '#ff8c00', onClick: async () => {
                        const url = prompt('Paste YouTube or X (Twitter) URL:');
                        if (!url) return;
                        setIsPublishing(true);
                        try {
                            const res = await fetch('/api/admin/custom-url', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ url: url })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert(`${data.post.platform || 'Post'} Added!\n\nTitle: ${data.post.title}\nType: ${data.post.type}\nSource: ${data.post.channel || data.post.platform}\n\nCheck the Pending tab to approve it.`);
                                window.location.reload();
                            } else {
                                alert('Failed: ' + (data.error || 'Failed to add post'));
                            }
                        } catch (e: any) {
                            alert('Error: ' + e.message);
                        } finally {
                            setIsPublishing(false);
                        }
                    }},
                    { label: 'Scan', icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>, color: '#00d4ff', onClick: () => { setShowScanModal(true); setScanResults(null); } },
                ].map((btn) => (
                    <button
                        key={btn.label}
                        onClick={btn.onClick}
                        disabled={isPublishing}
                        className="flex-1 md:flex-none group relative overflow-hidden px-3 py-2.5 rounded-xl hover:-translate-y-0.5 transition-all duration-300 min-w-[90px]"
                        style={{ background: `${btn.color}08`, border: `1px solid ${btn.color}20`, backdropFilter: 'blur(10px)' }}
                    >
                        <div className="flex items-center justify-center gap-1.5 group-hover:scale-105 transition-transform" style={{ color: btn.color }}>
                            {isPublishing ? <Loader2 size={14} className="animate-spin" /> : btn.icon}
                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>{btn.label}</span>
                        </div>
                    </button>
                ))}

                {filter === 'PENDING' && (
                    <button
                        onClick={async () => {
                            if (!confirm('This will delete duplicate posts from pending approvals.\n\nKeep: Highest tier/source post from each duplicate group\nDelete: Lower tier duplicates and similar titles (75%+ match)\n\nProceed?')) return;
                            setIsPublishing(true);
                            try {
                                const res = await fetch('/api/admin/cleanup-duplicates', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'cleanup-pending' })
                                });
                                const data = await res.json();
                                if (data.success) {
                                    alert(`Cleanup complete!\n\nDeleted: ${data.deleted} duplicates\nRemaining: ${data.remaining} posts`);
                                    window.location.reload();
                                } else {
                                    alert('Cleanup failed: ' + (data.error || 'Unknown error'));
                                }
                            } catch (e: any) {
                                alert('Error: ' + e.message);
                            } finally {
                                setIsPublishing(false);
                            }
                        }}
                        disabled={isPublishing}
                        className="flex-1 md:flex-none group relative overflow-hidden px-3 py-2.5 rounded-xl hover:-translate-y-0.5 transition-all duration-300 min-w-[90px]"
                        style={{ background: 'rgba(255,60,60,0.06)', border: '1px solid rgba(255,60,60,0.15)' }}
                    >
                        <div className="flex items-center justify-center gap-1.5 group-hover:scale-105 transition-transform" style={{ color: '#ff4444' }}>
                            {isPublishing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>Clean Dups</span>
                        </div>
                    </button>
                )}

                {selectedIds.length > 0 && (
                    <div className="flex gap-2 ml-auto w-full md:w-auto">
                        <button onClick={handleBulkDelete} disabled={isPublishing} className="flex-1 md:flex-none group px-3 py-2.5 rounded-xl transition-all" style={{ background: 'rgba(255,60,60,0.06)', border: '1px solid rgba(255,60,60,0.15)' }}>
                            <div className="flex items-center justify-center gap-1.5" style={{ color: '#ff4444' }}>
                                {isPublishing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                <span className="text-[9px] font-bold uppercase tracking-wider hidden md:inline" style={{ fontFamily: 'var(--font-display)' }}>Delete</span>
                            </div>
                        </button>
                        <button onClick={handleBulkHide} disabled={isPublishing} className="flex-1 md:flex-none group px-3 py-2.5 rounded-xl transition-all" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div className="flex items-center justify-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                                <EyeOff size={14} />
                                <span className="text-[9px] font-bold uppercase tracking-wider hidden md:inline" style={{ fontFamily: 'var(--font-display)' }}>Hide</span>
                            </div>
                        </button>
                        <button onClick={() => handleApprove(selectedIds)} disabled={isPublishing} className="flex-1 md:flex-none group px-4 py-2.5 rounded-xl transition-all hover:-translate-y-0.5" style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.3)', boxShadow: '0 4px 15px rgba(0,255,136,0.1)' }}>
                            <div className="flex items-center justify-center gap-1.5 text-white">
                                {isPublishing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} style={{ color: '#00ff88' }} />}
                                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: '#00ff88' }}>Approve ({selectedIds.length})</span>
                            </div>
                        </button>
                        <button onClick={() => handleDecline(selectedIds)} disabled={isPublishing} className="flex-1 md:flex-none group px-4 py-2.5 rounded-xl transition-all hover:-translate-y-0.5" style={{ background: 'rgba(255,60,60,0.12)', border: '1px solid rgba(255,60,60,0.3)', boxShadow: '0 4px 15px rgba(255,60,60,0.1)' }}>
                            <div className="flex items-center justify-center gap-1.5 text-white">
                                {isPublishing ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} style={{ color: '#ff4444' }} />}
                                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: '#ff4444' }}>Decline ({selectedIds.length})</span>
                            </div>
                        </button>
                        <button onClick={handlePublishToSocials} disabled={isPublishing} className="flex-1 md:flex-none group px-3 py-2.5 rounded-xl transition-all" style={{ background: 'rgba(255,60,172,0.08)', border: '1px solid rgba(255,60,172,0.2)' }}>
                            <div className="flex items-center justify-center gap-1.5" style={{ color: '#ff3cac' }}>
                                {isPublishing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>Broadcast ({selectedIds.length})</span>
                            </div>
                        </button>
                    </div>
                )}
            </div>

            {/* Content Display - Hybrid Table (Desktop) / Cards (Mobile) */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(12,12,24,0.4)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
                {/* Desktop Table View */}
                <div className="hidden md:block">
                    <table className="w-full text-left">
                        <thead style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <tr>
                                <th className="p-4 pl-6 w-[40px]">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.length === filteredPosts.length && filteredPosts.length > 0}
                                        onChange={toggleSelectAll}
                                        className="rounded border-neutral-700 bg-black/50 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                </th>
                                <th className="p-4 text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                                    {filter === 'PENDING' ? 'Metadata' : 'Status'}
                                </th>
                                <th className="p-4 text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Visual</th>
                                <th className="p-4 text-[9px] font-bold uppercase tracking-[0.2em] w-full" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Intel</th>
                                <th className="p-4 text-[9px] font-bold uppercase tracking-[0.2em] text-right pr-6" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Controls</th>
                            </tr>
                        </thead>
                        <tbody style={{ borderTop: 'none' }}>
                            {filteredPosts.map((post) => (
                                <tr key={post.id} className="group transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: post.id && selectedIds.includes(post.id) ? 'rgba(123,97,255,0.06)' : 'transparent' }} onMouseEnter={(e) => { if (!(post.id && selectedIds.includes(post.id))) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = post.id && selectedIds.includes(post.id) ? 'rgba(123,97,255,0.06)' : 'transparent'; }}>
                                    <td className="p-4 pl-6 align-top">
                                        <input
                                            type="checkbox"
                                            checked={!!post.id && selectedIds.includes(post.id)}
                                            onChange={() => post.id && toggleSelect(post.id)}
                                            className="rounded border-neutral-700 bg-black/50 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                        />
                                    </td>
                                    <td className="p-4 align-top w-[180px]">
                                        {filter === 'PENDING' ? (
                                            <div className="flex flex-col gap-1.5">
                                                {(() => {
                                                    console.log(`[V3] Source=${post.source} | Score=${post.relevanceScore} | Tier=${post.sourceTier}`);
                                                    return null;
                                                })()}

                                                {/* Source + Tier + Score Row */}
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-[9px] font-bold uppercase tracking-tight" style={{ color: '#00d4ff', fontFamily: 'var(--font-display)' }}>
                                                        {post.source || 'Unknown'}
                                                    </span>
                                                    <span className="text-[8px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(123,97,255,0.1)', color: '#7b61ff', border: '1px solid rgba(123,97,255,0.2)' }}>
                                                        T{post.sourceTier || 3}
                                                    </span>
                                                    <span className="text-[8px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(0,212,255,0.08)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.15)' }}>
                                                        {post.relevanceScore || 0}
                                                    </span>
                                                </div>

                                                {/* Verification Badge */}
                                                {(post as any).verification_badge && (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[9px] font-bold uppercase" style={{ color: (post as any).verification_color || 'var(--text-muted)' }}>
                                                            {(post as any).verification_badge}
                                                        </span>
                                                        <span className="text-[7px] px-1 py-0.5 rounded font-mono" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                                                            {(post as any).verification_score || 0}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Flags Row */}
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {((post as any).is_duplicate || (post as any).duplicate_of) && (
                                                        <span className="text-[7px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,60,60,0.1)', color: '#ff4444', border: '1px solid rgba(255,60,60,0.2)' }}>
                                                            DUP {(post as any).duplicate_confidence ? `${Math.round((post as any).duplicate_confidence)}%` : ''}
                                                        </span>
                                                    )}
                                                    {(post as any).requires_review && (
                                                        <span className="text-[7px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,180,0,0.1)', color: '#ffb400', border: '1px solid rgba(255,180,0,0.2)' }}>
                                                            Review
                                                        </span>
                                                    )}
                                                    {(post as any).verification_classification && (
                                                        <span className="text-[7px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: (post as any).auto_post_eligible ? 'rgba(0,255,136,0.08)' : 'rgba(255,180,0,0.08)', color: (post as any).auto_post_eligible ? '#00ff88' : '#ffb400', border: `1px solid ${(post as any).auto_post_eligible ? 'rgba(0,255,136,0.15)' : 'rgba(255,180,0,0.15)'}` }}>
                                                            {(post as any).auto_post_eligible ? 'Auto' : 'Manual'}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Claim Type */}
                                                {post.claimType && (() => {
                                                    const claimColors: Record<string, string> = {
                                                        'NEW_SEASON_CONFIRMED': '#00ff88',
                                                        'DELAY': '#ff4444',
                                                        'TRAILER_DROP': '#00d4ff',
                                                        'NEW_KEY_VISUAL': '#ff3cac',
                                                        'DATE_ANNOUNCED': '#ffb400',
                                                    };
                                                    const cc = claimColors[post.claimType] || 'var(--text-muted)';
                                                    return (
                                                        <span className="text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded w-fit" style={{ background: `${cc}10`, color: cc, border: `1px solid ${cc}25` }}>
                                                            {post.claimType.replace(/_/g, ' ')}
                                                        </span>
                                                    );
                                                })()}

                                                {/* Timestamp */}
                                                <div className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                                    {post.scrapedAt ? new Date(post.scrapedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Manual'}
                                                </div>

                                                {/* Verify Link */}
                                                {(post as any).verification_sources?.source_url && (
                                                    <a
                                                        href={(post as any).verification_sources.source_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider group/link"
                                                        style={{ color: '#00d4ff' }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <span className="w-1 h-1 rounded-full" style={{ background: '#00d4ff' }} />
                                                        Verify
                                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                        </svg>
                                                    </a>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                {/* CRITICAL FIX: Derive effective status for display */}
                                                {(() => {
                                                    const effectiveStatus = post.status || (post.isPublished ? 'published' : 'pending');
                                                    const badgeClass = effectiveStatus === 'approved' 
                                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                                                        : effectiveStatus === 'pending'
                                                        ? 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                                                        : post.type === 'CONFIRMATION_ALERT'
                                                        ? 'bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20'
                                                        : post.isPublished
                                                        ? 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20'
                                                        : 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-500 border-red-200 dark:border-red-500/20';
                                                    
                                                    const badgeText = effectiveStatus === 'approved' 
                                                        ? 'SCHEDULED' 
                                                        : effectiveStatus === 'pending' 
                                                        ? 'PENDING' 
                                                        : post.type === 'CONFIRMATION_ALERT' 
                                                        ? 'ALERT' 
                                                        : post.isPublished 
                                                        ? 'LIVE SIGNAL' 
                                                        : 'HIDDEN';
                                                    
                                                    return (
                                                        <span className={`inline-flex items-center justify-center px-2 py-1 rounded text-[10px] font-black tracking-wider border shadow-sm ${badgeClass}`}>
                                                            {badgeText}
                                                        </span>
                                                    );
                                                })()}
                                                {(post.status === 'approved' || (post.status || (post.isPublished ? 'published' : 'pending')) === 'approved') && (
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
                                        {(() => {
                                            const videoInfo = getPostVideoInfo(post);
                                            const ytThumb = videoInfo?.type === 'youtube' ? `https://img.youtube.com/vi/${videoInfo.id}/mqdefault.jpg` : null;
                                            const thumbSrc = post.image || ytThumb;
                                            return (
                                                <div
                                                    className="w-16 h-20 rounded-lg overflow-hidden relative transition-all cursor-pointer group/thumb"
                                                    style={{ background: 'rgba(12,12,24,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}
                                                    onClick={(e) => { if (videoInfo) { e.stopPropagation(); setVideoPreviewPost(post); } }}
                                                    title={videoInfo ? 'Click to watch video' : ''}
                                                >
                                                    {thumbSrc ? (
                                                        /* eslint-disable-next-line @next/next/no-img-element */
                                                        <img
                                                            src={thumbSrc}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                            style={{ animation: 'none', opacity: 1 }}
                                                            onError={(e) => {
                                                                const target = e.target as HTMLImageElement;
                                                                target.onerror = null;
                                                                target.src = '/hero-bg-final.png';
                                                            }}
                                                        />
                                                    ) : videoInfo?.type === 'twitter' ? (
                                                        <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(29,155,240,0.1)' }}>
                                                            <Twitter size={16} style={{ color: '#1d9bf0' }} />
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                                                            <ImageIcon size={16} />
                                                        </div>
                                                    )}
                                                    {/* Play overlay for video posts */}
                                                    {videoInfo && (
                                                        <div className="absolute inset-0 flex items-center justify-center opacity-80 group-hover/thumb:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.3)' }}>
                                                            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)' }}>
                                                                <svg viewBox="0 0 24 24" fill="white" width="10" height="10"><path d="M8 5v14l11-7z"/></svg>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="p-4 align-top">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-sm font-bold transition-colors" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-main)' }}>
                                                {post.title}
                                            </h3>
                                            {getPostVideoInfo(post) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setVideoPreviewPost(post); }}
                                                    className="px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest rounded flex items-center gap-1 transition-all hover:scale-105"
                                                    style={{ background: 'rgba(255,60,172,0.1)', color: '#ff3cac', border: '1px solid rgba(255,60,172,0.2)' }}
                                                >
                                                    <svg viewBox="0 0 24 24" fill="currentColor" width="8" height="8"><path d="M8 5v14l11-7z"/></svg>
                                                    Watch
                                                </button>
                                            )}
                                            {post.isDuplicate && (
                                                <span className="px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-widest rounded flex items-center gap-1" style={{ background: 'rgba(255,180,0,0.08)', color: '#ffb400', border: '1px solid rgba(255,180,0,0.15)' }}>
                                                    <AlertTriangle size={8} /> DUP
                                                </span>
                                            )}
                                        </div>

                                        {filter === 'PENDING' && post.content && (
                                            <p className="text-[10px] mt-1 line-clamp-2 max-w-[400px]" style={{ color: 'var(--text-tertiary)' }}>
                                                {post.content.replace(/\n/g, ' ').substring(0, 150)}{post.content.length > 150 ? '...' : ''}
                                            </p>
                                        )}

                                        <div className="flex items-center gap-2 text-[9px] font-mono tracking-wide mt-1.5" style={{ color: 'var(--text-muted)' }}>
                                            <span>{new Date(post.timestamp).toLocaleDateString()}</span>
                                            <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
                                            <span className="truncate max-w-[200px]">{post.slug}</span>
                                            {post.anime_id && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
                                                    <span>{post.anime_id}</span>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 align-top text-right pr-6">
                                        <div className="flex justify-end gap-1.5">
                                            {filter === 'PENDING' && (
                                                <>
                                                    <button
                                                        onClick={() => handleApprove([post.id!])}
                                                        title="Approve"
                                                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all hover:scale-110"
                                                        style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)', color: '#00ff88' }}
                                                    >
                                                        <Check size={13} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDecline([post.id!])}
                                                        title="Decline"
                                                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all hover:scale-110"
                                                        style={{ background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.2)', color: '#ff4444' }}
                                                    >
                                                        <X size={13} />
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                onClick={() => handleEditClick(post)}
                                                title="Edit"
                                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all hover:scale-110"
                                                style={{ background: 'rgba(123,97,255,0.08)', border: '1px solid rgba(123,97,255,0.2)', color: '#7b61ff' }}
                                            >
                                                <Edit2 size={13} />
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
                                                <div className="flex flex-col gap-1.5 border-l border-white/10 pl-2">
                                                    {/* Verification Badge Mobile */}
                                                    {(post as any).verification_badge && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[8px] font-black uppercase" style={{ color: (post as any).verification_color || '#9ca3af' }}>
                                                                {(post as any).verification_badge}
                                                            </span>
                                                            <span className={`text-[7px] px-1 py-0.5 rounded ${(post as any).auto_post_eligible ? 'bg-green-900/30 text-green-400' : 'bg-amber-900/30 text-amber-400'}`}>
                                                                {(post as any).auto_post_eligible ? '✓ Auto' : '⚠ Review'}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[8px] font-bold text-neutral-500 uppercase">
                                                            {post.source || 'Unknown'}
                                                        </span>
                                                        <span className="text-[7px] px-1 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">
                                                            T{post.sourceTier || 3} | {post.relevanceScore || 0}
                                                        </span>
                                                        {post.claimType && (
                                                            <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded ${
                                                                post.claimType === 'NEW_SEASON_CONFIRMED' ? 'bg-green-900/30 text-green-400' :
                                                                post.claimType === 'DELAY' ? 'bg-red-900/30 text-red-400' :
                                                                post.claimType === 'TRAILER_DROP' ? 'bg-blue-900/30 text-blue-400' :
                                                                'bg-neutral-800 text-neutral-400'
                                                            }`}>
                                                                {post.claimType.replace(/_/g, ' ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {(post as any).verification_sources?.source_url && (
                                                        <a 
                                                            href={(post as any).verification_sources.source_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-[8px] font-bold text-blue-400 uppercase"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <span className="w-1 h-1 rounded-full bg-blue-400"></span>
                                                            Verify Signal →
                                                        </a>
                                                    )}
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

                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight mb-1 line-clamp-2">
                                        {post.title}
                                    </h3>
                                    
                                    {/* Content Preview for Pending Mobile */}
                                    {filter === 'PENDING' && post.content && (
                                        <p className="text-[9px] text-neutral-500 dark:text-neutral-400 mb-2 line-clamp-2">
                                            {post.content.replace(/\n/g, ' ').substring(0, 100)}{post.content.length > 100 ? '...' : ''}
                                        </p>
                                    )}
                                    
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
                        <div className="inline-flex p-4 rounded-full mb-4" style={{ background: 'rgba(123,97,255,0.06)', border: '1px solid rgba(123,97,255,0.1)' }}>
                            <Newspaper size={24} style={{ color: 'var(--text-muted)' }} />
                        </div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>No transmissions in this sector.</p>
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

            {/* SCAN SOURCES MODAL */}
            {showScanModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => !isPublishing && setShowScanModal(false)} />
                    <div className="relative bg-[#0a0a0a]/90 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
                        
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                            <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 uppercase tracking-tighter">Scan Sources</h3>
                            <p className="text-[10px] text-neutral-500 font-mono tracking-widest uppercase mt-1">Select sources to scan for new content</p>
                        </div>

                        {/* Source Selection */}
                        <div className="p-6 space-y-4">
                            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Select Sources</label>
                            <div className="space-y-3">
                                <button
                                    onClick={() => setScanSources(prev => ({ ...prev, youtube: !prev.youtube }))}
                                    disabled={isPublishing}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${scanSources.youtube
                                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                        : 'bg-black border-white/5 text-neutral-600 opacity-60'
                                        }`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                                    <div className="flex-1 text-left">
                                        <span className="text-sm font-bold">YouTube</span>
                                        <span className="text-[10px] text-neutral-500 block">Trailers & official content</span>
                                    </div>
                                    {scanSources.youtube && <Check size={16} className="text-red-400" />}
                                </button>

                                <button
                                    onClick={() => setScanSources(prev => ({ ...prev, twitter: !prev.twitter }))}
                                    disabled={isPublishing}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${scanSources.twitter
                                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                        : 'bg-black border-white/5 text-neutral-600 opacity-60'
                                        }`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                    <div className="flex-1 text-left">
                                        <span className="text-sm font-bold">X / Twitter</span>
                                        <span className="text-[10px] text-neutral-500 block">Anime news & updates</span>
                                    </div>
                                    {scanSources.twitter && <Check size={16} className="text-blue-400" />}
                                </button>

                                <button
                                    onClick={() => setScanSources(prev => ({ ...prev, rss: !prev.rss }))}
                                    disabled={isPublishing}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${scanSources.rss
                                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                        : 'bg-black border-white/5 text-neutral-600 opacity-60'
                                        }`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
                                    <div className="flex-1 text-left">
                                        <span className="text-sm font-bold">RSS Feeds</span>
                                        <span className="text-[10px] text-neutral-500 block">News sites & blogs</span>
                                    </div>
                                    {scanSources.rss && <Check size={16} className="text-green-400" />}
                                </button>
                            </div>
                        </div>

                        {/* Results Display */}
                        {scanResults && (
                            <div className="px-6 pb-4 space-y-2">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Results</label>
                                <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl space-y-2 max-h-40 overflow-y-auto">
                                    {scanResults.youtube && (
                                        <div className="text-xs">
                                            <span className="text-red-400 font-bold">YouTube:</span>{' '}
                                            <span className="text-neutral-300">Found {scanResults.youtube.found}, Published {scanResults.youtube.published}</span>
                                        </div>
                                    )}
                                    {scanResults.twitter && (
                                        <div className="text-xs">
                                            <span className="text-blue-400 font-bold">X/Twitter:</span>{' '}
                                            <span className="text-neutral-300">Found {scanResults.twitter.found}, Added {scanResults.twitter.added}</span>
                                        </div>
                                    )}
                                    {scanResults.rss && (
                                        <div className="text-xs">
                                            <span className="text-green-400 font-bold">RSS:</span>{' '}
                                            <span className="text-neutral-300">Found {scanResults.rss.found}, Added {scanResults.rss.added}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="p-6 border-t border-white/5 bg-white/[0.02] flex justify-end gap-4">
                            <button
                                onClick={() => setShowScanModal(false)}
                                disabled={isPublishing}
                                className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-white disabled:opacity-50"
                            >
                                Close
                            </button>
                            <button
                                onClick={async () => {
                                    setIsPublishing(true);
                                    setScanResults(null);
                                    const results: any = {};
                                    
                                    if (scanSources.youtube) {
                                        try {
                                            const res = await fetch('/api/admin/youtube', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ action: 'scan-trailers', hoursBack: 6 })
                                            });
                                            results.youtube = await res.json();
                                        } catch (e) {
                                            results.youtube = { success: false, error: 'Failed' };
                                        }
                                    }
                                    
                                    if (scanSources.twitter) {
                                        try {
                                            const res = await fetch('/api/admin/twitter', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ action: 'scan-twitter', hoursBack: 6 })
                                            });
                                            results.twitter = await res.json();
                                        } catch (e) {
                                            results.twitter = { success: false, error: 'Failed' };
                                        }
                                    }
                                    
                                    if (scanSources.rss) {
                                        try {
                                            const res = await fetch('/api/admin/rss', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ action: 'scan-rss', hoursBack: 6 })
                                            });
                                            results.rss = await res.json();
                                        } catch (e) {
                                            results.rss = { success: false, error: 'Failed' };
                                        }
                                    }
                                    
                                    setScanResults(results);
                                    setIsPublishing(false);
                                    
                                    // Count total added
                                    const totalAdded = (results.youtube?.published || 0) + (results.twitter?.added || 0) + (results.rss?.added || 0);
                                    if (totalAdded > 0) {
                                        setTimeout(() => window.location.reload(), 1500);
                                    }
                                }}
                                disabled={isPublishing || (!scanSources.youtube && !scanSources.twitter && !scanSources.rss)}
                                className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black uppercase tracking-widest rounded-lg shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center gap-3"
                            >
                                {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>}
                                {isPublishing ? 'Scanning...' : 'Start Scan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI PROMPT MODAL */}
            {showAiPromptModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => !isAiLoading && setShowAiPromptModal(false)} />
                    <div className="relative bg-[#0a0a0a]/90 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
                        
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                            <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 uppercase tracking-tighter">AI Assist</h3>
                            <p className="text-[10px] text-neutral-500 font-mono tracking-widest uppercase mt-1">Describe what you want to create</p>
                        </div>

                        {/* Prompt Input */}
                        <div className="p-6 space-y-4">
                            <div className="group">
                                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">
                                    Your Prompt
                                </label>
                                <textarea
                                    placeholder="e.g., Write a post about the new Jujutsu Kaisen season announcement..."
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none h-32 resize-none transition-all"
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    disabled={isAiLoading}
                                />
                            </div>

                            {/* Example Prompts */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Examples</label>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        "Jujutsu Kaisen Season 3 announcement",
                                        "Top trending anime this week",
                                        "New trailer for Demon Slayer",
                                        "Solo Leveling premiere date"
                                    ].map((example) => (
                                        <button
                                            key={example}
                                            onClick={() => setAiPrompt(example)}
                                            disabled={isAiLoading}
                                            className="text-[10px] px-3 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-full border border-white/10 transition-all"
                                        >
                                            {example}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Loading State */}
                            {isAiLoading && (
                                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center gap-3">
                                    <Loader2 size={20} className="text-purple-400 animate-spin" />
                                    <div>
                                        <div className="text-purple-400 text-xs font-bold">Generating...</div>
                                        <div className="text-[10px] text-neutral-500">AI is crafting your post</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-white/5 bg-white/[0.02] flex justify-end gap-4">
                            <button
                                onClick={() => setShowAiPromptModal(false)}
                                disabled={isAiLoading}
                                className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-white disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (!aiPrompt.trim()) return;
                                    setIsAiLoading(true);
                                    try {
                                        const res = await fetch('/api/admin/ai-assistant', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                prompt: aiPrompt,
                                                history: aiChatHistory
                                            })
                                        });
                                        const data = await res.json();
                                        
                                        if (data.success && data.draft) {
                                            setAiGeneratedDraft(data.draft);
                                            setAiChatHistory(prev => [...prev, 
                                                { role: 'user', content: aiPrompt },
                                                { role: 'assistant', content: data.draft }
                                            ]);
                                            
                                            // Close prompt modal and open edit modal with draft
                                            setShowAiPromptModal(false);
                                            
                                            // Pre-fill the editing modal
                                            setEditingPostId(null);
                                            setGenType(data.draft.type || 'INTEL');
                                            setTopic(data.draft.title || '');
                                            setTitle(data.draft.title || '');
                                            setContent(data.draft.content || '');
                                            setOverlayTag(data.draft.title || '');
                                            
                                            // Search for image
                                            if (data.draft.imageSearchTerm || data.draft.title) {
                                                setIsSearchingImages(true);
                                                try {
                                                    const imgRes = await fetch(`/api/admin/image-search?q=${encodeURIComponent(data.draft.imageSearchTerm || data.draft.title)}`);
                                                    const imgData = await imgRes.json();
                                                    if (imgData.images && imgData.images.length > 0) {
                                                        setSearchedImages(imgData.images);
                                                        setSelectedImageIndex(0);
                                                        setCustomImagePreview(imgData.images[0]);
                                                    }
                                                } catch (e) {
                                                    console.error('Image search failed:', e);
                                                } finally {
                                                    setIsSearchingImages(false);
                                                }
                                            }
                                            
                                            setShowModal(true);
                                            setAiPrompt(''); // Reset prompt
                                        } else {
                                            alert('❌ AI generation failed: ' + (data.error || 'Unknown error'));
                                        }
                                    } catch (e: any) {
                                        alert('❌ Error: ' + e.message);
                                    } finally {
                                        setIsAiLoading(false);
                                    }
                                }}
                                disabled={isAiLoading || !aiPrompt.trim()}
                                className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-black uppercase tracking-widest rounded-lg shadow-lg shadow-purple-500/20 disabled:opacity-50 flex items-center gap-3"
                            >
                                {isAiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                {isAiLoading ? 'Generating...' : 'Generate Post'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {
                showModal && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
                        <div className="absolute inset-0 backdrop-blur-md animate-in fade-in duration-300" style={{ background: 'rgba(6,6,14,0.95)' }} onClick={() => setShowModal(false)} />
                        <div className="relative rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col h-[95vh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom-8 duration-300 overflow-hidden" style={{ background: 'rgba(12,12,24,0.95)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(40px)' }}>

                            {/* Modal Header */}
                            <div className="p-3 sm:p-4 flex justify-between items-center flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}>
                                <h3 className="text-xs sm:text-sm font-black uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)', background: 'linear-gradient(135deg, #00d4ff, #7b61ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                    Edit Post
                                </h3>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="p-2 rounded-full transition-colors touch-manipulation"
                                    style={{ color: 'var(--text-muted)' }}
                                    aria-label="Close"
                                >
                                    <Plus size={20} className="rotate-45" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4 sm:space-y-6">
                                {/* Video Preview (for video posts being edited) */}
                                {editingPostId && (() => {
                                    const editPost = posts.find(p => p.id === editingPostId);
                                    if (!editPost) return null;
                                    const videoInfo = getPostVideoInfo(editPost);
                                    if (!videoInfo) return null;
                                    return (
                                        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                            <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: videoInfo.type === 'youtube' ? '#ff0000' : '#1d9bf0' }} />
                                                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>
                                                    {videoInfo.type === 'youtube' ? 'YouTube' : 'X'} Video Preview
                                                </span>
                                                <button
                                                    className="ml-auto text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded transition-colors"
                                                    style={{ color: '#00d4ff', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)' }}
                                                    onClick={() => setVideoPreviewPost(editPost)}
                                                >
                                                    Expand
                                                </button>
                                            </div>
                                            {videoInfo.type === 'youtube' ? (
                                                <div className="relative w-full" style={{ paddingBottom: '56.25%', background: '#000' }}>
                                                    <iframe
                                                        src={`https://www.youtube.com/embed/${videoInfo.id}?rel=0`}
                                                        title="Video preview"
                                                        frameBorder="0"
                                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                                        allowFullScreen
                                                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="p-3 flex justify-center" style={{ background: 'rgba(0,0,0,0.2)', minHeight: '100px' }}>
                                                    <a
                                                        href={`https://x.com/i/status/${videoInfo.id}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs font-bold flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                                                        style={{ color: '#1d9bf0', background: 'rgba(29,155,240,0.1)', border: '1px solid rgba(29,155,240,0.2)' }}
                                                    >
                                                        <Twitter size={14} />
                                                        View on X
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                <div className="space-y-4">
                                    {/* 0. POST TYPE (Optional) */}
                                    <div className="group">
                                        <label className="block text-[10px] font-bold uppercase tracking-widest mb-2 transition-colors" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                                            Post Type (Optional)
                                        </label>
                                        <select
                                            className="w-full rounded-xl p-3 text-white text-sm outline-none transition-all cursor-pointer"
                                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                                            value={genType || ''}
                                            onChange={(e) => setGenType(e.target.value as any || null)}
                                        >
                                            <option value="">— Select Type —</option>
                                            <option value="INTEL">Intel (News/Announcements)</option>
                                            <option value="TRENDING">Trending (Community Buzz)</option>
                                            <option value="CONFIRMATION_ALERT">Alert (Breaking News)</option>
                                            <option value="TRAILER">Trailer / Video</option>
                                            <option value="CUSTOM">Custom</option>
                                        </select>
                                    </div>

                                    {/* 1. TITLE */}
                                    <div className="group">
                                        <label className="block text-[10px] font-bold uppercase tracking-widest mb-2 transition-colors" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                                            1. Title
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Transmission Title..."
                                            className="w-full rounded-xl p-3 text-white text-sm outline-none transition-all"
                                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                                            value={title}
                                            onChange={(e) => {
                                                setTitle(e.target.value);
                                                setOverlayTag(e.target.value);
                                            }}
                                        />
                                    </div>

                                    {/* 2. CONTENT/BODY */}
                                    <div className="group">
                                        <label className="block text-[10px] font-bold uppercase tracking-widest mb-2 transition-colors" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                                            2. Content / Body
                                        </label>
                                        <textarea
                                            placeholder="Enter transmission content..."
                                            className="w-full rounded-xl p-3 text-white text-sm outline-none h-40 resize-none transition-all"
                                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                                            value={content}
                                            onChange={(e) => setContent(e.target.value)}
                                        />
                                    </div>

                                    {/* 3. IMAGE PREVIEW & CONTROLS */}
                                    <div className="space-y-4">
                                        <label className="block text-[10px] font-bold uppercase tracking-widest mb-0 transition-colors" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                                            3. Image Preview & Controls
                                        </label>
                                        <div className="rounded-2xl p-4 space-y-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    onClick={() => handleSearchImages(true)}
                                                    disabled={isSearchingImages || !title}
                                                    className="text-[10px] font-bold text-white px-4 py-2 rounded-lg transition-all shadow-lg flex items-center gap-1.5 disabled:opacity-50"
                                                    style={{ background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.3)' }}
                                                >
                                                    {isSearchingImages ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                                    Regenerate Image
                                                </button>
                                                <label className="text-[10px] font-bold text-white px-4 py-2 rounded-lg transition-all shadow-lg flex items-center gap-1.5 cursor-pointer" style={{ background: 'rgba(123,97,255,0.15)', border: '1px solid rgba(123,97,255,0.3)' }}>
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
                                        <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-2">
                                            {/* --- THE PRO EDITOR STAGE --- */}
                                            <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
                                                <div
                                                    ref={stageContainerRef}
                                                    onPointerMove={handleImagePointerMove}
                                                    onPointerUp={handleImagePointerUp}
                                                    className="flex-1 relative group/editor bg-slate-900 dark:bg-black rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/5 aspect-[4/5] flex items-center justify-center touch-none z-0 max-h-[50vh] sm:max-h-none"
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
                                                            onPointerUp={handleImagePointerUp}
                                                            style={{
                                                                transform: `scale(${imageScale}) translate(${imagePosition.x * 100}%, ${imagePosition.y * 100}%)`,
                                                                transition: isDragging && dragTarget === 'image' ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)',
                                                            }}
                                                        >
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={(searchedImages.length > 0 && selectedImageIndex !== null)
                                                                    ? searchedImages[selectedImageIndex]
                                                                    : customImagePreview || '/hero-bg-final.png'
                                                                }
                                                                crossOrigin="anonymous"
                                                                alt=""
                                                                className="w-full h-full object-cover pointer-events-none select-none"
                                                            />
                                                        </div>

                                                        {/* 2. Gradient Layer (Visual Only) */}
                                                        {isApplyGradient && (
                                                            <div
                                                                className={`absolute inset-x-0 h-1/2 pointer-events-none transition-all duration-500 z-[5] ${gradientPosition === 'top' ? 'top-0 bg-gradient-to-b from-black/95 via-black/40 to-transparent' : 'bottom-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent'}`}
                                                            />
                                                        )}

                                                        {/* 3. Text Layer - Bounded Rectangle Layout */}
                                                        {isApplyText && overlayTag && overlayTag.trim().length > 0 && (
                                                            <div className="absolute inset-0 pointer-events-none z-10">
                                                                {/* TEXT CONTAINER: Strict bounded box 30px margins */}
                                                                <div
                                                                    className={`absolute pointer-events-auto cursor-grab active:cursor-grabbing select-none group/text transition-all ${isTextLocked ? 'ring-0' : 'ring-1 ring-white/20 hover:ring-purple-500/50'}`}
                                                                    onPointerDown={(e) => handleImagePointerDown(e, 'text')}
                                                                    style={{
                                                                        left: `${30 * containerScale}px`,
                                                                        top: ((layoutMetadata?.y ?? (gradientPosition === 'top' ? 236.25 : 1113.75)) + verticalOffset) * containerScale,
                                                                        transformOrigin: 'left center',
                                                                        transform: `translateY(-50%) scale(${containerScale})`,
                                                                        transition: isDragging && dragTarget === 'text' ? 'none' : 'transform 0.4s cubic-bezier(0.2, 0, 0, 1)',
                                                                        // HARD BOUNDED WIDTH - 1020px max (1080 - 30 - 30)
                                                                        width: `${WIDTH - 60}px`,
                                                                        maxWidth: `${WIDTH - 60}px`,
                                                                        overflow: 'visible',
                                                                    }}
                                                                    data-text-layer="true"
                                                                >
                                                                    <div 
                                                                        style={{ 
                                                                            filter: 'drop-shadow(0 4px 24px rgba(0,0,0,0.9))',
                                                                        }}
                                                                    >
                                                                        <div
                                                                            ref={textContainerRef}
                                                                            className="text-white font-black uppercase"
                                                                            style={{
                                                                                fontFamily: 'Outfit, sans-serif',
                                                                                // Font size: large enough to fill width, small enough to wrap
                                                                                fontSize: layoutMetadata?.fontSize 
                                                                                    ? `${layoutMetadata.fontSize * textScale}px` 
                                                                                    : `${Math.min(90, Math.max(56, (WIDTH - 60) / 14)) * textScale}px`,
                                                                                lineHeight: '1.1',
                                                                                textAlign: 'center',
                                                                                // FORCE WRAPPING
                                                                                whiteSpace: 'normal',
                                                                                overflowWrap: 'break-word',
                                                                                wordBreak: 'break-word',
                                                                            }}
                                                                        >
                                                                            {/* Words with regular spaces so browser wraps naturally */}
                                                                            {(overlayTag || '').trim().split(/\s+/).filter(Boolean).map((word, idx, arr) => (
                                                                                <span
                                                                                    key={idx}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const newIndices = purpleWordIndices.includes(idx)
                                                                                            ? purpleWordIndices.filter(i => i !== idx)
                                                                                            : [...purpleWordIndices, idx].sort((a, b) => a - b);
                                                                                        setPurpleWordIndices(newIndices);
                                                                                        setIsStageDirty(true);
                                                                                    }}
                                                                                    className={`${purpleWordIndices.includes(idx) ? 'text-purple-400' : 'text-white'}`}
                                                                                    style={{ cursor: 'pointer' }}
                                                                                >
                                                                                    {word}{idx < arr.length - 1 ? ' ' : ''}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>
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

                                                {/* Side Control Panel - Mobile Optimized */}
                                                <div className="w-full lg:w-48 flex flex-row lg:flex-col gap-3 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
                                                    {/* Text Tools */}
                                                    <div className="p-3 sm:p-4 bg-white/[0.03] border border-white/5 rounded-xl sm:rounded-2xl space-y-3 min-w-[140px] lg:min-w-0 flex-1 lg:flex-none">
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

                                                        {/* NEW: Vertical Position Adjustment - HARD CONSTRAINED TO ZONE */}
                                                        <div className="text-[9px] font-black text-neutral-500 uppercase tracking-widest flex justify-between items-center pt-2">
                                                            <span>Vertical Position</span>
                                                            <span className="font-mono text-white/50">{verticalOffset}px</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={() => {
                                                                    // HARD CONSTRAINT: Calculate max allowed offset to stay in zone
                                                                    const zoneHeight = HEIGHT * 0.35;
                                                                    const zoneCenter = gradientPosition === 'top' ? 236.25 : 1113.75;
                                                                    const textHeight = layoutMetadata?.totalHeight || (zoneHeight * 0.5); // Estimate if unknown
                                                                    const maxOffsetUp = -(zoneHeight / 2) + (textHeight / 2) + 15; // 15px margin
                                                                    
                                                                    const newOffset = Math.max(maxOffsetUp, verticalOffset - 10);
                                                                    setVerticalOffset(newOffset);
                                                                    setIsStageDirty(true);
                                                                    if (isApplyText && overlayTag.trim().length > 0) {
                                                                        handleApplyText(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, newOffset);
                                                                    }
                                                                }} 
                                                                className="flex-1 py-2 px-3 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 flex items-center justify-center"
                                                                title="Move text up (constrained to zone)"
                                                            >
                                                                ▲
                                                            </button>
                                                            <button 
                                                                onClick={() => {
                                                                    // HARD CONSTRAINT: Calculate max allowed offset to stay in zone
                                                                    const zoneHeight = HEIGHT * 0.35;
                                                                    const zoneCenter = gradientPosition === 'top' ? 236.25 : 1113.75;
                                                                    const textHeight = layoutMetadata?.totalHeight || (zoneHeight * 0.5);
                                                                    const maxOffsetDown = (zoneHeight / 2) - (textHeight / 2) - 15; // 15px margin
                                                                    
                                                                    const newOffset = Math.min(maxOffsetDown, verticalOffset + 10);
                                                                    setVerticalOffset(newOffset);
                                                                    setIsStageDirty(true);
                                                                    if (isApplyText && overlayTag.trim().length > 0) {
                                                                        handleApplyText(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, newOffset);
                                                                    }
                                                                }} 
                                                                className="flex-1 py-2 px-3 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 flex items-center justify-center"
                                                                title="Move text down (constrained to zone)"
                                                            >
                                                                ▼
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setVerticalOffset(0);
                                                                    setIsStageDirty(true);
                                                                    if (isApplyText && overlayTag.trim().length > 0) {
                                                                        handleApplyText(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 0);
                                                                    }
                                                                }}
                                                                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg border border-white/10 text-[10px]"
                                                                title="Reset position"
                                                            >
                                                                ↺
                                                            </button>
                                                        </div>

                                                        <div className="flex flex-col gap-2 pt-2">
                                                            <button
                                                                onClick={() => toggleFX('text')}
                                                                className={`w-full py-2 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-between transition-all ${isApplyText ? 'bg-purple-600 text-white shadow-lg' : 'bg-white/5 text-neutral-500'}`}
                                                            >
                                                                <span>Text</span>
                                                                <span className="text-[8px]">{isApplyText ? 'ON' : 'OFF'}</span>
                                                            </button>
                                                            <button
                                                                onClick={() => toggleFX('gradient')}
                                                                className={`w-full py-2 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-between transition-all ${isApplyGradient ? 'bg-purple-600 text-white shadow-lg' : 'bg-white/5 text-neutral-500'}`}
                                                            >
                                                                <span>Gradient</span>
                                                                <span className="text-[8px]">{isApplyGradient ? 'ON' : 'OFF'}</span>
                                                            </button>
                                                            <button
                                                                onClick={() => setIsApplyWatermark(!isApplyWatermark)}
                                                                className={`w-full py-2 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-between transition-all ${isApplyWatermark ? 'bg-purple-600 text-white shadow-lg' : 'bg-white/5 text-neutral-500'}`}
                                                            >
                                                                <span>Watermark</span>
                                                                <span className="text-[8px]">{isApplyWatermark ? 'ON' : 'OFF'}</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-2">
                                                        <button
                                                            onClick={() => handleSearchImages(true)}
                                                            disabled={isSearchingImages}
                                                            className="w-full py-2 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 text-[10px] font-bold uppercase tracking-widest border border-purple-500/20 rounded-xl transition-all flex items-center justify-center gap-2"
                                                        >
                                                            {isSearchingImages ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                                            Regenerate Image
                                                        </button>
                                                        <button onClick={handleResetAll} className="w-full py-2 text-[10px] font-bold text-neutral-500 hover:text-white hover:bg-white/5 border border-white/10 rounded-xl transition-all flex items-center justify-center gap-2">
                                                            <RotateCcw size={14} /> REVERT
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* --- PURPLE SIGNAL TARGETING --- */}
                                            <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
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

                                            {/* Fullscreen Preview Modal - Mobile Optimized */}
                                            {showExpandedPreview && processedImage && (
                                                <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-300">
                                                    <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setShowExpandedPreview(false)} />
                                                    <div className="relative w-full max-w-[calc(100vh*0.8)] max-h-[90vh] aspect-[4/5] bg-neutral-900 rounded-xl sm:rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(157,123,255,0.15)] border border-white/10 flex flex-col">
                                                        {/* Close Button - Larger for mobile */}
                                                        <button
                                                            onClick={() => setShowExpandedPreview(false)}
                                                            className="absolute top-3 right-3 sm:top-4 sm:right-4 p-3 bg-black/70 hover:bg-red-500 text-white rounded-full backdrop-blur-md border border-white/20 transition-all shadow-2xl z-[201] touch-manipulation"
                                                            aria-label="Close preview"
                                                        >
                                                            <XCircle size={24} className="sm:w-7 sm:h-7" />
                                                        </button>
                                                        
                                                        {/* Image Container */}
                                                        <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img 
                                                                src={processedImage} 
                                                                alt="Preview" 
                                                                className="w-full h-full object-contain max-h-[calc(90vh-80px)]" 
                                                            />
                                                        </div>
                                                        
                                                        {/* Footer */}
                                                        <div className="p-3 sm:p-4 bg-black/80 backdrop-blur-md border-t border-white/10 flex items-center justify-center">
                                                            <span className="text-[9px] sm:text-[10px] font-black text-white/60 uppercase tracking-[0.3em]">
                                                                PREVIEW MODE
                                                            </span>
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
                            <div className="p-3 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}>
                                {/* Website Publication Toggle */}
                                <div className="flex items-center gap-3 order-1 sm:order-1 px-2 py-2 bg-white/5 rounded-lg border border-white/10">
                                    <button
                                        onClick={() => setIsWebsitePublished(!isWebsitePublished)}
                                        className={`relative w-12 h-6 rounded-full transition-colors ${isWebsitePublished ? 'bg-green-500' : 'bg-neutral-700'}`}
                                    >
                                        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isWebsitePublished ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </button>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white">
                                            {isWebsitePublished ? 'Published' : 'Hidden'}
                                        </span>
                                        <span className="text-[9px] text-neutral-500">
                                            {isWebsitePublished ? 'Live on website' : 'Not visible on site'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex-1 order-2 sm:order-2" />

                                <button
                                    onClick={() => setShowModal(false)}
                                    className="px-4 sm:px-6 py-3 sm:py-4 text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-white transition-colors order-3 sm:order-3"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCommitToPreview}
                                    disabled={isProcessingImage || isApplyingEffect}
                                    className="flex-1 py-3 sm:py-4 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest rounded-xl transition-all border border-white/10 flex items-center justify-center gap-2 sm:gap-3 order-2"
                                >
                                    {isProcessingImage ? <Loader2 className="animate-spin" size={16} /> : <Eye size={16} />}
                                    <span className="hidden sm:inline">Show Preview</span>
                                    <span className="sm:hidden">Preview</span>
                                </button>
                                <button
                                    onClick={() => handleSavePost(true)}
                                    disabled={isGenerating || isApplyingEffect}
                                    className="flex-[1.5] py-3 sm:py-4 text-white font-black uppercase tracking-widest rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 sm:gap-3 order-1 sm:order-3"
                                    style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(123,97,255,0.3))', border: '1px solid rgba(123,97,255,0.4)', boxShadow: '0 4px 20px rgba(123,97,255,0.2)', fontFamily: 'var(--font-display)' }}
                                >
                                    {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
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

            {/* VIDEO PREVIEW MODAL */}
            {videoPreviewPost && (() => {
                const videoInfo = getPostVideoInfo(videoPreviewPost);
                if (!videoInfo) return null;
                return (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={() => setVideoPreviewPost(null)}>
                        <div className="absolute inset-0 backdrop-blur-md" style={{ background: 'rgba(6,6,14,0.95)' }} />
                        <div
                            className="relative w-full max-w-3xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-300"
                            style={{ background: 'rgba(12,12,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 0 60px rgba(0,212,255,0.1)' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full" style={{ background: videoInfo.type === 'youtube' ? '#ff0000' : '#1d9bf0', boxShadow: `0 0 8px ${videoInfo.type === 'youtube' ? 'rgba(255,0,0,0.4)' : 'rgba(29,155,240,0.4)'}` }} />
                                    <span className="text-xs font-bold uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                                        {videoInfo.type === 'youtube' ? 'YouTube Video' : 'X / Twitter Post'}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,60,172,0.1)', color: '#ff3cac', border: '1px solid rgba(255,60,172,0.2)' }}>
                                        VIDEO
                                    </span>
                                </div>
                                <button
                                    onClick={() => setVideoPreviewPost(null)}
                                    className="p-2 rounded-full transition-colors hover:bg-white/5"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    <Plus size={20} className="rotate-45" />
                                </button>
                            </div>

                            {/* Video Content */}
                            <div className="p-4">
                                {videoInfo.type === 'youtube' ? (
                                    <div className="relative w-full" style={{ paddingBottom: '56.25%', borderRadius: '12px', overflow: 'hidden', background: '#000' }}>
                                        <iframe
                                            src={`https://www.youtube.com/embed/${videoInfo.id}?rel=0&modestbranding=1`}
                                            title={videoPreviewPost.title}
                                            frameBorder="0"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                            allowFullScreen
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                                        />
                                    </div>
                                ) : (
                                    <div ref={twitterWidgetRef} className="flex justify-center min-h-[300px] py-4" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                                        <blockquote className="twitter-tweet" data-theme="dark" data-conversation="none" data-media-max-width="560">
                                            <a href={`https://twitter.com/i/status/${videoInfo.id}`}>Loading tweet...</a>
                                        </blockquote>
                                    </div>
                                )}
                            </div>

                            {/* Post Info Footer */}
                            <div className="px-4 pb-4">
                                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                                    {videoPreviewPost.title}
                                </h3>
                                <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    <span>{videoPreviewPost.source || 'Unknown'}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.1)' }}>•</span>
                                    <span>{new Date(videoPreviewPost.timestamp).toLocaleDateString()}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.1)' }}>•</span>
                                    <span className="uppercase font-bold" style={{ color: videoPreviewPost.status === 'pending' ? '#ff3cac' : videoPreviewPost.status === 'approved' ? '#00d4ff' : '#00ff88' }}>
                                        {videoPreviewPost.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

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
/ /   S o r t   f i l t e r   d e p l o y e d   
 
 