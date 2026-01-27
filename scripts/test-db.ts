
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log("--- DB CONNECTIVITY TEST ---");
    console.log("Target:", supabaseUrl);

    const testId = randomUUID();
    const testPayload = {
        id: testId,
        title: "DB_CONNECTIVITY_TEST_" + Date.now(),
        slug: "test-" + Date.now(),
        type: "INTEL",
        content: "Ping",
        is_published: true,
        timestamp: new Date().toISOString()
    };

    console.log("Attempting Insert...");
    const { error: insertError } = await supabase.from('posts').insert(testPayload);

    if (insertError) {
        console.error("INSERT FAILED:", insertError);
        return;
    }
    console.log("Insert Success.");

    console.log("Attempting Read...");
    const { data, error: readError } = await supabase
        .from('posts')
        .select('*')
        .eq('id', testId);

    if (readError) {
        console.error("READ FAILED:", readError);
    } else {
        console.log("Read Result:", JSON.stringify(data, null, 2));
    }
}

testConnection();
