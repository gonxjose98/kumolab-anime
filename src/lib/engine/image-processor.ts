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

        // --- STRICT FONT LOADING ---
        const outfitPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');
        console.log(`[Image Engine] process.cwd(): ${process.cwd()}`);
        console.log(`[Image Engine] Target Font Path: ${outfitPath}`);
        console.log(`[Image Engine] Exists? ${fs.existsSync(outfitPath)}`);

        if (!fs.existsSync(outfitPath)) {
            // Debugging: check what IS in public/fonts
            const fontsDir = path.dirname(outfitPath);
            if (fs.existsSync(fontsDir)) {
                console.log(`[Image Engine] Contents of ${fontsDir}:`, fs.readdirSync(fontsDir));
            } else {
                console.log(`[Image Engine] Fonts directory not found at ${fontsDir}`);
                // Try looking in alternate locations?
            }
            throw new Error(`CRITICAL: Font file missing at ${outfitPath}`);
        }

        // Use registerFromPath as primary method
        let isRegistered: boolean = GlobalFonts.registerFromPath(outfitPath, 'Outfit');

        if (!isRegistered) {
            console.warn(`[Image Engine] registerFromPath failed for ${outfitPath}. Trying buffer registration...`);
            try {
                const fontBuffer = fs.readFileSync(outfitPath);
                // register returns FontKey | null (or undefined depending on version), truthy if success
                const fontKey = GlobalFonts.register(fontBuffer, 'Outfit');
                if (fontKey) { // Check for truthiness
                    isRegistered = true;
                    console.log('[Image Engine] Font "Outfit" registered successfully via Buffer.');
                }
            } catch (bufferErr) {
                console.error(`[Image Engine] Buffer registration failed:`, bufferErr);
            }
        }


        if (!isRegistered) {
            throw new Error(`CRITICAL: GlobalFonts.registerFromPath AND Buffer fallback returned false for ${outfitPath}`);
        }

        console.log('[Image Engine] Font "Outfit" registered successfully.');

        // 2. Download source
        let buffer: Buffer;

        if (sourceUrl.startsWith('http')) {
            console.log(`[Image Engine] Fetching source: ${sourceUrl}`);
            const response = await fetch(sourceUrl);
            if (!response.ok) {
                console.error(`[Image Engine] Fetch failed: ${response.status} ${response.statusText} for ${sourceUrl}`);
                throw new Error(`Failed to fetch source image: HTTP ${response.status}`);
            }
            buffer = Buffer.from(await response.arrayBuffer());
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
        const availableWidth = WIDTH * 0.90;

        // STRICT: If user provides a headline, WE USE IT. No filtering.
        let cleanedHeadline = (headline || '').toUpperCase().trim();
        const upperTitle = (animeTitle || '').toUpperCase().trim();

        // DEDUPLICATION GUARD:
        // If the Override Visual Title (slug/headline) matches the Anime Title, suppress the duplicate.
        // We only deduplicate if there IS a title to match against.
        if (cleanedHeadline === upperTitle && upperTitle.length > 0) {
            console.log(`[Image Engine] Deduplicating headline (matches title): "${cleanedHeadline}"`);
            cleanedHeadline = '';
        }

        console.log(`[Image Engine] INPUTS -> Title: "${upperTitle}", Headline: "${cleanedHeadline}", ApplyText: ${applyText}`);

        // FAILSAFE: If no headline provided for a visual that needs one, default.
        if (!cleanedHeadline && !skipUpload) {
            // Only apply default if we are not skipping upload (which implies preview/custom mode)
            // Actually, for custom mode we trust the user.
        }

        let globalFontSize = 135;
        let titleLines: string[] = [];
        let headlineLines: string[] = [];
        let lineSpacing = 0;
        let totalBlockHeight = 0;

        // Iterative Sizing
        // If disableAutoScaling is true (e.g. strict editor mode), we skip the shrinking loop.
        // We still run the loop ONCE to generate lines, but we break immediately.
        while (globalFontSize >= 45) {
            const currentFS = globalFontSize * textScale;
            // STRICT FONT USAGE
            ctx.font = `900 ${currentFS}px "Outfit"`;
            lineSpacing = currentFS * 0.92;

            titleLines = upperTitle.length > 0 ? wrapText(ctx, upperTitle, availableWidth, 6, currentFS) : [];
            headlineLines = cleanedHeadline.length > 0 ? wrapText(ctx, cleanedHeadline, availableWidth, 6, currentFS) : [];

            totalBlockHeight = (titleLines.length + headlineLines.length) * lineSpacing;

            if (disableAutoScaling) break; // STOP here if we are in strict mode
            if (totalBlockHeight <= (HEIGHT * 0.25)) break;
            globalFontSize -= 5;
        }

        console.log(`[Image Engine] WRAPPING RESULTS -> TitleLines: ${titleLines.length}, HeadlineLines: ${headlineLines.length}`);

        // 6. Draw Gradient (Seamless Scrim)
        if (applyGradient) {
            const minGradH = 900;
            const gradientHeight = Math.max(totalBlockHeight + 500, minGradH);
            const gradY = isTop ? 0 : HEIGHT - gradientHeight;
            const gradient = ctx.createLinearGradient(0, gradY, 0, isTop ? gradientHeight : HEIGHT);

            if (isTop) {
                gradient.addColorStop(0, 'rgba(0,0,0,0.95)');
                gradient.addColorStop(0.4, 'rgba(0,0,0,0.6)');
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
            } else {
                gradient.addColorStop(0, 'rgba(0,0,0,0)');
                gradient.addColorStop(0.15, 'rgba(0,0,0,0)');
                gradient.addColorStop(0.25, 'rgba(0,0,0,0.03)');
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

        // 7. Draw Text
        if (applyText) {
            if (headlineLines.length === 0 && titleLines.length === 0) {
                console.warn("[Image Engine] Text enabled but no content to draw.");
            }

            const zoneHeight = 405; // 30% of 1350
            const finalFontSize = Math.max(40, globalFontSize * textScale);
            const lineSpacing = finalFontSize * 0.92;
            const totalH = (headlineLines.length + titleLines.length) * lineSpacing;
            const numLines = headlineLines.length + titleLines.length;

            const defaultY = isTop ? 50 : 1300;
            const startX = (textPosition && !isNaN(Number(textPosition.x))) ? Number(textPosition.x) : WIDTH / 2;
            const startY = (textPosition && !isNaN(Number(textPosition.y))) ? Number(textPosition.y) : defaultY;

            // BASELINE-ANCHORED UNIDIRECTIONAL GROWTH
            // Header: startY is the TOP edge. First line's baseline is startY + ascent.
            // Footer: startY is the BOTTOM edge. Last line's baseline is startY.
            let currentY = isTop
                ? startY + (finalFontSize * 0.85)
                : startY - (numLines > 1 ? (numLines - 1) * lineSpacing : 0);
            const allLines = [...titleLines, ...headlineLines];
            let wordCursor = 0;

            console.log(`[Image Engine] Drawing ${allLines.length} lines of text at startY=${startY}`);

            for (const line of allLines) {
                const words = line.split(/\s+/).filter(Boolean);

                ctx.save();
                ctx.font = `900 ${finalFontSize}px "Outfit"`;
                ctx.textAlign = 'center';

                // Shadow
                ctx.shadowColor = 'rgba(0,0,0,0.8)'; // Stronger shadow for visibility
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 0; // Centered glow effect
                ctx.shadowOffsetY = 4;

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
                    ctx.fillStyle = isPurple ? KUMOLAB_PURPLE : '#FFFFFF';
                    // Force Opacity
                    ctx.globalAlpha = 1.0;

                    console.log(`[Image Engine] Drawing Word: "${word}" at (${Math.round(currentX)}, ${Math.round(currentY)}) Color: ${isPurple ? 'PURPLE' : 'WHITE'}`);

                    ctx.fillText(word, currentX + (metrics[wordIdx].wordW / 2), currentY);
                    ctx.restore();
                    currentX += metrics[wordIdx].wordW + metrics[wordIdx].spaceW;
                });

                ctx.restore();
                wordCursor += words.length;
                currentY += finalFontSize * 0.92;
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
        console.log("!!! IMAGE ENGINE FATAL ERROR !!!");
        console.log(e);
        if (e instanceof Error) {
            console.log(e.stack);
        }
        console.error("Image Engine Fatal:", e);
        // Fallback Error Image
        // ... (simplified error image)
        return null;
    }
}
