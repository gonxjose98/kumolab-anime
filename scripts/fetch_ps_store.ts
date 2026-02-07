
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function fetchPSStore() {
    try {
        const url = "https://store.playstation.com/en-us/concept/234573";
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = await response.text();
        const $ = cheerio.load(html);

        // Find meta og:image
        const ogImage = $('meta[property="og:image"]').attr('content');
        console.log("OG Image:", ogImage);

        // Try to find other images
        const found = new Set<string>();
        $('img').each((i, el) => {
            let src = $(el).attr('src');
            if (src && src.includes('image.api.playstation.com')) {
                src = src.split('?')[0]; // Strip params
                if (!found.has(src)) {
                    console.log("Image:", src);
                    found.add(src);
                }
            }
        });
    } catch (e) {
        console.error("Error:", e);
    }
}

fetchPSStore();
