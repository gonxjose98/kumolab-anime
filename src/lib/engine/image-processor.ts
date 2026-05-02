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
    // Per-element scale + nudge. titleScale/captionScale supersede textScale
    // when provided. titleOffset/captionOffset are pixel deltas applied on
    // top of the auto-centered position for that element. watermarkPosition
    // is an absolute (x, y) — pass null/undefined for auto-bottom-center.
    titleScale?: number;
    captionScale?: number;
    titleOffset?: { x: number; y: number };
    captionOffset?: { x: number; y: number };
    gradientPosition?: 'top' | 'bottom';
    // Multiplier on every gradient alpha stop (default 1). <1 softens the
    // fade, >1 hardens it. Clamped to [0.2, 1.6] inside the renderer; final
    // alpha is also clamped to ≤1 so a "harden" past 1 just flattens stops.
    gradientStrength?: number;
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
    textScale,
    titleScale,
    captionScale,
    titleOffset,
    captionOffset,
    gradientPosition,
    gradientStrength,
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

        // Default each overlay to whether the source is CLEAN.
        let finalApplyText = derivedClassification === 'CLEAN';
        let finalApplyGradient = derivedClassification === 'CLEAN';
        let finalApplyWatermark = derivedClassification === 'CLEAN';

        // USER MANUAL OVERRIDE — when the caller passes an explicit boolean
        // for any of these flags, that boolean wins. Each is independent.
        // (Pre-fix: only applyText was wired; gradient and watermark
        // overrides from the editor were silently ignored, so toggling
        // them did nothing.)
        if (typeof applyText === 'boolean') finalApplyText = applyText;
        if (typeof applyGradient === 'boolean') finalApplyGradient = applyGradient;
        if (typeof applyWatermark === 'boolean') finalApplyWatermark = applyWatermark;

        // Editor toggles are now INDEPENDENT — gradient and watermark no
        // longer cascade off when text is off. The user gets exactly what
        // they toggle on. (Old behavior coupled them; that contradicted the
        // editor UX where each toggle is its own choice.)

        // --- CLEAN TEXT PRE-VALIDATION ---
        let cleanedHeadline = (headline || '').toUpperCase().trim().replace(/[—–‒―]/g, '-');
        const upperTitle = (animeTitle || '').toUpperCase().trim().replace(/[—–‒―]/g, '-');

        // Deduplication
        if (cleanedHeadline === upperTitle && upperTitle.length > 0) cleanedHeadline = '';
        if (cleanedHeadline.includes('TRENDING')) cleanedHeadline = '';

        const hasActualText = (upperTitle.length > 0 || cleanedHeadline.length > 0);

        // If text is requested but there's nothing to render, only kill text
        // — leave gradient/watermark to their own toggles.
        if (!hasActualText) {
            finalApplyText = false;
        }

        // --- SAFE ZONE DETECTION ---
        // If the caller explicitly chose top/bottom, we honor it. The
        // entropy auto-pick only runs when the caller passed nothing — that
        // way the editor's toggle is never silently overridden (which is
        // what was happening before: user picks "top" but text is on, so
        // the entropy block reassigned it to "bottom" and the toggle did
        // nothing).
        let finalGradientPosition: 'top' | 'bottom' = gradientPosition ?? 'bottom';
        if (gradientPosition === undefined && finalApplyText && !textPosition) {
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
            // Cheap pre-measure so the gradient can be sized to fit. Real
            // measure + draw happens later with the per-element font sizes.
            ctx.font = `900 135px "Outfit"`;
            titleLines = upperTitle.length > 0 ? wrapText(ctx, upperTitle, availableWidth, 20, 135) : [];
            headlineLines = cleanedHeadline.length > 0 ? wrapText(ctx, cleanedHeadline, availableWidth, 10, 135) : [];
            totalBlockHeight = (titleLines.length + headlineLines.length) * (135 * 0.92);
        }

        // --- GRADIENT LOGIC (independent toggle) ---
        // Renders even without text. Sizes off text block when text is on,
        // otherwise uses a fixed 600px fade — typical bottom shade for a
        // clean visual.
        if (finalApplyGradient) {
            const minGradH = 800;
            const gradientHeight = totalBlockHeight > 0
                ? Math.max(totalBlockHeight + 500, minGradH)
                : 600;
            const gradY = isTop ? 0 : HEIGHT - gradientHeight;
            const gradient = ctx.createLinearGradient(0, gradY, 0, isTop ? gradientHeight : HEIGHT);

            // Strength multiplies each stop's alpha. Soft = fade barely
            // tints, hard = nearly solid black. Stop alpha capped at 1.
            const k = Math.max(0.2, Math.min(1.6, gradientStrength ?? 1));
            const a = (v: number) => `rgba(0,0,0,${Math.max(0, Math.min(1, v * k)).toFixed(3)})`;

            if (isTop) {
                gradient.addColorStop(0, a(0.95));
                gradient.addColorStop(0.4, a(0.6));
                gradient.addColorStop(1, a(0));
            } else {
                gradient.addColorStop(0, a(0));
                gradient.addColorStop(0.4, a(0.2));
                gradient.addColorStop(0.6, a(0.6));
                gradient.addColorStop(0.85, a(0.95));
                gradient.addColorStop(1, a(1));
            }

            ctx.save();
            ctx.fillStyle = gradient;
            ctx.fillRect(0, gradY, WIDTH, gradientHeight);
            ctx.restore();
        }

        // --- DRAW TEXT ---
        if (finalApplyText && totalBlockHeight > 0) {
            const margin = 100;
            const zoneHeight = (HEIGHT * 0.35) - 40;
            const lineSpacingFactor = 1.05;
            const baseFontSize = 120;

            // Resolve scales. Per-element scales win; falling back to legacy
            // textScale (so older callers still work). Default caption is
            // 55% of title — visible but not shouty, per Jose's note that
            // caption should be smaller than title by default.
            const tScale = Math.max(0.1, titleScale ?? textScale ?? 1);
            const cScale = Math.max(0.1, captionScale ?? (textScale != null ? textScale * 0.55 : 0.55));

            let titleFS = baseFontSize * tScale;
            let captionFS = baseFontSize * cScale;

            const measureBlock = (tFS: number, cFS: number) => {
                ctx.font = `900 ${tFS}px "Outfit"`;
                const tLines = upperTitle.length > 0 ? wrapText(ctx, upperTitle, availableWidth, 20, tFS) : [];
                ctx.font = `900 ${cFS}px "Outfit"`;
                const cLines = cleanedHeadline.length > 0 ? wrapText(ctx, cleanedHeadline, availableWidth, 10, cFS) : [];
                const tH = tLines.length * (tFS * lineSpacingFactor);
                const cH = cLines.length * (cFS * lineSpacingFactor);
                const gap = (tLines.length > 0 && cLines.length > 0) ? cFS * 0.4 : 0;
                return { tLines, cLines, tH, cH, gap, total: tH + gap + cH };
            };

            let m = measureBlock(titleFS, captionFS);

            // Auto-shrink: scale both blocks down proportionally until the
            // combined height fits the zone (or title line count drops to
            // ≤3). Disabled when caller asks for fixed sizing.
            if (!disableAutoScaling && (m.total > zoneHeight || m.tLines.length > 3)) {
                let shrink = 1;
                while ((m.total > zoneHeight || m.tLines.length > 3) && titleFS > 15) {
                    shrink -= 0.02;
                    titleFS = baseFontSize * tScale * shrink;
                    captionFS = baseFontSize * cScale * shrink;
                    m = measureBlock(titleFS, captionFS);
                }
            }

            const zoneY = isTop ? (HEIGHT * 0.175) + 30 : HEIGHT - (HEIGHT * 0.175) - 30;
            const startX = WIDTH / 2;
            let centerCenterY = textPosition ? textPosition.y : zoneY;

            const minY = margin + (m.total / 2);
            const maxY = HEIGHT - margin - (m.total / 2);
            centerCenterY = Math.max(minY, Math.min(maxY, centerCenterY));

            const blockTop = centerCenterY - (m.total / 2);

            (ctx as any)._layoutMetadata = {
                fontSize: titleFS,
                lineHeight: titleFS * lineSpacingFactor,
                y: blockTop,
                lines: [...m.tLines, ...m.cLines],
                finalScale: titleFS / 135,
                zone: isTop ? 'HEADER' : 'FOOTER',
                numLines: m.tLines.length + m.cLines.length,
                totalHeight: m.total
            };

            const drawLines = (
                lines: string[],
                fontSize: number,
                centerX: number,
                firstBaselineY: number,
                wordCursorStart: number,
            ): number => {
                let wc = wordCursorStart;
                let y = firstBaselineY;
                ctx.save();
                ctx.font = `900 ${fontSize}px "Outfit"`;
                ctx.textAlign = 'center';
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetY = 4;
                for (const line of lines) {
                    const words = line.split(/\s+/).filter(Boolean);
                    let lineTotalWidth = 0;
                    const metrics = words.map((w, i) => {
                        const mw = ctx.measureText(w);
                        const spaceW = (i < words.length - 1) ? ctx.measureText(' ').width : 0;
                        lineTotalWidth += mw.width + spaceW;
                        return { wordW: mw.width, spaceW };
                    });
                    let xCursor = centerX - (lineTotalWidth / 2);
                    words.forEach((word, idx) => {
                        const isPurple = purpleWordIndices?.includes(wc + idx);
                        ctx.save();
                        ctx.fillStyle = isPurple ? KUMOLAB_PURPLE : '#FFFFFF';
                        ctx.fillText(word, xCursor + (metrics[idx].wordW / 2), y);
                        ctx.restore();
                        xCursor += metrics[idx].wordW + metrics[idx].spaceW;
                    });
                    wc += words.length;
                    y += fontSize * lineSpacingFactor;
                }
                ctx.restore();
                return wc;
            };

            // Title block: top of combined block + nudge offsets.
            const titleX = startX + (titleOffset?.x ?? 0);
            const titleBaselineY = blockTop + (titleFS * 0.85) + (titleOffset?.y ?? 0);
            const cursorAfterTitle = m.tLines.length > 0
                ? drawLines(m.tLines, titleFS, titleX, titleBaselineY, 0)
                : 0;

            // Caption block: starts after title block + gap + nudge offsets.
            // Independent from title's nudge — moving title up does not
            // drag caption with it.
            const captionX = startX + (captionOffset?.x ?? 0);
            const captionBaselineY = blockTop + m.tH + m.gap + (captionFS * 0.85) + (captionOffset?.y ?? 0);
            if (m.cLines.length > 0) {
                drawLines(m.cLines, captionFS, captionX, captionBaselineY, cursorAfterTitle);
            }
        }

        // --- WATERMARK (independent toggle) ---
        // Stroked + filled with a heavier shadow so the mark survives bright
        // YouTube thumbnails. The previous 70% white + 4px shadow was
        // disappearing on light backgrounds — the toggle was firing, the
        // text was just invisible.
        if (finalApplyWatermark) {
            const wx = watermarkPosition ? watermarkPosition.x : WIDTH / 2;
            const wy = watermarkPosition ? watermarkPosition.y : HEIGHT - 50;
            ctx.save();
            ctx.font = 'bold 30px "Outfit", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.95)';
            ctx.shadowBlur = 14;
            ctx.shadowOffsetY = 2;
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0,0,0,0.65)';
            ctx.strokeText(HANDLE_TEXT, wx, wy);
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.fillText(HANDLE_TEXT, wx, wy);
            ctx.restore();
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
