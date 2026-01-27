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
import { GlobalFonts } from '@napi-rs/canvas';
// We might not have a custom font file, so we rely on system fonts. 
// Adding a console log to debug what families are available if needed, 
// but for now, we'll use a very safe stack.
const FONT_STACK = 'Arial, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';

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
}

/**
 * Processes an image for the Intel Feed and Social Media.
 */
// ... (imports remain)

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
            // Fallback
            width = (currentLine.length + word.length + 1) * (currentFS * 0.5);
        }

        // Hard fallback if measureText returns 0
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
    watermarkPosition
}: IntelImageOptions & { skipUpload?: boolean }): Promise<string | null> {
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

        // --- FONT LOADING ---
        // Explicitly register font
        const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');
        let fontToUse = 'sans-serif';

        if (fs.existsSync(fontPath)) {
            try {
                // Register as distinct name to ensure we get exactly this file
                GlobalFonts.register(fs.readFileSync(fontPath), 'KumoLabMain');
                fontToUse = 'KumoLabMain';
                console.log('[Image Engine] Font "KumoLabMain" registered successfully.');
            } catch (fontErr) {
                console.warn('[Image Engine] Failed to register Outfit font:', fontErr);
            }
        } else {
            console.warn('[Image Engine] Outfit font file not found.');
        }

        const fullFontStack = `"${fontToUse}", sans-serif`;

        // Helper for reliable measurement
        const safeMeasure = (t: string, currentFontSize: number) => {
            if (!t) return 0;
            const m = ctx.measureText(t);
            return (m && m.width > 0) ? m.width : (t.length * currentFontSize * 0.5);
        };

        // ... existing code ... Note: I need to skip the drawing parts to get to the loop

        // [Assuming the middle part of the file is unchanged, jumping to the loop modification]
        // Wait, replace_file_content needs contiguous block. 
        // I will target the Font Loading block first, then the loop separately? 
        // Or I can do it in one go if I include the drawing logic.
        // The file content I viewed shows lines 100-300.
        // Let's do a multi-replace.


        // 2. Download source
        let buffer: Buffer;

        if (sourceUrl.startsWith('http')) {
            try {
                const response = await fetch(sourceUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                buffer = Buffer.from(await response.arrayBuffer());
            } catch (fetchErr) {
                const fallbackPath = path.join(process.cwd(), 'public/hero-bg-final.png');
                buffer = fs.existsSync(fallbackPath)
                    ? fs.readFileSync(fallbackPath)
                    : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
            }
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


        // Draw Image - LEGACY SCALING LOGIC (Reverted for stability)
        const img = await loadImage(buffer);
        const imgRatio = img.width / img.height;
        const canvasRatio = WIDTH / HEIGHT;

        let drawWidth, drawHeight;

        // If image is "wider" than canvas (e.g. 16:9 vs 4:5), fit Hight
        if (imgRatio > canvasRatio) {
            drawHeight = HEIGHT * scale;
            drawWidth = drawHeight * imgRatio;
        } else {
            // If image is "taller" (or equal), fit Width
            drawWidth = WIDTH * scale;
            drawHeight = drawWidth / imgRatio; // Aspect correct
        }

        // Center + Offset
        // Frontend sends normalized position (percentage of canvas), so multiply by WIDTH/HEIGHT
        const dx = (WIDTH - drawWidth) / 2 + (position.x * WIDTH);
        const dy = (HEIGHT - drawHeight) / 2 + (position.y * HEIGHT);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

        const isTop = gradientPosition === 'top';

        // 5. Typography Setup
        const availableWidth = WIDTH * 0.90; // Standard intentional safe margin
        let cleanedHeadline = (headline || '').toUpperCase().trim();
        const upperTitle = (animeTitle || '').toUpperCase().trim();

        // REDUNDANCY CHECK: Simple deduplication
        // If headline is "3RD SEASON CONFIRMED" and title is "VENDING MACHINE SEASON 3"
        const titleWords = upperTitle.split(/\s+/);
        const headlineWords = cleanedHeadline.split(/\s+/);

        // If headline is almost entirely in title, or vice-versa, simplify
        // Higher sensitivity: if ANY word over 3 chars overlaps, and we have few words, clear it.
        const intersection = headlineWords.filter(w => titleWords.includes(w) && w.length > 3);
        const isHighlyRedundant = intersection.length >= 2 ||
            (cleanedHeadline.length > 0 && upperTitle.includes(cleanedHeadline)) ||
            (intersection.length >= 1 && (titleWords.includes('CONFIRMED') || titleWords.includes('SEASON')));

        if (isHighlyRedundant) {
            console.log(`[Image Engine] Redundant headline detected ("${cleanedHeadline}" vs "${upperTitle}"). Clearing headline.`);
            cleanedHeadline = '';
        }

        let globalFontSize = 135; // Lower start to force 3+ words per line
        let titleLines: string[] = [];
        let headlineLines: string[] = [];
        let lineSpacing = 0;
        let totalBlockHeight = 0;

        // Iterative Sizing
        while (globalFontSize >= 45) {
            const currentFS = globalFontSize * textScale;
            ctx.font = `900 ${currentFS}px ${fullFontStack}`;
            // Refined spacing (92% of font size) for balanced editorial look
            lineSpacing = currentFS * 0.92;

            titleLines = upperTitle.length > 0 ? wrapText(ctx, upperTitle, availableWidth, 6, currentFS) : [];
            headlineLines = cleanedHeadline.length > 0 ? wrapText(ctx, cleanedHeadline, availableWidth, 6, currentFS) : [];

            totalBlockHeight = (titleLines.length + headlineLines.length) * lineSpacing;

            // STRICT 25% COVERAGE LIMIT (Forces smaller font, more words per line)
            if (totalBlockHeight <= (HEIGHT * 0.25)) break;
            globalFontSize -= 5;
        }

        // FAILSAFE
        if (headlineLines.length === 0 && cleanedHeadline.length > 0) {
            headlineLines = [cleanedHeadline.substring(0, 50)];
        }

        // 6. Draw Gradient - CORRECTED SEAMLESS
        if (applyGradient) {
            // We use a fixed height for consistency, or dynamic based on text.
            // To avoid "visible line", we start the gradient well above the text.
            // And we use a "dead zone" of 0 opacity at the start.

            const minGradH = 900;
            const gradientHeight = Math.max(totalBlockHeight + 500, minGradH);

            const gradY = isTop ? 0 : HEIGHT - gradientHeight;
            const gradient = ctx.createLinearGradient(0, gradY, 0, isTop ? gradientHeight : HEIGHT);

            if (isTop) {
                gradient.addColorStop(0, 'rgba(0,0,0,0.95)');
                gradient.addColorStop(0.4, 'rgba(0,0,0,0.6)');
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
            } else {
                // SEAMLESS SCRIM CURVE
                // 0.0 - 0.2: Pure Transparent Dead Zone (Safety Buffer)
                gradient.addColorStop(0, 'rgba(0,0,0,0)');
                gradient.addColorStop(0.15, 'rgba(0,0,0,0)');

                // 0.2 - 1.0: The actual gradient
                gradient.addColorStop(0.25, 'rgba(0,0,0,0.03)'); // Soft entry
                gradient.addColorStop(0.4, 'rgba(0,0,0,0.2)');
                gradient.addColorStop(0.6, 'rgba(0,0,0,0.6)');
                gradient.addColorStop(0.85, 'rgba(0,0,0,0.95)');
                gradient.addColorStop(1, 'rgba(0,0,0,1)');
            }

            ctx.save();
            ctx.fillStyle = gradient;
            // We fill the strict rect defined by gradY
            // Since 0.0 -> 0.15 is transparent, the "top line" at gradY is invisible.
            ctx.fillRect(0, gradY, WIDTH, gradientHeight);
            ctx.restore();
        }

        // 7. Draw Text
        if (applyText && (headlineLines.length > 0 || titleLines.length > 0)) {
            const finalFontSize = Math.max(40, globalFontSize * textScale);

            const totalH = (headlineLines.length + titleLines.length) * (finalFontSize * 0.92);

            // --- STRICT 25% UTILIZATION ZONE ---
            const zoneHeight = HEIGHT * 0.25;
            const bottomSafeMargin = 100;
            let defaultY = 0;

            if (isTop) {
                // Inset from top
                defaultY = 80 + (zoneHeight - totalH) / 2 + (finalFontSize * 0.85);
            } else {
                // Anchored to bottom safe zone
                const zoneStart = HEIGHT - zoneHeight - bottomSafeMargin;
                defaultY = zoneStart + (zoneHeight - totalH) / 2 + (finalFontSize * 0.85);
            }

            const startX = (textPosition && !isNaN(Number(textPosition.x))) ? Number(textPosition.x) : WIDTH / 2;
            const startY = (textPosition && !isNaN(Number(textPosition.y))) ? Number(textPosition.y) : defaultY;

            let currentY = startY;
            const allLines = [...titleLines, ...headlineLines];
            let wordCursor = 0;

            for (const line of allLines) {
                const words = line.split(/\s+/).filter(Boolean);

                ctx.save();
                ctx.font = `900 ${finalFontSize}px ${fullFontStack}`;
                ctx.textAlign = 'center';

                // Calculate word metrics for purple highlighting
                let lineTotalWidth = 0;
                const metrics = words.map((w, i) => {
                    const m = ctx.measureText(w);
                    const spaceW = (i < words.length - 1) ? ctx.measureText(' ').width : 0;
                    lineTotalWidth += m.width + spaceW;
                    return { wordW: m.width, spaceW };
                });

                let currentX = startX - (lineTotalWidth / 2);

                words.forEach((word, wordIdx) => {
                    const isPurple = purpleWordIndices?.includes(wordCursor + wordIdx);
                    ctx.save();

                    // SUBTLE PREMIUM SHADOW
                    ctx.shadowColor = 'rgba(0,0,0,0.6)';
                    ctx.shadowBlur = 12;
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;

                    ctx.fillStyle = isPurple ? '#9D7BFF' : '#FFFFFF';
                    ctx.fillText(word, currentX + (metrics[wordIdx].wordW / 2), currentY);
                    ctx.restore();
                    currentX += metrics[wordIdx].wordW + metrics[wordIdx].spaceW;
                });

                ctx.restore();
                wordCursor += words.length;
                currentY += finalFontSize * 0.92; // Consistent spacing
            }
        }

        // Watermark
        if (applyWatermark) {
            ctx.font = 'bold 24px Arial, sans-serif'; // Crisp, small font
            ctx.fillStyle = 'rgba(255,255,255,0.7)'; // Slightly more visible for clarity
            ctx.textAlign = 'center';
            ctx.shadowBlur = 4;
            ctx.shadowColor = "rgba(0,0,0,0.8)";

            const wx = watermarkPosition ? watermarkPosition.x : WIDTH / 2;
            const wy = watermarkPosition ? watermarkPosition.y : HEIGHT - 40;

            ctx.fillText('@KumoLabAnime', wx, wy);
        }

        const finalBuffer = await canvas.toBuffer('image/png');
        if (skipUpload) {
            return `data:image/png;base64,${finalBuffer.toString('base64')}`;
        }

        // Upload Logic (omitted for brevity in this replace, assuming only used for Preview here mostly)
        // Re-implement basic upload if needed, but the route usually skips upload for preview.
        const bucketName = 'blog-images';
        const { supabaseAdmin } = await import('../supabase/admin');
        const { error: uploadError } = await supabaseAdmin
            .storage
            .from(bucketName)
            .upload(`${outputFileName}`, finalBuffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabaseAdmin
            .storage
            .from(bucketName)
            .getPublicUrl(`${outputFileName}`);

        return publicUrl;

    } catch (e: any) {
        console.error("Image Engine Fatal:", e);
        // Fallback Error Image
        // ... (simplified error image)
        return null;
    }
}
