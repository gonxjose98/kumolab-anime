
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { selectBestImage } from './src/lib/engine/image-selector';
import { generateIntelImage } from './src/lib/engine/image-processor';
import { randomUUID } from 'crypto';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TARGET_POSTS = [
    {
        id: 'ba31412e-16ca-4a2a-98eb-618a71f9b11f',
        searchTerm: 'Fureru',
        overrideTitle: 'Fureru. Review Update'
    },
    {
        id: '6d0d434f-2ae3-48a5-99aa-d9510595c933',
        searchTerm: "Let's Go Karaoke!",
        overrideTitle: "Let's Go Karaoke! Yama Wayama's Next Work Update"
    },
    {
        id: '4a09e5fc-150e-4a2d-8e9b-0d38cef069dd',
        searchTerm: 'Oshi no Ko Season 3',
        overrideTitle: '[OSHI NO KO] Season 3 Update'
    },
    {
        id: '1c44378e-dc4e-499b-b4ca-8c637090aa55',
        searchTerm: 'Crunchyroll',
        overrideTitle: 'Crunchyroll & The Streaming Landscape 2025'
    }
];

async function fix() {
    console.log('--- Fixing Specific Post Images ---');

    for (const target of TARGET_POSTS) {
        console.log(`\nProcessing: "${target.overrideTitle}" (Search: ${target.searchTerm})`);

        const imageResult = await selectBestImage(target.searchTerm);

        if (!imageResult) {
            console.warn(`No image found for ${target.searchTerm}. Skipping.`);
            continue;
        }

        console.log(`Found image: ${imageResult.url} (Classification: ${imageResult.classification})`);

        const todayStr = new Date().toISOString().split('T')[0];
        const uniqueSlug = `fix-${target.id.substring(0, 4)}-${todayStr}-${randomUUID().substring(0, 4)}`;

        const result = await generateIntelImage({
            sourceUrl: imageResult.url,
            animeTitle: target.overrideTitle,
            headline: '',
            slug: uniqueSlug,
            classification: imageResult.classification,
            applyText: imageResult.classification === 'CLEAN',
            applyGradient: imageResult.classification === 'CLEAN'
        });

        if (result?.processedImage) {
            console.log(`Generated new image: ${result.processedImage}`);

            const { error: updateError } = await supabase
                .from('posts')
                .update({
                    title: target.overrideTitle,
                    image: result.processedImage,
                    status: 'pending', // Ensure it stays pending
                    anime_id: target.searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '-')
                })
                .eq('id', target.id);

            if (updateError) {
                console.error(`Error updating post ${target.id}:`, updateError);
            } else {
                console.log(`Successfully fixed post "${target.overrideTitle}"`);
            }
        } else {
            console.error(`Failed to process image for "${target.overrideTitle}"`);
        }
    }

    console.log('\n--- Done ---');
}

fix();
