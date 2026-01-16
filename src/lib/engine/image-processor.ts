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
        let buffer: Buffer;

        if (sourceUrl.startsWith('http')) {
            const response = await fetch(sourceUrl);
            if (!response.ok) throw new Error('Failed to fetch image');
            buffer = Buffer.from(await response.arrayBuffer());
        } else {
            // Assume local public path (remove leading slash if needed or join with cwd)
            // If it starts with /, assuming relative to public for usage, but for server-side fs read:
            const localPath = path.join(process.cwd(), 'public', sourceUrl.startsWith('/') ? sourceUrl.slice(1) : sourceUrl);
            if (fs.existsSync(localPath)) {
                buffer = fs.readFileSync(localPath);
            } else {
                throw new Error(`Local source image not found: ${localPath}`);
            }
        }

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
        const TARGET_ZONE_HEIGHT = HEIGHT * 0.35;

        // 5. Typography Settings (IMPACTFUL & DYNAMIC)
        const centerX = WIDTH / 2;
        const availableWidth = WIDTH * 0.90;
        const fontName = '"Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", sans-serif';

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Shadow Settings (Maximum Contrast)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 35;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;

        // --- DEDUPLICATION LOGIC ---
        const titleWords = animeTitle.toUpperCase().split(/\s+/);
        let cleanedHeadline = headline.toUpperCase();
        const headlineWords = cleanedHeadline.split(/\s+/);
        const uniqueHeadlineWords = headlineWords.filter(word => !titleWords.includes(word));
        cleanedHeadline = uniqueHeadlineWords.join(' ');

        // --- DYNAMIC FONT SCALING ENGINE ---
        // Goal: Fill ~35% of the screen height without overflowing
        let globalFontSize = 130; // Start big
        let titleLines: string[] = [];
        let headlineLines: string[] = [];
        let lineSpacing = 0;
        let totalBlockHeight = 0;
        let gap = 0;

        while (globalFontSize >= 60) {
            ctx.font = `900 ${globalFontSize}px ${fontName}`;
            lineSpacing = globalFontSize * 0.95;
            gap = cleanedHeadline.length > 0 ? globalFontSize * 0.25 : 0;

            titleLines = wrapText(ctx, animeTitle.toUpperCase(), availableWidth, 3);
            headlineLines = cleanedHeadline.length > 0
                ? wrapText(ctx, cleanedHeadline, availableWidth, 2)
                : [];

            totalBlockHeight = (titleLines.length + headlineLines.length) * lineSpacing + gap;

            // If we fit in the zone or if it's already quite small, stop
            if (totalBlockHeight <= TARGET_ZONE_HEIGHT) break;
            globalFontSize -= 5;
        }

        // 6. Localized High-Contrast Gradient
        // "I just want to make the text a little easier to see"
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
        ctx.fillRect(0, gradientYStart, WIDTH, gradientHeight);
        ctx.restore();

        // 7. Draw Text
        let currentY = isTop ? 80 : HEIGHT - totalBlockHeight - 80;

        ctx.textBaseline = 'top';

        // --- DRAW ANIME TITLE (PRIMARY: WHITE / HEAVY) ---
        ctx.font = `900 ${globalFontSize}px ${fontName}`;
        ctx.fillStyle = '#FFFFFF'; // White for Primary Title

        titleLines.forEach((line) => {
            ctx.fillText(line, centerX, currentY);
            currentY += lineSpacing;
        });

        // --- DRAW HEADLINE (SUPPORTING: PURPLE / HEAVY) ---
        currentY += gap;
        ctx.font = `900 ${globalFontSize}px ${fontName}`;
        ctx.fillStyle = '#9D7BFF'; // KumoLab Purple for Hype Words (status)

        headlineLines.forEach((line) => {
            ctx.fillText(line, centerX, currentY);
            currentY += lineSpacing;
        });

        // --- DRAW HANDLE (Subtle) ---
        ctx.font = `bold 24px ${fontName}`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.shadowBlur = 0;
        // If Top, put handle at top padding? Or Bottom? Keep it bottom consistent.
        ctx.fillText(HANDLE_TEXT, centerX, HEIGHT - 30);


        // 7. Upload to Supabase Storage (Persistent & Accessible)
        try {
            const bucketName = 'blog-images';
            const finalBuffer = await canvas.toBuffer('image/png');

            // Dynamic import to avoid circular dep issues in some envs
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

                // FINAL FALLBACK: Base64 Data URI (Ensures text rules are followed even without storage)
                // Using compressed JPEG to stay within database/network limits (~200KB vs ~2MB)
                console.log('Falling back to compressed JPEG Base64 encoding...');
                const jpegBuffer = await sharp(finalBuffer).jpeg({ quality: 80 }).toBuffer();
                return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
            }

            // Get Public URL
            const { data: { publicUrl } } = supabaseAdmin
                .storage
                .from(bucketName)
                .getPublicUrl(`${outputFileName}`);

            return publicUrl;

        } catch (uploadError) {
            console.error('Storage operation failed:', uploadError);
            return null;
        }
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
