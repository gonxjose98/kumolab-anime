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

        // 5. Typography Settings (IMPACTFUL & EQUALIZED)
        const centerX = WIDTH / 2;
        const availableWidth = WIDTH * 0.90;

        ctx.textAlign = 'center';

        // Shadow Settings (Stronger & more prominent per USER request)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 35;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;

        // Equalized font size per USER request: "make sure the text is all the same size"
        const fontName = 'sans-serif';
        const globalFontSize = 95; // Balanced large size for both

        // --- DEDUPLICATION LOGIC ---
        // "detect duplicate words... it says 'officially officially'. That should never happen!"
        const titleWords = animeTitle.toUpperCase().split(/\s+/);
        let cleanedHeadline = headline.toUpperCase();

        // Remove words from headline if they are already prominent in the title
        const headlineWords = cleanedHeadline.split(/\s+/);
        const uniqueHeadlineWords = headlineWords.filter(word => !titleWords.includes(word));
        cleanedHeadline = uniqueHeadlineWords.join(' ');

        // 6. Draw Text
        const bottomPadding = 80;
        const lineSpacing = globalFontSize * 0.95;

        // Prepare Title Lines
        ctx.font = `900 ${globalFontSize}px ${fontName}`;
        const titleLines = wrapText(ctx, animeTitle.toUpperCase(), availableWidth, 3);

        // Prepare Headline Lines (if any words remain after cleaning)
        const headlineLines = cleanedHeadline.length > 0
            ? wrapText(ctx, cleanedHeadline, availableWidth, 2)
            : [];

        // Calculate Block Height
        const titleBlockHeight = titleLines.length * lineSpacing;
        const headlineBlockHeight = headlineLines.length * lineSpacing;
        const gap = headlineLines.length > 0 ? 20 : 0;

        // Determine Start Y based on Zone
        let currentY = 0;

        if (isTop) {
            currentY = 120;
        } else {
            currentY = HEIGHT - bottomPadding - headlineBlockHeight - gap - titleBlockHeight;
        }

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
