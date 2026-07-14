/**
 * /api/admin/email/send  (owner-only)
 *
 * POST { subject, html, text? } → record an email_broadcasts row, send it to
 * every subscribed member via Resend, then mark the row sent/failed.
 * Returns { sent, failed }. If RESEND_API_KEY is missing this responds 400
 * with a clear "connect Resend" message (and the broadcast is marked failed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAccess } from '@/lib/auth/access';
import { sendBroadcast } from '@/lib/email/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
    const access = await getAccess();
    if (!access.isOwner) {
        return NextResponse.json({ success: false, error: 'Only the owner can send broadcasts.' }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
        const html = typeof body?.html === 'string' ? body.html.trim() : '';
        const text = typeof body?.text === 'string' ? body.text.trim() : undefined;
        if (!subject) return NextResponse.json({ success: false, error: 'A subject is required' }, { status: 400 });
        if (!html) return NextResponse.json({ success: false, error: 'A message body is required' }, { status: 400 });

        const { data: broadcast, error: insertErr } = await supabaseAdmin
            .from('email_broadcasts')
            .insert({ subject, body_html: html, body_text: text ?? null, status: 'sending' })
            .select('id')
            .single();
        if (insertErr || !broadcast) {
            return NextResponse.json({ success: false, error: insertErr?.message || 'Could not record the broadcast' }, { status: 500 });
        }

        try {
            const { sent, failed } = await sendBroadcast({ subject, html, text });
            await supabaseAdmin
                .from('email_broadcasts')
                .update({ status: failed > 0 && sent === 0 ? 'failed' : 'sent', sent_count: sent, sent_at: new Date().toISOString() })
                .eq('id', broadcast.id);
            return NextResponse.json({ success: true, sent, failed });
        } catch (e: any) {
            await supabaseAdmin.from('email_broadcasts').update({ status: 'failed' }).eq('id', broadcast.id);
            const msg: string = e?.message || 'Send failed';
            if (msg.includes('RESEND_API_KEY')) {
                return NextResponse.json(
                    { success: false, error: 'Connect Resend first: add RESEND_API_KEY (and a verified sending domain) in the environment, then try again.' },
                    { status: 400 },
                );
            }
            return NextResponse.json({ success: false, error: msg }, { status: 500 });
        }
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Send failed' }, { status: 500 });
    }
}
