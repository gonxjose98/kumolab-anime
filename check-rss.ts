
import fetch from 'node-fetch';

async function checkRSS() {
    const url = 'https://www.animenewsnetwork.com/all/rss.xml';
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const text = await res.text();
    console.log(text.substring(0, 2000));
}

checkRSS();
