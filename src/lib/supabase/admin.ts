
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// This is a server-side client that uses the SERVICE_ROLE_KEY if available
// Use this for administrative tasks like image uploads to storage
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
