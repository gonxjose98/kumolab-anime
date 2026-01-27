
import { AntigravityAI } from '../src/lib/engine/ai';

async function test() {
    console.log("Testing Antigravity AI Engine...");

    // Check Env
    console.log("ANTIGRAVITY_AI_KEY:", process.env.ANTIGRAVITY_AI_KEY ? "EXISTS" : "MISSING");
    console.log("ANTIGRAVITY_AI_ENDPOINT:", process.env.ANTIGRAVITY_AI_ENDPOINT || "DEFAULT (openai.com)");
    console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "EXISTS" : "MISSING");

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
        if (e.response) {
            console.error("Status:", e.status);
            console.error("Data:", e.response.data);
        }
    }
}

test();
