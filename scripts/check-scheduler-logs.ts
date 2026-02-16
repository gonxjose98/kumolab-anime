
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkLogs() {
    console.log("Checking last 20 scheduler logs...");
    const { data, error } = await supabase
        .from('scheduler_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(20);

    if (error) {
        console.error("Error fetching logs:", error);
    } else {
        data?.forEach(log => {
            console.log(`[${log.timestamp}] [${log.slot}] [${log.status}] ${log.message}`);
            if (log.details) {
                try {
                    const details = JSON.parse(log.details);
                    if (details.telemetry) {
                        console.log(`  Telemetry: Raw=${details.telemetry.totalRawItems}, Duns=${details.telemetry.duplicatesSkipped}, Neg=${details.telemetry.negativeKeywordsSkipped}, Found=${details.telemetry.candidatesFound}`);
                    }
                    if (details.aborts) {
                        console.log(`  Aborts: ${details.aborts.length} items aborted`);
                        details.aborts.slice(0, 10).forEach((a: any) => console.log(`    - ${a.anime || a.title}: ${a.reason} (${a.event_type})`));
                    }
                    if (details.reason) console.log(`  Reason: ${details.reason}`);
                    if (details.error) console.log(`  Error: ${details.error}`);
                } catch (e) {
                    console.log(`  Details: ${log.details}`);
                }
            }
        });
    }
}

checkLogs();
