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
    console.log(`[Image Engine] Starting generation. Text: "${headline}", Gradient: ${applyGradient}, Position: ${gradientPosition}`);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFileName = `${slug}-social.png`;
    const outputPath = path.join(outputDir, outputFileName);

    const WIDTH = 1080;
    const HEIGHT = 1350;

    try {
        // 1. Dynamic Import (Prevents build-time binary resolution issues)
        const { createCanvas, loadImage, GlobalFonts } = await import('@napi-rs/canvas');

        // Check/Register Fonts - ROBUST LOADING
        let fontToUse = 'Sans'; // System default fallback
        const fontName = 'Outfit';
        const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');

        console.log(`[Image Engine] Font registration check. Path: ${fontPath}`);
        try {
            if (fs.existsSync(fontPath)) {
                // Always attempt registration to be sure, napi-rs handles duplicates gracefully or we check .has()
                if (!GlobalFonts.has(fontName)) {
                    GlobalFonts.registerFromPath(fontPath, fontName);
                    console.log(`[Image Engine] '${fontName}' registered from path.`);
                }
                fontToUse = fontName;
            } else {
                console.warn(`[Image Engine] Font file missing at ${fontPath}. Attempting backup download...`);
                const backupUrl = 'https://github.com/google/fonts/raw/main/ofl/outfit/static/Outfit-Black.ttf';
                const res = await fetch(backupUrl);
                if (res.ok) {
                    const buf = Buffer.from(await res.arrayBuffer());
                    GlobalFonts.register(buf, fontName);
                    fontToUse = fontName;
                    console.log(`[Image Engine] Backup download for '${fontName}' registered.`);
                    if (!fs.existsSync(path.dirname(fontPath))) fs.mkdirSync(path.dirname(fontPath), { recursive: true });
                    fs.writeFileSync(fontPath, buf);
                } else {
                    console.error(`[Image Engine] Backup download failed: ${res.status}`);
                    fontToUse = 'Impact, Arial, sans-serif'; // Better bold fallback
                }
            }
        } catch (e) {
            console.error(`[Image Engine] Font load error:`, e);
            fontToUse = 'Impact, Arial, sans-serif';
        }

        // 2. Download source
        let buffer: Buffer;

        if (sourceUrl.startsWith('http')) {
            try {
                const response = await fetch(sourceUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                buffer = Buffer.from(await response.arrayBuffer());
            } catch (fetchErr) {
                console.warn(`[Image Engine] Failed to fetch source: ${sourceUrl}. Using Fallback Background.`);
                const fallbackPath = path.join(process.cwd(), 'public/hero-bg-final.png');
                if (fs.existsSync(fallbackPath)) {
                    buffer = fs.readFileSync(fallbackPath);
                } else {
                    buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
                }
            }
        } else if (sourceUrl.startsWith('data:')) {
            const base64Data = sourceUrl.split(',')[1];
            buffer = Buffer.from(base64Data, 'base64');
        } else {
            const localPath = path.isAbsolute(sourceUrl)
                ? sourceUrl
                : path.join(process.cwd(), 'public', sourceUrl.startsWith('/') ? sourceUrl.slice(1) : sourceUrl);

            if (fs.existsSync(localPath)) {
                buffer = fs.readFileSync(localPath);
            } else {
                throw new Error(`Local source image not found: ${localPath}`);
            }
        }

        // 3. Setup Canvas
        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext('2d');

        // Load image and calculate scale/position
        const img = await loadImage(buffer);
        const imgRatio = img.width / img.height;
        const canvasRatio = WIDTH / HEIGHT;

        let drawWidth, drawHeight, dx, dy;

        if (imgRatio > canvasRatio) {
            drawHeight = HEIGHT * scale;
            drawWidth = drawHeight * imgRatio;
        } else {
            drawWidth = WIDTH * scale;
            drawHeight = drawWidth / imgRatio;
        }

        // Center by default, then add user position offsets (normalized -1 to 1)
        dx = (WIDTH - drawWidth) / 2 + (position.x * WIDTH);
        dy = (HEIGHT - drawHeight) / 2 + (position.y * HEIGHT);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

        // 4. Zone Logic (Top vs Bottom)
        const isTop = gradientPosition === 'top';
        let targetZonePercentage = 0.35;

        // --- AUTOMATIC OBSTRUCTION DETECTION (HEURISTIC) ---
        try {
            const detectionZoneY = isTop ? 0 : HEIGHT * 0.65;
            const detectionZoneHeight = HEIGHT * 0.35;
            const imageData = ctx.getImageData(0, detectionZoneY, WIDTH, detectionZoneHeight);
            const pixels = imageData.data;
            let skinTonePixels = 0;

            for (let i = 0; i < pixels.length; i += 4) {
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                const isSkin = r > 200 && g > 160 && b > 130 && r > g && (r - b) < 100;
                if (isSkin) skinTonePixels++;
            }

            const skinPercentage = (skinTonePixels / (WIDTH * detectionZoneHeight)) * 100;
            if (skinPercentage > 2.5) {
                console.log(`[Image Engine] Character face detected in ${textPosition} zone (${skinPercentage.toFixed(1)}%). Reducing text limit to 30%.`);
                targetZonePercentage = 0.30;
            }
        } catch (e) {
            console.warn('[Image Engine] Obstruction detection failed, falling back to 35%.', e);
        }

        const TARGET_ZONE_HEIGHT = HEIGHT * targetZonePercentage;

        // 5. Typography Settings
        const centerX = WIDTH / 2;
        const availableWidth = WIDTH * 0.90;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Shadow Settings
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 35;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;

        // Deduplication
        // Deduplication - REMOVED for manual mission control. 
        // User wants EXACT control over overlayTag.
        let cleanedHeadline = (headline || '').toUpperCase().trim();

        // Font Scaling
        let globalFontSize = 130;
        let titleLines: string[] = [];
        let headlineLines: string[] = [];
        let lineSpacing = 0;
        let totalBlockHeight = 0;
        let gap = 0;

        while (globalFontSize >= 45) {
            ctx.font = `900 ${globalFontSize * textScale}px ${fontToUse}`;
            const spacingMultiplier = (globalFontSize * textScale) < 80 ? 0.9 : 0.95;
            lineSpacing = (globalFontSize * textScale) * spacingMultiplier;

            // Gap should only exist if we have BOTH title and headline.
            // Since we usually only have headline now, we'll simplify.
            gap = (titleLines.length > 0 && cleanedHeadline.length > 0) ? globalFontSize * 0.25 : 0;

            titleLines = animeTitle.trim().length > 0 ? wrapText(ctx, animeTitle.toUpperCase(), availableWidth, 3) : [];
            headlineLines = cleanedHeadline.length > 0 ? wrapText(ctx, cleanedHeadline, availableWidth, 3) : [];

            totalBlockHeight = (titleLines.length + headlineLines.length) * lineSpacing + gap;
            const maxLineWidth = Math.max(
                0,
                ...titleLines.map(l => ctx.measureText(l).width),
                ...headlineLines.map(l => (ctx.measureText(l).width))
            );

            if (totalBlockHeight <= TARGET_ZONE_HEIGHT && maxLineWidth <= availableWidth) break;
            globalFontSize -= 5;
        }

        if (headlineLines.length === 0 && cleanedHeadline.length > 0) {
            console.warn("[Image Engine] Warning: No headline lines generated. Forcing single line.");
            headlineLines = [cleanedHeadline];
        }

        // 6. High-Contrast Gradient
        if (applyGradient) {
            const gradientHeight = totalBlockHeight + 250;
            const gradientYStart = isTop ? 0 : HEIGHT - gradientHeight;
            const gradient = ctx.createLinearGradient(0, gradientYStart, 0, isTop ? gradientHeight : HEIGHT);

            if (isTop) {
                gradient.addColorStop(0, 'rgba(0, 0, 0, 0.98)');
                gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.7)');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            } else {
                gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
                gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.7)');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
            }

            ctx.save();
            ctx.shadowBlur = 0;
            ctx.fillStyle = gradient;
            ctx.fillRect(0, isTop ? 0 : HEIGHT - gradientHeight, WIDTH, gradientHeight);
            ctx.restore();
        }

        // 7. Draw Text
        if (applyText) {
            const finalFontSize = globalFontSize * textScale;
            let currentY = textPosition ? textPosition.y : (isTop ? 80 : HEIGHT - totalBlockHeight - 80);
            const drawX = textPosition ? textPosition.x : centerX;

            ctx.textBaseline = 'top';
            ctx.font = `900 ${finalFontSize}px ${fontToUse}`;
            ctx.fillStyle = '#FFFFFF';

            // Draw Headline Lines with Highlight
            headlineLines.forEach((line) => {
                const words = line.split(/\s+/).filter(Boolean);

                if (words.length > 0) {
                    // Calculation for alignment
                    const lineMetrics = words.map(w => {
                        ctx.font = `900 ${finalFontSize}px ${fontToUse}`;
                        return ctx.measureText(w).width;
                    });
                    const spacing = ctx.measureText(' ').width;
                    const totalLineLength = lineMetrics.reduce((a, b) => a + b, 0) + (words.length - 1) * spacing;
                    let wordX = drawX - totalLineLength / 2;

                    ctx.textAlign = 'left';
                    const wordsBeforeCount = headlineLines.slice(0, headlineLines.indexOf(line)).join(' ').split(/\s+/).filter(Boolean).length;

                    words.forEach((word, idx) => {
                        const globalIndex = wordsBeforeCount + idx;
                        const isPurple = (purpleWordIndices && purpleWordIndices.length > 0)
                            ? (purpleWordIndices.includes(globalIndex))
                            : false;

                        ctx.fillStyle = isPurple ? '#9D7BFF' : '#FFFFFF';
                        // ENFORCE EXTREME BOLDNESS
                        ctx.font = `900 ${finalFontSize}px ${fontToUse}`;
                        ctx.fillText(word, wordX, currentY);
                        wordX += lineMetrics[idx] + spacing;
                    });
                }
                currentY += lineSpacing;
            });

            ctx.font = `bold 24px ${fontToUse}`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.shadowBlur = 0;
            ctx.fillText(HANDLE_TEXT, centerX, HEIGHT - 30);
        }

        // 8. Output
        const finalBuffer = await canvas.toBuffer('image/png');
        if (skipUpload) {
            return `data:image/png;base64,${finalBuffer.toString('base64')}`;
        }

        const bucketName = 'blog-images';
        const { supabaseAdmin } = await import('../supabase/admin');
        const { data, error } = await supabaseAdmin
            .storage
            .from(bucketName)
            .upload(`${outputFileName}`, finalBuffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (error) {
            console.error('Supabase Storage Upload Error:', error);
            const jpegBuffer = await sharp(finalBuffer).jpeg({ quality: 80 }).toBuffer();
            return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
        }

        const { data: { publicUrl } } = supabaseAdmin
            .storage
            .from(bucketName)
            .getPublicUrl(`${outputFileName}`);

        return publicUrl;

    } catch (error) {
        console.error('Image Generation Error:', error);
        try {
            const { createCanvas } = await import('@napi-rs/canvas');
            const safeCanvas = createCanvas(1080, 1350);
            const sCtx = safeCanvas.getContext('2d');
            const grd = sCtx.createLinearGradient(0, 0, 0, 1350);
            grd.addColorStop(0, '#1a1a2e');
            grd.addColorStop(1, '#16213e');
            sCtx.fillStyle = grd;
            sCtx.fillRect(0, 0, 1080, 1350);
            sCtx.fillStyle = '#FFFFFF';
            sCtx.textAlign = 'center';
            sCtx.textBaseline = 'middle';
            sCtx.font = 'bold 80px Arial, sans-serif';
            sCtx.fillText(animeTitle.toUpperCase() || 'ANIME UPDATE', 540, 600);
            sCtx.fillStyle = '#9D7BFF';
            sCtx.font = 'bold 60px Arial, sans-serif';
            sCtx.fillText(headline.toUpperCase(), 540, 720);
            const fallbackBuffer = await safeCanvas.toBuffer('image/png');
            return `data:image/png;base64,${fallbackBuffer.toString('base64')}`;
        } catch (fatal) {
            return null;
        }
    }
}

function wrapText(ctx: any, text: string, maxWidth: number, maxLines: number): string[] {
    if (!text || !text.trim()) return [];
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    if (words.length === 0) return [];

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
    return lines.slice(0, maxLines);
}
