/**
 * /api/admin/email/templates  (owner-only; middleware also gates /api/admin/email/*)
 *
 * GET  — every system email template: field metadata + effective copy
 *        (defaults merged with any saved overrides).
 * POST — { action: 'save', key, fields }    → persist edited wording for one email.
 *        { action: 'preview', key, fields } → render that email's HTML with
 *        SAMPLE data + the given (possibly unsaved) copy, for the live preview
 *        iframe. Pure render: nothing is sent, nothing is written.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAccess } from '@/lib/auth/access';
import {
    EMAIL_TEMPLATE_KEYS,
    type EmailTemplateKey,
    getSystemEmailTemplates,
    saveEmailCopy,
    mergeCopy,
    renderEmailPreview,
} from '@/lib/email/templates';

export const dynamic = 'force-dynamic';

function isTemplateKey(key: unknown): key is EmailTemplateKey {
    return typeof key === 'string' && (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(key);
}

export async function GET() {
    const access = await getAccess();
    if (!access.isOwner) {
        return NextResponse.json({ ok: false, reason: 'Only the owner can manage email templates.' }, { status: 403 });
    }
    const templates = await getSystemEmailTemplates();
    return NextResponse.json({ ok: true, templates });
}

export async function POST(req: NextRequest) {
    const access = await getAccess();
    if (!access.isOwner) {
        return NextResponse.json({ ok: false, reason: 'Only the owner can manage email templates.' }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const action = typeof body?.action === 'string' ? body.action : 'save';
        if (!isTemplateKey(body?.key)) {
            return NextResponse.json({ ok: false, reason: `unknown template "${body?.key}"` }, { status: 400 });
        }
        const key = body.key;

        if (action === 'preview') {
            const copy = mergeCopy(key, body?.fields);
            const { subject, html } = renderEmailPreview(key, copy);
            return NextResponse.json({ ok: true, subject, html });
        }

        if (action === 'save') {
            const res = await saveEmailCopy(key, body?.fields);
            if (!res.ok) return NextResponse.json(res, { status: 400 });
            // Return the new effective copy so the UI can resync its baseline.
            const templates = await getSystemEmailTemplates();
            const saved = templates.find((t) => t.key === key);
            return NextResponse.json({ ok: true, copy: saved?.copy ?? null });
        }

        return NextResponse.json({ ok: false, reason: `unknown action: ${action}` }, { status: 400 });
    } catch (e: any) {
        console.error('[email/templates] error', e);
        return NextResponse.json({ ok: false, reason: e?.message || 'Internal error' }, { status: 500 });
    }
}
