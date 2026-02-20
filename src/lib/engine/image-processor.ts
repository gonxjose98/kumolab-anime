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
const SAFE_MARGIN = 15; // Pixels from edges - TIGHT margins for content-focused look
const BASE_FONT_SIZE = 120;
const MIN_FONT_SIZE = 32; // Increased minimum for better readability
const MAX_FONT_SIZE = 180; // Increased maximum for large text
const LINE_HEIGHT_FACTOR = 0.90; // Tighter line height for dense look

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
}

export interface ImageProcessingResult {
    processedImage: string;
    layout: LayoutMetadata;
}

/**
 * Wraps text into lines based on max width and max lines
 */
function wrapText(ctx: any, text: string, maxWidth: number, maxLines: number, currentFS: number): string[] {
    if (!text || !text.trim()) return [];
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];

        let width = 0;
        try {
            width = ctx.measureText(currentLine + " " + word).width;
        } catch {
            width = 0;
        }

        // Hard fallback if measureText returns 0 or fails
        if (width === 0) width = (currentLine.length + word.length + 1) * (currentFS * 0.5);

        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines.slice(0, maxLines || 10);
}

/**
 * Calculates optimal font size to FILL the layout zone aggressively
 * Target: Large, prominent text that fills available space like editorial design
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
    const charCount = combinedText.length;
    
    // AGGRESSIVE INITIAL SIZE: Estimate based on character density
    // More characters = smaller starting size, but aim to fill space
    // Target: ~20-25 chars per line at optimal size
    const estimatedLines = Math.max(2, Math.ceil(charCount / 22));
    const targetFontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, 
        (zoneHeight * 0.95) / (estimatedLines * LINE_HEIGHT_FACTOR)
    ));
    
    let fontSize = Math.round(targetFontSize * requestedScale);
    fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSize));
    let lineHeight = fontSize * LINE_HEIGHT_FACTOR;
    
    // Initial text wrapping
    ctx.font = `900 ${fontSize}px "Outfit"`;
    let titleLines = title.length > 0 ? wrapText(ctx, title, availableWidth, 20, fontSize) : [];
    let headlineLines = headline.length > 0 ? wrapText(ctx, headline, availableWidth, 10, fontSize) : [];
    let allLines = [...titleLines, ...headlineLines];
    let totalHeight = allLines.length * lineHeight;
    
    // PHASE 1: Shrink if overflowing (must fit in zone)
    if (!disableAutoScaling && allLines.length > 0) {
        while (totalHeight > zoneHeight && fontSize > MIN_FONT_SIZE) {
            fontSize = Math.max(MIN_FONT_SIZE, fontSize - 3);
            lineHeight = fontSize * LINE_HEIGHT_FACTOR;
            ctx.font = `900 ${fontSize}px "Outfit"`;
            titleLines = title.length > 0 ? wrapText(ctx, title, availableWidth, 20, fontSize) : [];
            headlineLines = headline.length > 0 ? wrapText(ctx, headline, availableWidth, 10, fontSize) : [];
            allLines = [...titleLines, ...headlineLines];
            totalHeight = allLines.length * lineHeight;
        }
        
        // PHASE 2: AGGRESSIVELY grow to fill space (target 95% utilization)
        // Keep growing as long as we have room and hit max size
        let iterations = 0;
        const maxIterations = 50; // Prevent infinite loops
        
        while (totalHeight < zoneHeight * 0.95 && fontSize < MAX_FONT_SIZE && iterations < maxIterations) {
            const testFontSize = Math.min(MAX_FONT_SIZE, fontSize + 3);
            const testLineHeight = testFontSize * LINE_HEIGHT_FACTOR;
            ctx.font = `900 ${testFontSize}px "Outfit"`;
            const testTitleLines = title.length > 0 ? wrapText(ctx, title, availableWidth, 20, testFontSize) : [];
            const testHeadlineLines = headline.length > 0 ? wrapText(ctx, headline, availableWidth, 10, testFontSize) : [];
            const testAllLines = [...testTitleLines, ...testHeadlineLines];
            const testTotalHeight = testAllLines.length * testLineHeight;
            
            // Accept if it fits with tight margin
            if (testTotalHeight <= zoneHeight * 0.98) {
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
        
        console.log(`[Image Engine] Auto-scale result: ${fontSize}px, ${allLines.length} lines, ${(totalHeight/zoneHeight*100).toFixed(1)}% zone fill`);
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

        // --- BUCKET-BASED DECISION LOGIC (RAW IMAGE MODE) ---
        const isPortraitPoster = imgRatio < 0.85;
        const derivedClassification = classification || (isPortraitPoster ? 'TEXT_HEAVY' : 'CLEAN');

        let finalApplyText = derivedClassification === 'CLEAN';
        let finalApplyGradient = derivedClassification === 'CLEAN';
        let finalApplyWatermark = derivedClassification === 'CLEAN';

        // USER MANUAL OVERRIDE
        if (applyText === false) {
            finalApplyText = false;
        } else if (applyText === true && derivedClassification === 'CLEAN') {
            finalApplyText = true;
        }

        // HARD CONTRACT: TEXT_HEAVY -> RAW IMAGE MODE (NO OVERLAYS)
        if (derivedClassification === 'TEXT_HEAVY') {
            finalApplyText = false;
            finalApplyGradient = false;
            finalApplyWatermark = false;
        }

        // REVALIDATION: If hasText is false (either derived or forced), all overlays MUST BE ZERO
        if (!finalApplyText) {
            finalApplyGradient = false;
            finalApplyWatermark = false;
        }

        // --- CLEAN TEXT PRE-VALIDATION ---
        let cleanedHeadline = (headline || '').toUpperCase().trim().replace(/[—–‒―]/g, '-');
        const upperTitle = (animeTitle || '').toUpperCase().trim().replace(/[—–‒―]/g, '-');

        // Deduplication
        if (cleanedHeadline === upperTitle && upperTitle.length > 0) cleanedHeadline = '';
        if (cleanedHeadline.includes('TRENDING')) cleanedHeadline = '';

        const hasActualText = (upperTitle.length > 0 || cleanedHeadline.length > 0);

        // HARD CONTRACT: No text = No visual treatments.
        if (!finalApplyText || !hasActualText) {
            finalApplyText = false;
            finalApplyGradient = false;
            finalApplyWatermark = false;
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

                let currentLineX = startX - (lineTotalWidth / 2);

                // Draw each word
                words.forEach((word, wordIdx) => {
                    const isPurple = purpleWordIndices?.includes(wordCursor + wordIdx);
                    ctx.save();
                    ctx.fillStyle = isPurple ? KUMOLAB_PURPLE : '#FFFFFF';
                    ctx.fillText(word, currentLineX + (metrics[wordIdx].wordW / 2), currentY);
                    ctx.restore();
                    currentLineX += metrics[wordIdx].wordW + metrics[wordIdx].spaceW;
                });

                ctx.restore();
                wordCursor += words.length;
                currentY += lineHeight;
            }
        }

        // --- WATERMARK (Strictly dependent on text) ---
        if (finalApplyWatermark && finalApplyText) {
            ctx.font = 'bold 24px Arial, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 4;
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            const wx = watermarkPosition ? watermarkPosition.x : WIDTH / 2;
            const wy = watermarkPosition ? watermarkPosition.y : HEIGHT - 40;
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
        return null;
    }
}
