/**
 * image-processor.ts
 * Implements the premium social-first aesthetic for KumoLab.
 * Format: 4:5 Portrait (1080x1350)
 */

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Aesthetics
const KUMOLAB_PURPLE = '#9D7BFF'; // Vibrant Lavender/Purple from reference
const HANDLE_TEXT = '@KumoLabAnime';

interface IntelImageOptions {
    sourceUrl: string;
    animeTitle: string;
    headline: string; // This is the status tag (e.g. RELEASE DATE ANNOUNCED)
    slug: string;
}

/**
 * Processes an image for the Intel Feed and Social Media.
 */
/**
 * Processes an image for the Intel Feed and Social Media.
 */
export async function generateIntelImage({
    sourceUrl,
    animeTitle,
    headline, // Serves as the "Supporting Line"
    slug,
    textPosition = 'bottom' // New argument defaulting to bottom
}: IntelImageOptions & { textPosition?: 'top' | 'bottom' }): Promise<string | null> {
    const outputDir = path.join(process.cwd(), 'public/blog/intel');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFileName = `${slug}-social.png`;
    const outputPath = path.join(outputDir, outputFileName);

    const WIDTH = 1080;
    const HEIGHT = 1350;

    try {
        // 1. Download and Resize/Crop to 1080x1350
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error('Failed to fetch image');
        const buffer = Buffer.from(await response.arrayBuffer());

        const resizedBuffer = await sharp(buffer)
            .resize(WIDTH, HEIGHT, {
                fit: 'cover',
                position: 'centre'
            })
            .toBuffer();

        // 2. Setup Canvas
        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext('2d');

        const img = await loadImage(resizedBuffer);
        ctx.drawImage(img, 0, 0);

        // 3. Zone Logic (Top vs Bottom)
        const isTop = textPosition === 'top';
        const zoneHeight = HEIGHT * 0.35; // 35% of image

        // 4. Subtle Gradient (Localized)
        let gradient;
        if (isTop) {
            // Top: Black -> Transparent (downwards)
            gradient = ctx.createLinearGradient(0, 0, 0, zoneHeight);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, WIDTH, zoneHeight);
        } else {
            // Bottom: Transparent -> Black (downwards)
            gradient = ctx.createLinearGradient(0, HEIGHT - zoneHeight, 0, HEIGHT);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, HEIGHT - zoneHeight, WIDTH, zoneHeight);
        }

        // 5. Typography Settings (BOLD & INDUSTRIAL)
        const centerX = WIDTH / 2;
        const availableWidth = WIDTH * 0.90; // Uses 90% of width for impact

        ctx.textAlign = 'center';

        // Shadow Settings (Subtle but grounded)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 25;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;

        // Font Config
        // We use system sans-serif with weight 900 for that "Heavy" look.
        // If 'Impact' or 'Arial Black' were available, we'd use them, but 'sans-serif' 900 is safe.
        const fontName = 'sans-serif';
        const titleSize = 100; // Large & Impactful
        const headlineSize = 55; // Clear hierarchy

        // 6. Draw Text
        // Calculate total text height to center it vertically within the bottom zone if needed,
        // OR just anchor it firmly to the bottom with padding.
        // User wants it to "Fill the space".

        const bottomPadding = 80;
        const lineSpacingTitle = titleSize * 0.95; // Tight leading
        const lineSpacingHeadline = headlineSize * 1.0;

        // Prepare Title Lines
        ctx.font = `900 ${titleSize}px ${fontName}`;
        const titleLines = wrapText(ctx, animeTitle.toUpperCase(), availableWidth, 3);

        // Prepare Headline Lines
        ctx.font = `900 ${headlineSize}px ${fontName}`;
        const headlineLines = wrapText(ctx, headline.toUpperCase(), availableWidth, 2);

        // Calculate Block Height
        const titleBlockHeight = titleLines.length * lineSpacingTitle;
        const headlineBlockHeight = headlineLines.length * lineSpacingHeadline;
        const gap = 20;

        // Determine Start Y (Anchored from Bottom)
        // If bottom zone is 35% (approx 470px).
        // Text should sit comfortably there.
        let currentY = HEIGHT - bottomPadding - headlineBlockHeight - gap - titleBlockHeight + titleSize;
        // Note: Canvas fillText positions are usually baseline or top. 
        // Let's use 'alphabetic' (default) or 'middle'. 
        // Actually, previous code used 'top'. Let's stick to 'top' but calculate upwards from bottom.

        ctx.textBaseline = 'top';
        currentY = HEIGHT - bottomPadding - headlineBlockHeight - gap - titleBlockHeight;

        // --- DRAW ANIME TITLE (PRIMARY: WHITE / HEAVY) ---
        ctx.font = `900 ${titleSize}px ${fontName}`;
        ctx.fillStyle = '#FFFFFF'; // White for Primary

        titleLines.forEach((line) => {
            ctx.fillText(line, centerX, currentY);
            currentY += lineSpacingTitle;
        });

        // --- DRAW HEADLINE (EMPHASIS: PURPLE / HEAVY) ---
        currentY += gap;
        ctx.font = `900 ${headlineSize}px ${fontName}`;
        ctx.fillStyle = '#9D7BFF'; // KumoLab Purple for EMPHASIS

        headlineLines.forEach((line) => {
            ctx.fillText(line, centerX, currentY);
            currentY += lineSpacingHeadline;
        });

        // --- DRAW HANDLE (Subtle) ---
        // (Optional: If room permits, or just omit if "taking up room" with main text is priority)
        // Let's add it very small at the very bottom if needed, or skip to clear clutter.
        // User asked for "Clear headline hierarchy". Handle might distract.
        // Let's Put it tiny at the very bottom edge.
        ctx.font = `bold 24px ${fontName}`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.shadowBlur = 0; // No shadow for handle
        ctx.fillText(HANDLE_TEXT, centerX, HEIGHT - 30);


        // 7. Save
        const finalBuffer = await canvas.toBuffer('image/png');
        fs.writeFileSync(outputPath, finalBuffer);

        return `/blog/intel/${outputFileName}`;
    } catch (error) {
        console.error('Image Generation Error:', error);
        return null;
    }
}

function wrapText(ctx: any, text: string, maxWidth: number, maxLines: number): string[] {
    const words = text.split(' ');
    const lines = [];
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
