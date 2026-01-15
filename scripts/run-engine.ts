
const fs = require('fs');
const path = require('path');

// 1. HARD LOAD ENV VARS BEFORE ANY OTHER IMPORTS
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

// 2. NOW it is safe to import the engine (dynamic import to avoid hoisting)
async function main() {
    const { runBlogEngine } = await import('../src/lib/engine/engine');

    const slot = process.argv[2];

    if (!slot || !['08:00', '12:00', '15:00', '20:00'].includes(slot)) {
        console.error('Usage: npx tsx scripts/run-engine.ts <08:00|12:00|15:00|20:00>');
        process.exit(1);
    }

    console.log(`[${new Date().toISOString()}] Running Blog Engine for slot: ${slot}`);

    try {
        const post = await runBlogEngine(slot as any, true);
        if (post) {
            console.log(`[SUCCESS] Published post: ${post.title}`);
        } else {
            console.log('[INFO] No post published (criteria not met or already exists).');
        }
    } catch (error) {
        console.error('[ERROR] Engine failure:', error);
        process.exit(1);
    }
}

main();
