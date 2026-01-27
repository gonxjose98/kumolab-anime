
import dotenv from 'dotenv';
import path from 'path';
import { generateIntelPost } from '../src/lib/engine/generator';
import { supabaseAdmin } from '../src/lib/supabase/admin';

// Load Env for AI/Supabase
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runSimulation() {
    console.log("--- SYSTEM UPDATE TEST WITH DB INSERT ---");
    console.log("Subject: Black Clover Season 2 Confirmation");
    console.log("----------------------------------------\n");

    const rawInput = {
        title: "Victory! Black Clover TV Anime Gets Season 2 Validation (Official)", // Intentionally noisy
        fullTitle: "Victory! Black Clover TV Anime Gets Season 2 Validation (Official)",
        claimType: 'confirmed',
        slug: 'black-clover-test',
        content: "The official website has finally announced that the Black Clover anime will return for a new season! Fans are losing their minds over the news. It is finally here.",
        imageSearchTerm: "Black Clover",
        source: "Simulation"
    };

    console.log(`[INPUT] Raw Title: "${rawInput.title}"`);
    console.log(`[INPUT] Raw Content: "${rawInput.content.substring(0, 50)}..."`);
    console.log("\n--- EXECUTING ENGINE ---\n");

    // 1. Run the Generator (which calls Cleaner + Visual Intelligence + AI)
    const post = await generateIntelPost([rawInput], new Date());

    if (post) {
        console.log("\n--- POST GENERATED ---");
        console.log(`TITLE:    ${post.title}`);
        console.log(`IMAGE:    ${post.image}`);
        console.log(`SLUG:     ${post.slug}`);

        console.log("\n--- INSERTING TO DATABASE ---");

        // 2. Insert into Supabase
        const { error } = await supabaseAdmin
            .from('posts')
            .upsert({
                id: post.id,
                title: post.title,
                slug: post.slug,
                type: post.type, // INTEL
                content: post.content,
                image: post.image,
                timestamp: post.timestamp,
                is_published: true,
                verification_tier: 1, // Official Site
                verification_reason: 'System Test'
            });

        if (error) {
            console.error("DB INSERT FAILED:", error.message);
        } else {
            console.log("SUCCESS! Post inserted into database.");
            console.log("Please check your Admin Dashboard: http://localhost:3000/admin/dashboard");
        }

    } else {
        console.log("FAILED TO GENERATE POST");
    }
}

runSimulation();
