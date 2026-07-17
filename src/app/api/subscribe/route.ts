/**
 * Public homepage signup. Writes straight into our own list
 * (email_subscribers) instead of ConvertKit: KumoLab owns its audience.
 * Idempotent: re-submitting the same email succeeds without a duplicate.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }
        if (!EMAIL_RE.test(email) || email.length > 254) {
            return NextResponse.json({ error: 'Please enter a valid email' }, { status: 400 });
        }

        // Was this address already on the list? Decides whether the welcome
        // email fires (only for genuinely new signups). Best-effort: if the
        // check fails we treat them as existing so nobody gets a duplicate.
        let isNew = false;
        try {
            const { data: existing } = await supabaseAdmin
                .from('email_subscribers')
                .select('id')
                .eq('email', email)
                .maybeSingle();
            isNew = !existing;
        } catch {
            isNew = false;
        }

        // Upsert on email: signing up again (even after unsubscribing) simply
        // re-subscribes; it never errors and never creates a duplicate row.
        const { error } = await supabaseAdmin
            .from('email_subscribers')
            .upsert(
                { email, status: 'subscribed', source: 'homepage', unsubscribed_at: null },
                { onConflict: 'email' },
            );

        if (error) {
            console.error('Subscribe insert failed:', error.message);
            return NextResponse.json({ error: 'Could not subscribe right now, please try again' }, { status: 500 });
        }

        // Welcome email for new signups. Gated by WELCOME_EMAIL_ENABLED=true so
        // nothing sends until the owner turns it on; sendWelcomeEmail itself is
        // best-effort and never throws, so signup can never fail because of it.
        if (isNew && process.env.WELCOME_EMAIL_ENABLED === 'true') {
            let token: string | null = null;
            try {
                const { data: row } = await supabaseAdmin
                    .from('email_subscribers')
                    .select('unsubscribe_token')
                    .eq('email', email)
                    .maybeSingle();
                token = (row?.unsubscribe_token as string) ?? null;
            } catch {
                token = null;
            }
            const { sendWelcomeEmail } = await import('@/lib/email/welcome');
            await sendWelcomeEmail(email, token);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Subscribe error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
