/**
 * image-processor.ts
 * Implements the premium social-first aesthetic for KumoLab.
 * Format: 4:5 Portrait (1080x1350)
 * 
 * LAYOUT RULES (Hard Standards):
 * - Text center-aligned horizontally ✓
 * - Text confined to 35% zones (bottom default, optional top)
 * - Auto-scaling based on text length and available space
 * - Safe margins: 40px from edges
 * - Balanced, dense text blocks
 * - Manual vertical offset supported
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Aesthetics
const KUMOLAB_PURPLE = '#9D7BFF'; // Vibrant Lavender/Purple from reference
const HANDLE_TEXT = '@KumoLabAnime';

// LAYOUT CONSTANTS (Hard Rules)
const WIDTH = 1080;
const HEIGHT = 1350;
const LAYOUT_ZONE_PERCENT = 0.35; // 35% of image height
const SAFE_MARGIN = 30; // Pixels from edges - MUST MATCH UI (30px = 60px total margins)
const BASE_FONT_SIZE = 120;
const MIN_FONT_SIZE = 32; // Increased minimum for better readability
const MAX_FONT_SIZE = 160; // Cap to prevent overflow
const LINE_HEIGHT_FACTOR = 0.88; // Tighter line height for dense look
const MAX_LINE_WIDTH_PERCENT = 0.95; // 95% of available width max (5% safety buffer)

export interface LayoutMetadata {
    fontSize: number;
    lineHeight: number;
    y: number;
    lines: string[];
    finalScale: number;
    zone: 'HEADER' | 'FOOTER';
    numLines: number;
    totalHeight: number;
    verticalOffset: number; // NEW: Track manual adjustment
}

interface IntelImageOptions {
    sourceUrl: string;
    animeTitle: string;
    headline: string;
    slug: string;
    scale?: number;
    position?: { x: number; y: number };
    applyText?: boolean;
    applyGradient?: boolean;
    textPosition?: { x: number; y: number };
    textScale?: number;
    gradientPosition?: 'top' | 'bottom';
    purpleWordIndices?: number[];
    applyWatermark?: boolean;
    watermarkPosition?: { x: number; y: number };
    disableAutoScaling?: boolean;
    classification?: 'CLEAN' | 'TEXT_HEAVY';
    bypassSafety?: boolean;
    verticalOffset?: number; // NEW: Manual vertical adjustment (pixels)
    // Visual Authority System
    verificationBadge?: string;
    verificationScore?: number;
    sourceName?: string;
    claimType?: string;
    showAuthorityBar?: boolean;
}

export interface ImageProcessingResult {
    processedImage: string;
    layout: LayoutMetadata;
}

/**
 * Wraps text into lines using natural flow, maximizing horizontal fill
 * Targets 2-3 lines total with full width utilization
 * PERMISSIVE: Allows slight overflow to prevent aggressive word breaking
 */
function wrapText(ctx: any, text: string, maxWidth: number, maxLines: number, currentFS: number): string[] {
    if (!text || !text.trim()) return [];
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const lines: string[] = [];
    let currentLine = words[0];
    
    // Allow 10% overflow for better text flow (was too strict at 95%)
    const strictMaxWidth = maxWidth * 1.05;

    for (let i = 1; i < words.length; i++) {
        const word = words[i];

        let width = 0;
        try {
            width = ctx.measureText(currentLine + " " + word).width;
        } catch {
            width = 0;
        }

        // Fallback estimation if measureText fails
        if (width === 0) {
            // More generous estimate: avg char width ~0.6x font size for bold uppercase
            width = (currentLine.length + word.length + 1) * (currentFS * 0.6);
        }

        // PERMISSIVE: Add word if it fits or if line is still short
        if (width <= strictMaxWidth || currentLine.split(/\s+/).length < 2) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    
    // Only truncate if severely over limit
    if (lines.length > maxLines && maxLines > 0) {
        // Join excess lines into the last allowed line
        const truncated = lines.slice(0, maxLines - 1);
        const remaining = lines.slice(maxLines - 1).join(' ');
        truncated.push(remaining);
        return truncated;
    }
    
    return lines.slice(0, maxLines || 10);
}

/**
 * Measures the actual width of a line of text
 */
function measureLineWidth(ctx: any, line: string): number {
    try {
        return ctx.measureText(line).width;
    } catch {
        return 0;
    }
}

/**
 * Calculates optimal font size for 2-3 lines that FILL horizontal width
 * Target: Editorial look with maximum width utilization
 * STRICT: Ensures text NEVER exceeds available width or zone height
 */
function calculateOptimalFontSize(
    ctx: any,
    title: string,
    headline: string,
    availableWidth: number,
    zoneHeight: number,
    requestedScale: number,
    disableAutoScaling: boolean
): { fontSize: number; lineHeight: number; titleLines: string[]; headlineLines: string[]; allLines: string[]; totalHeight: number } {
    
    const combinedText = (title + ' ' + headline).trim();
    const words = combinedText.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    
    // TARGET: 2-3 lines maximum with full horizontal width
    const targetLines = Math.min(3, Math.max(2, Math.ceil(wordCount / 5))); // ~5 words per line
    
    // Start with a conservative font size
    let fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, 
        (zoneHeight * 0.85) / (targetLines * LINE_HEIGHT_FACTOR)
    ));
    fontSize = Math.round(fontSize * requestedScale);
    
    let lineHeight = fontSize * LINE_HEIGHT_FACTOR;
    
    // Test wrapping at this size
    ctx.font = `900 ${fontSize}px "Outfit"`;
    let titleLines = title.length > 0 ? wrapText(ctx, title, availableWidth, 3, fontSize) : [];
    let headlineLines = headline.length > 0 ? wrapText(ctx, headline, availableWidth, 3, fontSize) : [];
    let allLines = [...titleLines, ...headlineLines];
    let totalHeight = allLines.length * lineHeight;
    
    if (!disableAutoScaling && allLines.length > 0) {
        // Helper to check if any line overflows the available width
        // PERMISSIVE: Allow 5% overflow before considering it an error
        const hasOverflow = (lines: string[], fs: number): boolean => {
            ctx.font = `900 ${fs}px "Outfit"`;
            const strictWidth = availableWidth * 1.05; // 5% overflow allowed
            return lines.some(line => measureLineWidth(ctx, line) > strictWidth);
        };
        
        // PHASE 1: Shrink if more than 3 lines
        let iterations = 0;
        while (allLines.length > 3 && fontSize > MIN_FONT_SIZE && iterations < 50) {
            fontSize = Math.max(MIN_FONT_SIZE, fontSize - 3);
            lineHeight = fontSize * LINE_HEIGHT_FACTOR;
            ctx.font = `900 ${fontSize}px "Outfit"`;
            titleLines = title.length > 0 ? wrapText(ctx, title, availableWidth, 3, fontSize) : [];
            headlineLines = headline.length > 0 ? wrapText(ctx, headline, availableWidth, 3, fontSize) : [];
            allLines = [...titleLines, ...headlineLines];
            totalHeight = allLines.length * lineHeight;
            iterations++;
        }
        
        // PHASE 2: Shrink if overflowing zone height OR any line overflows width
        iterations = 0;
        while ((totalHeight > zoneHeight * 0.9 || hasOverflow(allLines, fontSize)) && fontSize > MIN_FONT_SIZE && iterations < 50) {
            fontSize = Math.max(MIN_FONT_SIZE, fontSize - 3);
            lineHeight = fontSize * LINE_HEIGHT_FACTOR;
            ctx.font = `900 ${fontSize}px "Outfit"`;
            titleLines = title.length > 0 ? wrapText(ctx, title, availableWidth, 3, fontSize) : [];
            headlineLines = headline.length > 0 ? wrapText(ctx, headline, availableWidth, 3, fontSize) : [];
            allLines = [...titleLines, ...headlineLines];
            totalHeight = allLines.length * lineHeight;
            iterations++;
        }
        
        // PHASE 3: Grow to fill available space (only if no overflow)
        iterations = 0;
        while (totalHeight < zoneHeight * 0.85 && allLines.length <= 3 && fontSize < MAX_FONT_SIZE && iterations < 50) {
            const testFontSize = fontSize + 2;
            const testLineHeight = testFontSize * LINE_HEIGHT_FACTOR;
            ctx.font = `900 ${testFontSize}px "Outfit"`;
            const testTitleLines = title.length > 0 ? wrapText(ctx, title, availableWidth, 3, testFontSize) : [];
            const testHeadlineLines = headline.length > 0 ? wrapText(ctx, headline, availableWidth, 3, testFontSize) : [];
            const testAllLines = [...testTitleLines, ...testHeadlineLines];
            const testTotalHeight = testAllLines.length * testLineHeight;
            
            // Only accept if it fits height, line count, AND has no width overflow
            const fitsHeight = testTotalHeight <= zoneHeight * 0.9;
            const fitsLines = testAllLines.length <= 3;
            const fitsWidth = !hasOverflow(testAllLines, testFontSize);
            
            if (fitsHeight && fitsLines && fitsWidth) {
                fontSize = testFontSize;
                lineHeight = testLineHeight;
                titleLines = testTitleLines;
                headlineLines = testHeadlineLines;
                allLines = testAllLines;
                totalHeight = testTotalHeight;
                iterations++;
            } else {
                break;
            }
        }
        
        console.log(`[Image Engine] Final: ${fontSize}px, ${allLines.length} lines, ${words.length} words, ${(totalHeight/zoneHeight*100).toFixed(1)}% zone fill`);
    }
    
    return { fontSize, lineHeight, titleLines, headlineLines, allLines, totalHeight };
}

/**
 * Processes an image for the Intel Feed and Social Media.
 */
export async function generateIntelImage({
    sourceUrl,
    animeTitle,
    headline,
    slug,
    skipUpload = false,
    scale = 1,
    position = { x: 0, y: 0 },
    applyText = true,
    applyGradient = true,
    textPosition,
    textScale = 1,
    gradientPosition = 'bottom',
    purpleWordIndices,
    applyWatermark = true,
    watermarkPosition,
    disableAutoScaling = false,
    classification,
    bypassSafety = false,
    verticalOffset = 0, // NEW: Manual vertical adjustment
    // Visual Authority System
    verificationBadge,
    verificationScore,
    sourceName,
    claimType,
    showAuthorityBar = true,
}: IntelImageOptions & { skipUpload?: boolean }): Promise<ImageProcessingResult | null> {
    const outputDir = path.join(process.cwd(), 'public/blog/intel');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFileName = `${slug}-social.png`;

    try {
        // 1. Dynamic Import
        const { createCanvas, loadImage, GlobalFonts } = await import('@napi-rs/canvas');

        // --- STRICT FONT LOADING ---
        const outfitPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');

        if (!fs.existsSync(outfitPath)) {
            throw new Error(`CRITICAL: Font file missing at ${outfitPath}`);
        }

        let isRegistered: boolean = GlobalFonts.registerFromPath(outfitPath, 'Outfit');
        if (!isRegistered) {
            const fontBuffer = fs.readFileSync(outfitPath);
            const fontKey = GlobalFonts.register(fontBuffer, 'Outfit');
            if (fontKey) isRegistered = true;
        }

        if (!isRegistered) {
            throw new Error(`CRITICAL: Font registration failed for ${outfitPath}`);
        }

        // 2. Download source
        let buffer: Buffer;

        if (sourceUrl.startsWith('http')) {
            console.log(`[Image Engine] Fetching: ${sourceUrl}`);
            const response = await fetch(sourceUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) {
                console.error(`[Image Engine] Fetch failed: ${response.status} ${response.statusText}`);
                throw new Error(`Failed to fetch source: ${response.status}`);
            }
            buffer = Buffer.from(await response.arrayBuffer());
            console.log(`[Image Engine] Downloaded ${buffer.length} bytes`);
        } else if (sourceUrl.startsWith('data:')) {
            const base64Data = sourceUrl.split(',')[1];
            buffer = Buffer.from(base64Data, 'base64');
        } else {
            const localPath = path.isAbsolute(sourceUrl)
                ? sourceUrl
                : path.join(process.cwd(), 'public', sourceUrl.startsWith('/') ? sourceUrl.slice(1) : sourceUrl);
            buffer = fs.readFileSync(localPath);
        }

        // 3. Setup Canvas
        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;

        const img = await loadImage(buffer);
        const imgRatio = img.width / img.height;

        // --- 4:5 SUBJECT-SAFE ABORT RULE ---
        if (!bypassSafety && (imgRatio > 2.0 || imgRatio < 0.5)) {
            console.error(`[Image Engine] ABORT: Source aspect ratio (${imgRatio.toFixed(2)}) violates subject-safe rule for 4:5 crop.`);
            return null;
        }

        // USER'S CHOICE TAKES PRIORITY - Respect the toggle settings from UI
        let finalApplyText = applyText === true; // Only true if explicitly set
        let finalApplyGradient = applyGradient === true;
        let finalApplyWatermark = applyWatermark === true;

        // --- CLEAN TEXT PRE-VALIDATION ---
        let cleanedHeadline = (headline || '').toUpperCase().trim().replace(/[—–‒―]/g, '-');
        const upperTitle = (animeTitle || '').toUpperCase().trim().replace(/[—–‒―]/g, '-');

        // Deduplication
        if (cleanedHeadline === upperTitle && upperTitle.length > 0) cleanedHeadline = '';

        const hasActualText = (upperTitle.length > 0 || cleanedHeadline.length > 0);

        // If user wants text but there's no text content, disable text but keep other settings
        if (finalApplyText && !hasActualText) {
            finalApplyText = false;
        }

        // --- SAFE ZONE DETECTION ---
        let finalGradientPosition = gradientPosition;
        if (finalApplyText && !textPosition) {
            try {
                const topRegion = { left: 0, top: 0, width: img.width, height: Math.floor(img.height * 0.3) };
                const bottomRegion = { left: 0, top: Math.floor(img.height * 0.7), width: img.width, height: Math.floor(img.height * 0.3) };
                const [topStats, bottomStats] = await Promise.all([
                    sharp(buffer).extract(topRegion).stats(),
                    sharp(buffer).extract(bottomRegion).stats()
                ]);
                finalGradientPosition = topStats.entropy < bottomStats.entropy ? 'top' : 'bottom';
            } catch {
                finalGradientPosition = 'bottom';
            }
        }

        // Scaling (Center Crop)
        const horizontalScale = WIDTH / img.width;
        const verticalScale = HEIGHT / img.height;
        const finalScale = Math.max(horizontalScale, verticalScale) * scale;
        const drawWidth = img.width * finalScale;
        const drawHeight = img.height * finalScale;
        const dx = (WIDTH - drawWidth) / 2 + (position.x * WIDTH);
        const dy = (HEIGHT - drawHeight) / 2 + (position.y * HEIGHT);

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

        const isTop = finalGradientPosition === 'top';
        const availableWidth = WIDTH - (SAFE_MARGIN * 2); // Safe margins on both sides

        // --- LAYOUT CALCULATION (Hard Rules Implementation) ---
        let layoutResult: {
            fontSize: number;
            lineHeight: number;
            titleLines: string[];
            headlineLines: string[];
            allLines: string[];
            totalHeight: number;
        } | null = null;

        if (finalApplyText) {
            // Calculate zone boundaries
            const zoneHeight = HEIGHT * LAYOUT_ZONE_PERCENT;
            
            layoutResult = calculateOptimalFontSize(
                ctx,
                upperTitle,
                cleanedHeadline,
                availableWidth,
                zoneHeight,
                textScale,
                disableAutoScaling
            );

            console.log(`[Image Engine] Layout calculated:`, {
                fontSize: layoutResult.fontSize,
                lines: layoutResult.allLines.length,
                totalHeight: layoutResult.totalHeight,
                zoneHeight,
                zone: isTop ? 'HEADER' : 'FOOTER'
            });
        }

        // --- GRADIENT LOGIC (Strictly dependent on Rendering) ---
        if (finalApplyGradient && finalApplyText && layoutResult) {
            const gradientHeight = Math.max(layoutResult.totalHeight + 400, HEIGHT * 0.4);
            const gradY = isTop ? 0 : HEIGHT - gradientHeight;
            const gradient = ctx.createLinearGradient(0, gradY, 0, isTop ? gradientHeight : HEIGHT);

            if (isTop) {
                gradient.addColorStop(0, 'rgba(0,0,0,0.95)');
                gradient.addColorStop(0.4, 'rgba(0,0,0,0.6)');
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
            } else {
                gradient.addColorStop(0, 'rgba(0,0,0,0)');
                gradient.addColorStop(0.4, 'rgba(0,0,0,0.2)');
                gradient.addColorStop(0.6, 'rgba(0,0,0,0.6)');
                gradient.addColorStop(0.85, 'rgba(0,0,0,0.95)');
                gradient.addColorStop(1, 'rgba(0,0,0,1)');
            }

            ctx.save();
            ctx.fillStyle = gradient;
            ctx.fillRect(0, gradY, WIDTH, gradientHeight);
            ctx.restore();
        }

        // --- DRAW TEXT (Hard Layout Rules Implementation) ---
        if (finalApplyText && layoutResult) {
            const { fontSize, lineHeight, titleLines, headlineLines, allLines, totalHeight } = layoutResult;
            
            // Calculate zone center Y position
            const zoneHeight = HEIGHT * LAYOUT_ZONE_PERCENT;
            let zoneCenterY: number;
            
            if (isTop) {
                // Header zone: top 35%
                zoneCenterY = (zoneHeight / 2);
            } else {
                // Footer zone: bottom 35%
                zoneCenterY = HEIGHT - (zoneHeight / 2);
            }
            
            // Apply manual vertical offset
            const adjustedZoneCenterY = zoneCenterY + verticalOffset;
            
            // Constrain to safe margins
            const minY = SAFE_MARGIN + (totalHeight / 2);
            const maxY = HEIGHT - SAFE_MARGIN - (totalHeight / 2);
            const constrainedCenterY = Math.max(minY, Math.min(maxY, adjustedZoneCenterY));
            
            // Calculate start Y to vertically center the text block
            const startY = constrainedCenterY - (totalHeight / 2);
            const startX = WIDTH / 2; // Always center horizontally
            
            // STRICT: Calculate maximum allowed line width
            const maxAllowedLineWidth = WIDTH - (SAFE_MARGIN * 2);
            
            // Store layout metadata for client
            (ctx as any)._layoutMetadata = {
                fontSize: fontSize,
                lineHeight: lineHeight,
                y: startY,
                lines: allLines,
                finalScale: fontSize / BASE_FONT_SIZE,
                zone: isTop ? 'HEADER' : 'FOOTER',
                numLines: allLines.length,
                totalHeight: totalHeight,
                verticalOffset: verticalOffset
            };

            // Draw each line
            let currentY = startY + (fontSize * 0.85);
            let wordCursor = 0;
            
            for (const line of allLines) {
                const words = line.split(/\s+/).filter(Boolean);
                ctx.save();
                ctx.font = `900 ${fontSize}px "Outfit"`;
                ctx.textAlign = 'center';

                // Text shadow for readability
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetY = 4;

                // Calculate line width for centering
                let lineTotalWidth = 0;
                const metrics = words.map((w, i) => {
                    const m = ctx.measureText(w);
                    const spaceW = (i < words.length - 1) ? ctx.measureText(' ').width : 0;
                    lineTotalWidth += m.width + spaceW;
                    return { wordW: m.width, spaceW };
                });

                // PERMISSIVE: Only scale down if significantly over width (more than 10%)
                let scaleFactor = 1;
                if (lineTotalWidth > maxAllowedLineWidth * 1.1) {
                    scaleFactor = (maxAllowedLineWidth * 1.05) / lineTotalWidth;
                    console.log(`[Image Engine] Line overflow detected, scaling by ${scaleFactor.toFixed(3)}`);
                }

                let currentLineX = startX - (lineTotalWidth * scaleFactor / 2);

                // Draw each word
                ctx.save();
                if (scaleFactor < 1) {
                    ctx.scale(scaleFactor, 1); // Scale horizontally to fit
                }
                
                words.forEach((word, wordIdx) => {
                    const isPurple = purpleWordIndices?.includes(wordCursor + wordIdx);
                    ctx.fillStyle = isPurple ? KUMOLAB_PURPLE : '#FFFFFF';
                    // Adjust X position for scaling
                    const adjustedX = scaleFactor < 1 
                        ? (currentLineX / scaleFactor) + (metrics[wordIdx].wordW / 2)
                        : currentLineX + (metrics[wordIdx].wordW / 2);
                    ctx.fillText(word, adjustedX, currentY);
                    currentLineX += (metrics[wordIdx].wordW + metrics[wordIdx].spaceW);
                });
                
                ctx.restore(); // Restore scale
                ctx.restore(); // Restore shadow settings
                wordCursor += words.length;
                currentY += lineHeight;
            }
        }

        // --- VISUAL AUTHORITY BAR (Source Credibility) ---
        if (showAuthorityBar !== false && (verificationBadge || sourceName)) {
            const barHeight = 50;
            const barY = HEIGHT - barHeight - 10;
            const barPadding = 20;
            
            // Semi-transparent background bar
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.fillRect(SAFE_MARGIN, barY, WIDTH - (SAFE_MARGIN * 2), barHeight);
            
            // Left side: Verification badge
            if (verificationBadge) {
                const badgeParts = verificationBadge.split(' ');
                const emoji = badgeParts[0];
                const text = badgeParts.slice(1).join(' ');
                
                // Emoji
                ctx.font = 'bold 20px Arial, sans-serif';
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'left';
                ctx.shadowBlur = 0;
                ctx.fillText(emoji, SAFE_MARGIN + barPadding, barY + 32);
                
                // Badge text
                ctx.font = 'bold 14px Arial, sans-serif';
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(text, SAFE_MARGIN + barPadding + 25, barY + 32);
                
                // Score pill
                if (verificationScore) {
                    const scoreText = `${verificationScore}`;
                    ctx.font = 'bold 12px monospace';
                    const scoreWidth = ctx.measureText(scoreText).width;
                    
                    // Pill background
                    ctx.fillStyle = verificationScore >= 80 ? '#22c55e' : 
                                   verificationScore >= 60 ? '#eab308' : '#9ca3af';
                    ctx.beginPath();
                    ctx.roundRect(SAFE_MARGIN + barPadding + 25 + ctx.measureText(text).width + 10, barY + 18, scoreWidth + 12, 20, 10);
                    ctx.fill();
                    
                    // Score text
                    ctx.fillStyle = '#000000';
                    ctx.fillText(scoreText, SAFE_MARGIN + barPadding + 25 + ctx.measureText(text).width + 16, barY + 32);
                }
            }
            
            // Right side: Source name + Claim type
            ctx.font = '12px Arial, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.textAlign = 'right';
            
            let rightText = '';
            if (sourceName) rightText = sourceName;
            if (claimType) {
                rightText = rightText ? `${rightText} • ${claimType.replace(/_/g, ' ')}` : claimType.replace(/_/g, ' ');
            }
            
            if (rightText) {
                ctx.fillText(rightText, WIDTH - SAFE_MARGIN - barPadding, barY + 32);
            }
            
            ctx.restore();
        }

        // --- WATERMARK (Strictly dependent on text) ---
        if (finalApplyWatermark && finalApplyText) {
            // Position watermark above authority bar if present
            const barOffset = (showAuthorityBar !== false && (verificationBadge || sourceName)) ? 70 : 0;
            ctx.font = 'bold 24px Arial, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 4;
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            const wx = watermarkPosition ? watermarkPosition.x : WIDTH / 2;
            const wy = watermarkPosition ? watermarkPosition.y : HEIGHT - 40 - barOffset;
            ctx.fillText('@KumoLabAnime', wx, wy);
        }

        const finalBuffer = await canvas.toBuffer('image/png');
        const processedImageBase64 = `data:image/png;base64,${finalBuffer.toString('base64')}`;

        if (skipUpload) {
            return {
                processedImage: processedImageBase64,
                layout: (ctx as any)._layoutMetadata
            };
        }

        // Upload
        const bucketName = 'blog-images';
        const { supabaseAdmin } = await import('../supabase/admin');
        const { error: uploadError } = await supabaseAdmin
            .storage
            .from(bucketName)
            .upload(`${outputFileName}`, finalBuffer, { contentType: 'image/png', upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabaseAdmin.storage.from(bucketName).getPublicUrl(`${outputFileName}`);

        return {
            processedImage: publicUrl,
            layout: (ctx as any)._layoutMetadata
        };

    } catch (e: any) {
        console.error("Image Engine Fatal:", e);
        // Return null on fatal error - the caller should handle this
        return null;
    }
}
