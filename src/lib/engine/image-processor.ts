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
}

/**
 * Processes an image for the Intel Feed and Social Media.
 */
// ... (imports remain)

function wrapText(ctx: any, text: string, maxWidth: number, maxLines: number): string[] {
    if (!text || !text.trim()) return [];
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;

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
    purpleWordIndices
}: IntelImageOptions & { skipUpload?: boolean }): Promise<string | null> {
    const outputDir = path.join(process.cwd(), 'public/blog/intel');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFileName = `${slug}-social.png`;

    const WIDTH = 1080;
    const HEIGHT = 1350;

    try {
        const { createCanvas, loadImage, GlobalFonts } = await import('@napi-rs/canvas');

        // Font Registration Strategy
        let fontToUse = 'Arial, sans-serif';
        const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');

        try {
            if (!GlobalFonts.has('Outfit')) {
                if (fs.existsSync(fontPath)) {
                    GlobalFonts.registerFromPath(fontPath, 'Outfit');
                    fontToUse = 'Outfit, Arial, sans-serif';
                }
            } else {
                fontToUse = 'Outfit, Arial, sans-serif';
            }
        } catch (e) {
            console.warn('[Image Engine] Font registration warning, using system:', e);
        }

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

        // Draw Image
        const img = await loadImage(buffer);
        const imgRatio = img.width / img.height;
        const canvasRatio = WIDTH / HEIGHT;

        let drawWidth, drawHeight;

        if (imgRatio > canvasRatio) {
            drawHeight = HEIGHT * scale;
            drawWidth = drawHeight * imgRatio;
        } else {
            drawWidth = WIDTH * scale;
            drawHeight = drawWidth / imgRatio;
        }

        const dx = (WIDTH - drawWidth) / 2 + (position.x * WIDTH);
        const dy = (HEIGHT - drawHeight) / 2 + (position.y * HEIGHT);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

        const isTop = gradientPosition === 'top';

        // 5. Typography
        const availableWidth = WIDTH * 0.90;
        let cleanedHeadline = (headline || '').toUpperCase().trim();

        let globalFontSize = 130;
        let titleLines: string[] = [];
        let headlineLines: string[] = [];
        let lineSpacing = 0;
        let totalBlockHeight = 0;

        // Iterative Sizing
        while (globalFontSize >= 40) {
            const currentFS = globalFontSize * textScale;
            ctx.font = `bold ${currentFS}px ${fontToUse}`;
            lineSpacing = currentFS * 0.95;

            titleLines = (animeTitle || '').trim().length > 0 ? wrapText(ctx, (animeTitle || '').toUpperCase(), availableWidth, 6) : [];
            headlineLines = cleanedHeadline.length > 0 ? wrapText(ctx, cleanedHeadline, availableWidth, 6) : [];

            totalBlockHeight = (titleLines.length + headlineLines.length) * lineSpacing;

            // If it fits roughly in 40% of screen, good.
            if (totalBlockHeight < (HEIGHT * 0.45)) break;
            globalFontSize -= 5;
        }

        // FAILSAFE: If wrapping somehow returned empty but we have text, force it.
        if (headlineLines.length === 0 && cleanedHeadline.length > 0) {
            headlineLines = [cleanedHeadline];
        }

        // 6. Draw Gradient
        if (applyGradient) {
            const gradientHeight = Math.max(totalBlockHeight + 400, 600); // Ensure minimal gradient visibility
            const gradY = isTop ? 0 : HEIGHT - gradientHeight;
            const gradient = ctx.createLinearGradient(0, gradY, 0, isTop ? gradientHeight : HEIGHT);

            if (isTop) {
                gradient.addColorStop(0, 'rgba(0,0,0,0.95)');
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
            } else {
                gradient.addColorStop(0, 'rgba(0,0,0,0)');
                gradient.addColorStop(0.5, 'rgba(0,0,0,0.6)');
                gradient.addColorStop(1, 'rgba(0,0,0,0.95)');
            }

            ctx.save();
            ctx.fillStyle = gradient;
            ctx.fillRect(0, gradY, WIDTH, gradientHeight);
            ctx.restore();
        }

        // 7. Draw Text
        if (applyText && (headlineLines.length > 0 || titleLines.length > 0)) {
            const finalFontSize = Math.max(40, globalFontSize * textScale);
            ctx.font = `bold ${finalFontSize}px ${fontToUse}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            // Shadows
            ctx.shadowColor = 'rgba(0,0,0,0.9)';
            ctx.shadowBlur = 30;
            ctx.shadowOffsetY = 5;

            // Positioning
            const totalH = (headlineLines.length + titleLines.length) * (finalFontSize * 0.95);
            const defaultY = isTop ? 120 : HEIGHT - totalH - 120;

            const startX = (textPosition && !isNaN(Number(textPosition.x))) ? Number(textPosition.x) : WIDTH / 2;
            const startY = (textPosition && !isNaN(Number(textPosition.y))) ? Number(textPosition.y) : defaultY;

            let currentY = startY;
            const allLines = [...titleLines, ...headlineLines];

            let wordCursor = 0;

            allLines.forEach(line => {
                // We draw word  by word for purple coloring support
                ctx.textAlign = 'left';
                const words = line.split(/\s+/).filter(Boolean);

                // Calculate line width for centering
                let lineWidth = 0;
                const wordWidths = words.map(w => {
                    const m = ctx.measureText(w + " ");
                    const wVal = m.width > 0 ? m.width : (w.length * finalFontSize * 0.5); // Fallback measure
                    lineWidth += wVal;
                    return wVal;
                });

                // If centered (default), offset X
                let currentX = startX - (lineWidth / 2);

                words.forEach((word, idx) => {
                    // Check if this word index is in purple list
                    // Note: 'wordCursor' tracks total word index across all lines
                    const isPurple = purpleWordIndices?.includes(wordCursor + idx);

                    ctx.fillStyle = isPurple ? '#9D7BFF' : '#FFFFFF';
                    ctx.fillText(word, currentX, currentY);

                    currentX += wordWidths[idx];
                });

                wordCursor += words.length;
                currentY += finalFontSize * 0.95;
            });
        }

        // Watermark
        ctx.font = 'bold 30px Arial, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 0;
        ctx.fillText('@KumoLabAnime', WIDTH / 2, HEIGHT - 50);

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
