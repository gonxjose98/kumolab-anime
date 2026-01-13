import { createClient } from '@supabase/supabase-js';

// NOTE: These environment variables need to be set in your .env.local file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// This is a client-side Supabase client for use in browser environments
// For server-side usage in Next.js App Router, prefer using @supabase/ssr package
export const supabase = createClient(supabaseUrl, supabaseKey);
