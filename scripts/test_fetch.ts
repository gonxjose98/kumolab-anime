
import fetch from 'node-fetch';
import fs from 'fs';

async function testFetch() {
    console.log("Testing fetch...");
    try {
        const url = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx158871-u2G2y5a0W33w.jpg";
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });
        console.log("Status:", response.status);
        if (response.ok) {
            const buffer = await response.buffer();
            console.log("Success, bytes:", buffer.length);
        } else {
            console.log("Failed status:", response.status);
        }
    } catch (e) {
        console.error("Fetch Error:", e);
    }
}

testFetch();
