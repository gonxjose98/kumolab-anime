import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { TwitterApi } from 'twitter-api-v2';

async function testX() {
    console.log("Testing X (Twitter) Connection...");

    try {
        const xClient = new TwitterApi({
            appKey: process.env.X_API_KEY || '',
            appSecret: process.env.X_API_SECRET || '',
            accessToken: process.env.X_ACCESS_TOKEN || '',
            accessSecret: process.env.X_ACCESS_SECRET || '',
        });

        const user = await xClient.v2.me();
        console.log("X Authentication Successful!");
        console.log("User:", user.data.username);

        // Try a simple tweet
        const tweet = await xClient.v2.tweet("Verifying KumoLab Engine connectivity... 🤖✨ " + new Date().toISOString());
        console.log("Test Tweet Published! ID:", tweet.data.id);

    } catch (e: any) {
        console.error("X FAILED:", e);
    }
}

testX();
