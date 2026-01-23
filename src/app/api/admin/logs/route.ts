
import { NextResponse } from 'next/server';
import { getSchedulerLogs } from '@/lib/logging/scheduler';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const logs = await getSchedulerLogs();
        return NextResponse.json({ success: true, logs });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
