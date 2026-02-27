import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        supabase_url_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabase_url_length: process.env.NEXT_PUBLIC_SUPABASE_URL?.length || 0,
        service_key_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        service_key_length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
    });
}
