
import dotenv from 'dotenv';
import path from 'path';
import { AntigravityAI } from '../src/lib/engine/ai';

// MANUALLY LOAD ENV VARS to guarantee they are seen by the script
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function test() {
    console.log("Testing Antigravity AI Engine (Simulated Environment)...");

    // Check Env
    console.log("ANTIGRAVITY_AI_KEY:", process.env.ANTIGRAVITY_AI_KEY ? "Correctly Loaded" : "MISSING");
    console.log("ANTIGRAVITY_AI_ENDPOINT:", process.env.ANTIGRAVITY_AI_ENDPOINT || "MISSING");

    try {
        const engine = AntigravityAI.getInstance();
        const result = await engine.processEditorialPrompt({
            prompt: "frieren became the highest rated anime. make a post about it"
        });

        console.log("SUCCESS:");
        console.log(JSON.stringify(result, null, 2));

    } catch (e: any) {
        console.error("FAILURE:");
        console.error(e.message);
    }
}

test();
