import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debugMeta() {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) {
        console.error("No META_ACCESS_TOKEN found in .env.local");
        return;
    }

    console.log("--- DEBUGGING META CONNECTION ---");

    try {
        console.log("Fetching pages...");
        const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${token}`);
        const pagesData = await pagesRes.json();

        if (pagesData.error) {
            console.error("!!! API ERROR:", pagesData.error.message);
            console.error("Type:", pagesData.error.type);
            return;
        }

        console.log("\n==============================");
        console.log("FACEBOOK PAGES DETECTED:");
        if (pagesData.data && pagesData.data.length > 0) {
            for (const page of pagesData.data) {
                console.log(`\n> PAGE NAME: ${page.name}`);
                console.log(`> PAGE ID: ${page.id}`);
                console.log("> SCOPES GRANTED ON THIS PAGE:");
                console.log(`  ${page.tasks.join(', ')}`);

                // 2. Try to get Instagram ID for this page
                const igRes = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${token}`);
                const igData = await igRes.json();
                if (igData.instagram_business_account) {
                    console.log(`  INSTAGRAM BUSINESS ID: ${igData.instagram_business_account.id}`);
                } else {
                    console.log(`  (No Instagram Business account linked to this page)`);
                }
            }
        } else {
            console.log("No pages found. Make sure you granted 'pages_show_list' and 'pages_read_engagement' permissions.");
        }

    } catch (e: any) {
        console.error("Debug failed:", e.message);
    }
}

debugMeta();
