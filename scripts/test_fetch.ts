
import fetch from 'node-fetch';

async function testFetch() {
    console.log("Testing fetch...");
    try {
        const url = "https://gbf.wiki/images/thumb/5/52/Granblue_Fantasy_Relink_Visual.jpg/800px-Granblue_Fantasy_Relink_Visual.jpg";
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
