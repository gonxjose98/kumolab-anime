
const fs = require('fs');
const path = require('path');

// Load Env
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line: string) => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

const IG_TOKEN = process.env.IG_ACCESS_TOKEN;

if (!IG_TOKEN) {
    console.error("IG_ACCESS_TOKEN not found in env");
    process.exit(1);
}

console.log(`Testing Instagram Connection with token: ${IG_TOKEN.substring(0, 10)}...`);

async function testConnection() {
    try {
        // Try Basic Display API first (graph.instagram.com)
        const url = `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${IG_TOKEN}`;
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            console.log("✅ Instagram Connection Successful!");
            console.log("User Data:", data);
        } else {
            console.error("❌ Instagram Check Failed:", data);

            // If that fails, try Graph API (graph.facebook.com) in case it's a legacy/business token
            console.log("Retrying with Facebook Graph API endpoint...");
            const fbUrl = `https://graph.facebook.com/v18.0/me?access_token=${IG_TOKEN}`;
            const fbRes = await fetch(fbUrl);
            const fbData = await fbRes.json();

            if (fbRes.ok) {
                console.log("✅ Facebook Graph API Connection Successful!");
                console.log("User Data:", fbData);
            } else {
                console.error("❌ Facebook Graph API Check Failed:", fbData);
            }
        }

    } catch (error) {
        console.error("Network Error:", error);
    }
}

testConnection();
