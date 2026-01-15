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

        // 5. Typography Settings
        const centerX = WIDTH / 2;
        const maxWidth = WIDTH * 0.85; // slightly tighter for elegance

        ctx.textAlign = 'center';

        // Font Sizes (Hierarchy: Title > Supporting > Handle)
        const titleSize = 82; // Dominant
        const supportingSize = 42; // ~50% of title (Guideline says < 40% size, but readability matters, adjusted to 42px)
        const handleSize = 28;

        // 6. Draw Text
        // Calculate Y positions based on Zone
        let currentY = isTop ? 120 : (HEIGHT - zoneHeight + 100);

        // ANIME TITLE (Purple, Bold)
        // KumoLab Purple: #C084FC (matching the CSS gradient start) or #9D7BFF
        ctx.font = `bold ${titleSize}px sans-serif`;
        ctx.fillStyle = '#C084FC'; // Vibrant Purple
        ctx.textBaseline = 'top';

        const titleLines = wrapText(ctx, animeTitle.toUpperCase(), maxWidth, 2);
        titleLines.forEach((line) => {
            ctx.fillText(line, centerX, currentY);
            currentY += titleSize + 15; // Line spacing
        });

        // SUPPORTING LINE (White, Regular, Smaller)
        currentY += 10; // Gap
        ctx.font = `normal ${supportingSize}px sans-serif`;
        ctx.fillStyle = '#E2E8F0'; // Slate-200 (White-ish)
        ctx.fillText(headline.toUpperCase(), centerX, currentY);

        // HANDLE (White, Subtle)
        currentY += supportingSize + 40; // Gap between supporting and handle
        ctx.font = `normal ${handleSize}px sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(HANDLE_TEXT, centerX, currentY);

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
