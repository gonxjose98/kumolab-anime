
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

async function test() {
    const WIDTH = 1080;
    const HEIGHT = 1350;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Mock background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const fontName = 'Outfit';
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');
    let fontToUse = 'Arial, sans-serif';

    if (fs.existsSync(fontPath)) {
        GlobalFonts.registerFromPath(fontPath, fontName);
        fontToUse = `"${fontName}", Arial, sans-serif`;
    }

    const textScale = 1;
    const globalFontSize = 100;
    const textPosition = { x: 540, y: 1050 };
    const headlineLines = ["SCUM OF THE BRAVE CASTS YUICHIRO"];
    const titleLines = ["UMEHARA, KATSUYUKI"];
    const lineSpacing = 110;
    const centerX = WIDTH / 2;
    const HANDLE_TEXT = '@KumoLabAnime';

    const finalFontSize = Math.max(30, globalFontSize * textScale);
    const fontStack = `bold ${finalFontSize}px ${fontToUse}, Arial, sans-serif`;
    ctx.font = fontStack;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center'; // Wait! I use center in some places and left in others

    // Engine logic:
    const allLines = [...headlineLines, ...titleLines];
    let globalWordOffset = 0;

    allLines.forEach((line, lineIdx) => {
        const words = line.split(/\s+/).filter(Boolean);
        if (words.length > 0) {
            const lineMetrics = words.map(w => ctx.measureText(w).width || (w.length * finalFontSize * 0.45));
            const spaceWidth = ctx.measureText(' ').width || (finalFontSize * 0.2);
            const totalLineLength = lineMetrics.reduce((a, b) => a + b, 0) + (words.length - 1) * spaceWidth;

            let wordX = textPosition.x - (totalLineLength / 2);
            const yPos = textPosition.y + (lineIdx * lineSpacing);

            console.log(`Drawing line "${line}" at Y: ${yPos}, X_start: ${wordX}`);

            words.forEach((word, wordIdx) => {
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,1)';
                ctx.shadowBlur = 20;
                ctx.fillStyle = '#FFFFFF';
                ctx.font = fontStack;
                ctx.textAlign = 'left'; // IMPORTANT
                ctx.fillText(word, wordX, yPos);
                ctx.restore();
                wordX += lineMetrics[wordIdx] + spaceWidth;
            });
        }
    });

    // Watermark
    ctx.save();
    ctx.font = 'bold 36px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'center';
    ctx.fillText(HANDLE_TEXT, WIDTH / 2, HEIGHT - 60);
    ctx.restore();

    const buffer = await canvas.toBuffer('image/png');
    fs.writeFileSync('debug-output.png', buffer);
    console.log('Saved debug-output.png');
}

test();
