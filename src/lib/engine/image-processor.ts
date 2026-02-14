/**
 * image-processor.ts
 * Implements the premium social-first aesthetic for KumoLab.
 * Format: 4:5 Portrait (1080x1350)
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Aesthetics
const KUMOLAB_PURPLE = '#9D7BFF'; // Vibrant Lavender/Purple from reference
const HANDLE_TEXT = '@KumoLabAnime';

// Ensure font availability
// Image-only imports
// (GlobalFonts imported dynamically)

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
}

export interface ImageProcessingResult {
    processedImage: string;
    layout: LayoutMetadata;
}

/**
 * Processes an image for the Intel Feed and Social Media.
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
}: IntelImageOptions & { skipUpload?: boolean }): Promise<ImageProcessingResult | null> {
    const outputDir = path.join(process.cwd(), 'public/blog/intel');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFileName = `${slug}-social.png`;

    const WIDTH = 1080;
    const HEIGHT = 1350;

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
        // Rule: If an image is extremely wide (panorama) or extremely tall (long-strip composite), it's unsafe.
        // Rule: Abort if aspect ratio is outside 0.6 to 2.0 range (Allows 16:9 banners), UNLESS bypassed.
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
        const availableWidth = WIDTH * 0.90;

        let titleLines: string[] = [];
        let headlineLines: string[] = [];
        let totalBlockHeight = 0;

        if (finalApplyText) {
            ctx.font = `900 135px "Outfit"`;
            titleLines = upperTitle.length > 0 ? wrapText(ctx, upperTitle, availableWidth, 20, 135) : [];
            headlineLines = cleanedHeadline.length > 0 ? wrapText(ctx, cleanedHeadline, availableWidth, 10, 135) : [];
            totalBlockHeight = (titleLines.length + headlineLines.length) * (135 * 0.92);
        }

        // --- GRADIENT LOGIC (Strictly dependent on Rendering) ---
        if (finalApplyGradient && finalApplyText && totalBlockHeight > 0) {
            const minGradH = 800;
            const gradientHeight = Math.max(totalBlockHeight + 500, minGradH);
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

        // --- DRAW TEXT ---
        if (finalApplyText && totalBlockHeight > 0) {
            const margin = 100; // Hard safety margin from canvas edges
            const zoneHeight = (HEIGHT * 0.35) - 40; // Reduced zone height for better padding
            const lineSpacingFactor = 1.05; // Less cramped spacing
            const requestedScale = Math.max(0.1, textScale);
            let finalFontSize = 120 * requestedScale; // Reduced base size to prevent 'oversized' feel
            let currentLineSpacing = finalFontSize * lineSpacingFactor;

            ctx.font = `900 ${finalFontSize}px "Outfit"`;
            let currentTitleLines = upperTitle.length > 0 ? wrapText(ctx, upperTitle, availableWidth, 20, finalFontSize) : [];
            let currentHeadlineLines = cleanedHeadline.length > 0 ? wrapText(ctx, cleanedHeadline, availableWidth, 10, finalFontSize) : [];
            let allLines = [...currentTitleLines, ...currentHeadlineLines];
            let titleLinesCount = currentTitleLines.length;
            let totalH = allLines.length * currentLineSpacing;

            if (allLines.length > 0 && (totalH > zoneHeight || titleLinesCount > 3) && !disableAutoScaling) {
                while ((totalH > zoneHeight || titleLinesCount > 3) && finalFontSize > 15) {
                    finalFontSize -= 2;
                    currentLineSpacing = finalFontSize * lineSpacingFactor;
                    ctx.font = `900 ${finalFontSize}px "Outfit"`;
                    const tLines = upperTitle.length > 0 ? wrapText(ctx, upperTitle, availableWidth, 20, finalFontSize) : [];
                    const hLines = cleanedHeadline.length > 0 ? wrapText(ctx, cleanedHeadline, availableWidth, 10, finalFontSize) : [];
                    allLines = [...tLines, ...hLines];
                    titleLinesCount = tLines.length;
                    totalH = allLines.length * currentLineSpacing;
                }
            }

            const zoneY = isTop ? (HEIGHT * 0.175) + 30 : HEIGHT - (HEIGHT * 0.175) - 30;
            const startX = WIDTH / 2;
            let centerCenterY = textPosition ? textPosition.y : zoneY;

            // Strict Margin Enforcement
            const minY = margin + (totalH / 2);
            const maxY = HEIGHT - margin - (totalH / 2);
            centerCenterY = Math.max(minY, Math.min(maxY, centerCenterY));

            const startY = centerCenterY - (totalH / 2);
            let currentY = startY + (finalFontSize * 0.85);

            (ctx as any)._layoutMetadata = {
                fontSize: finalFontSize,
                lineHeight: currentLineSpacing,
                y: startY,
                lines: allLines,
                finalScale: finalFontSize / 135,
                zone: isTop ? 'HEADER' : 'FOOTER',
                numLines: allLines.length,
                totalHeight: totalH
            };

            let wordCursor = 0;
            for (const line of allLines) {
                const words = line.split(/\s+/).filter(Boolean);
                ctx.save();
                ctx.font = `900 ${finalFontSize}px "Outfit"`;
                ctx.textAlign = 'center';

                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetY = 4;

                let lineTotalWidth = 0;
                const metrics = words.map((w, i) => {
                    const m = ctx.measureText(w);
                    const spaceW = (i < words.length - 1) ? ctx.measureText(' ').width : 0;
                    lineTotalWidth += m.width + spaceW;
                    return { wordW: m.width, spaceW };
                });

                let currentLineX = startX - (lineTotalWidth / 2);

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
                currentY += finalFontSize * 0.92;
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
