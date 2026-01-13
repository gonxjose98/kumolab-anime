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
export async function generateIntelImage({
    sourceUrl,
    animeTitle,
    headline,
    slug
}: IntelImageOptions): Promise<string | null> {
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

        // 3. Dark Overlay (Bottom Fade)
        const gradient = ctx.createLinearGradient(0, HEIGHT * 0.5, 0, HEIGHT);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // 4. Position Settings
        const centerX = WIDTH / 2;
        const baseY = HEIGHT * 0.75; // Starting point for text cluster
        const maxWidth = WIDTH * 0.9;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // 5. Draw "STATUS" (Headline) - White
        const statusSize = 58;
        ctx.font = `bold ${statusSize}px sans-serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(headline.toUpperCase(), centerX, baseY);

        // 6. Draw "ANIME TITLE" - Purple
        const titleSize = 78;
        ctx.font = `bold ${titleSize}px sans-serif`;
        ctx.fillStyle = KUMOLAB_PURPLE;

        const titleLines = wrapText(ctx, animeTitle.toUpperCase(), maxWidth, 2);
        const titleY = baseY + statusSize + 20;

        titleLines.forEach((line, i) => {
            ctx.fillText(line, centerX, titleY + (i * (titleSize + 10)));
        });

        // 7. Draw Handle - Bottom Center
        ctx.font = 'bold 36px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; // Subtle white
        ctx.fillText(HANDLE_TEXT, centerX, HEIGHT - 100);

        // 8. Save
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
