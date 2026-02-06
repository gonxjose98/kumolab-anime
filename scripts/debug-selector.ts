
import { selectBestImage } from '../src/lib/engine/image-selector';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function findCandidates(title: string) {
    console.log(`Finding image candidates for: ${title}`);
    const result = await selectBestImage(title);
    if (result) {
        console.log('Best Candidate Result:', JSON.stringify(result, null, 2));
    } else {
        console.log('No candidates found.');
    }
}

const title = process.argv[2] || "Frieren Beyond Journey's End";
findCandidates(title);
