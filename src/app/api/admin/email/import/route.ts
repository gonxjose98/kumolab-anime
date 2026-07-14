/**
 * /api/admin/email/import  (owner-only)
 *
 * POST { emails: string[] } OR { emails: "a@b.com, c@d.com\ne@f.com" }
 * Bulk-add subscribers (source 'import'). Invalid addresses are skipped;
 * existing rows are left untouched (never resurrects an unsubscribe).
 * Returns { added, skipped }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAccess } from '@/lib/auth/access';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IMPORT = 5000;

export async function POST(req: NextRequest) {
    const access = await getAccess();
    if (!access.isOwner) {
        return NextResponse.json({ success: false, error: 'Only the owner can manage the email list.' }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const raw: unknown = body?.emails;

        // Accept an array or a pasted newline/comma/semicolon-separated blob.
        let candidates: string[] = [];
        if (Array.isArray(raw)) {
            candidates = raw.filter((e): e is string => typeof e === 'string');
        } else if (typeof raw === 'string') {
            candidates = raw.split(/[\n,;]+/);
        }
        if (candidates.length === 0) {
            return NextResponse.json({ success: false, error: 'Paste at least one email' }, { status: 400 });
        }
        if (candidates.length > MAX_IMPORT) {
            return NextResponse.json({ success: false, error: `Import is capped at ${MAX_IMPORT} emails per batch` }, { status: 400 });
        }

        const seen = new Set<string>();
        const valid: string[] = [];
        let skipped = 0;
        for (const c of candidates) {
            const email = c.trim().toLowerCase();
            if (!email) continue;
            if (!EMAIL_RE.test(email) || seen.has(email)) {
                skipped += 1;
                continue;
            }
            seen.add(email);
            valid.push(email);
        }
        if (valid.length === 0) {
            return NextResponse.json({ success: true, added: 0, skipped });
        }

        // ignoreDuplicates: existing subscribers (any status) are not modified.
        const { data, error } = await supabaseAdmin
            .from('email_subscribers')
            .upsert(
                valid.map((email) => ({ email, status: 'subscribed', source: 'import' })),
                { onConflict: 'email', ignoreDuplicates: true },
            )
            .select('id');
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

        const added = data?.length ?? 0;
        return NextResponse.json({ success: true, added, skipped: skipped + (valid.length - added) });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Import failed' }, { status: 500 });
    }
}
