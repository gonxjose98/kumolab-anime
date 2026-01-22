
import fs from 'fs';
import path from 'path';

async function downloadFont() {
    const url = 'https://github.com/google/fonts/raw/main/ofl/inter/Inter-Black.ttf';
    const outputPath = path.join(process.cwd(), 'public', 'fonts', 'Inter-Black.ttf');

    // Ensure dir
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    console.log(`Downloading font from ${url}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch font: ${res.statusText}`);

    const buffer = await res.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(buffer));
    console.log(`Font saved to ${outputPath} (${buffer.byteLength} bytes)`);
}

downloadFont().catch(console.error);
