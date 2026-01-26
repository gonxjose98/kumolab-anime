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
        let fontToUse = 'sans-serif';
        // Explicitly register font
        const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');
        if (fs.existsSync(fontPath)) {
            try {
                GlobalFonts.register(fs.readFileSync(fontPath), 'Outfit');
                fontToUse = 'Outfit';
                console.log('[Image Engine] Font "Outfit" registered successfully.');
            } catch (fontErr) {
                console.warn('[Image Engine] Failed to register Outfit font:', fontErr);
            }
        } else {
            console.warn('[Image Engine] Outfit font file not found.');
        }

        const fullFontStack = `${fontToUse}, sans-serif`;

        // Helper for reliable measurement
        const safeMeasure = (t: string, currentFontSize: number) => {
            if (!t) return 0;
            const m = ctx.measureText(t);
            return (m && m.width > 0) ? m.width : (t.length * currentFontSize * 0.5);
        };

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


        // Draw Image - CORRECTED OBJECT-COVER LOGIC
        const img = await loadImage(buffer);

        // "object-cover" math:
        // Scale so that BOTH dimensions are >= canvas dimensions.
        // Use the LARGER of the two required scale factors.
        // (WIDTH / img.width) vs (HEIGHT / img.height)
        const scaleX = WIDTH / img.width;
        const scaleY = HEIGHT / img.height;
        const coverScale = Math.max(scaleX, scaleY); // Coverage Base Scale

        // Apply User Zoom (scale param)
        const finalScale = coverScale * scale;

        const drawWidth = img.width * finalScale;
        const drawHeight = img.height * finalScale;

        // Center the image by default (offset = difference / 2)
        // Then apply User Translation (position param)
        // NOTE: PostManager sends pixels.
        // We assume position.x and y are in "canvas-equivalent pixels" relative to the preview.
        // If the preview is 1080px wide (unlikely), it maps 1:1. 
        // If standard drag controls, we treat '1' as '1 pixel'.
        // REMOVED `* WIDTH` which was causing massive offsets.
        const dx = (WIDTH - drawWidth) / 2 + (position.x);
        const dy = (HEIGHT - drawHeight) / 2 + (position.y);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

        const isTop = gradientPosition === 'top';

        // 5. Typography Setup
        const availableWidth = WIDTH * 0.90;
        let cleanedHeadline = (headline || '').toUpperCase().trim();

        let globalFontSize = 130;
        let titleLines: string[] = [];
        let headlineLines: string[] = [];
        let lineSpacing = 0;
        let totalBlockHeight = 0;

        // Iterative Sizing
        while (globalFontSize >= 45) {
            const currentFS = globalFontSize * textScale;
            ctx.font = `bold ${currentFS}px ${fullFontStack}`;
            lineSpacing = currentFS * 0.95;

            titleLines = (animeTitle || '').trim().length > 0 ? wrapText(ctx, (animeTitle || '').toUpperCase(), availableWidth, 6, currentFS) : [];
            headlineLines = cleanedHeadline.length > 0 ? wrapText(ctx, cleanedHeadline, availableWidth, 6, currentFS) : [];

            totalBlockHeight = (titleLines.length + headlineLines.length) * lineSpacing;

            if (totalBlockHeight < (HEIGHT * 0.45)) break;
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

            const totalH = (headlineLines.length + titleLines.length) * (finalFontSize * 0.95);
            const defaultY = isTop ? 120 : HEIGHT - totalH - 120;

            const startX = (textPosition && !isNaN(Number(textPosition.x))) ? Number(textPosition.x) : WIDTH / 2;
            const startY = (textPosition && !isNaN(Number(textPosition.y))) ? Number(textPosition.y) : defaultY;

            let currentY = startY;
            const allLines = [...titleLines, ...headlineLines];
            let wordCursor = 0;

            for (const line of allLines) {
                const words = line.split(/\s+/).filter(Boolean);
                let lineWidth = 0;
                const metrics = words.map(w => {
                    ctx.font = `bold ${finalFontSize}px ${fullFontStack}`;
                    const wVal = safeMeasure(w + " ", finalFontSize);
                    lineWidth += wVal;
                    return wVal;
                });

                let currentX = startX - (lineWidth / 2);

                words.forEach((word, idx) => {
                    const isPurple = purpleWordIndices?.includes(wordCursor + idx);
                    ctx.save();
                    ctx.font = `bold ${finalFontSize}px ${fullFontStack}`;
                    ctx.textAlign = 'left';
                    ctx.fillStyle = isPurple ? '#9D7BFF' : '#FFFFFF';
                    // Text Shadow for pop
                    ctx.shadowColor = 'rgba(0,0,0,0.8)';
                    ctx.shadowBlur = 10;
                    ctx.shadowOffsetY = 4;
                    ctx.fillText(word, currentX, currentY);
                    ctx.restore();
                    currentX += metrics[idx];
                });

                wordCursor += words.length;
                currentY += finalFontSize * 0.95;
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
