export { };

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function monitorIntegrity() {
    console.log('--- KumoLab Post Integrity Monitor ---');
    console.log(`Checking latest posts at: ${new Date().toISOString()}\n`);

    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .eq('is_published', true)
        .order('timestamp', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching posts:', error);
        return;
    }

    if (!posts || posts.length === 0) {
        console.log('No posts found in the database.');
        return;
    }

    let issuesFound = 0;
    const seenTitles = new Set();
    const seenSlugs = new Set();

    posts.forEach((post, index) => {
        const normalizedTitle = post.title.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        let hasIssue = false;
        let issueDesc = [];

        // 1. Duplicate Check
        if (seenTitles.has(normalizedTitle)) {
            hasIssue = true;
            issueDesc.push('DUPLICATE TITLE');
        }
        if (seenSlugs.has(post.slug)) {
            hasIssue = true;
            issueDesc.push('DUPLICATE SLUG');
        }
        seenTitles.add(normalizedTitle);
        seenSlugs.add(post.slug);

        // 2. Image Check
        if (!post.image || post.image === '/hero-bg-final.png' || post.image === '') {
            hasIssue = true;
            issueDesc.push('MISSING/FALLBACK IMAGE');
        }

        // 3. Text Overlay Violation (Manual check required, but we can log flags)
        // Note: Real confirmation requires checking if hasText was true vs applyText.

        if (hasIssue) {
            issuesFound++;
            console.log(`[!] ISSUE FOUND: "${post.title}"`);
            console.log(`    Slug: ${post.slug}`);
            console.log(`    Date: ${post.timestamp}`);
            console.log(`    Issues: ${issueDesc.join(', ')}`);
            console.log(`    Image: ${post.image}\n`);
        }
    });

    if (issuesFound === 0) {
        console.log('✅ Integrity Check Passed: No duplicates or missing images in the last 20 posts.');
    } else {
        console.log(`❌ Integrity Check Failed: ${issuesFound} issues detected in the last 20 posts.`);
    }
}

monitorIntegrity().catch(console.error);
