import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Meta data-deletion callback contract:
//   - Receives a POST with a `signed_request` containing the user_id to delete
//   - Must respond with { url, confirmation_code } that the user can hit to
//     confirm deletion was processed
//
// KumoLab does not store any user PII — the Threads API integration only
// publishes posts on behalf of the kumolabanime account itself. There is
// no per-user data to purge. We respond with a deterministic confirmation
// code so Meta's contract is satisfied.

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    let userId = 'anonymous';
    try {
        const form = await req.formData();
        const signed = (form.get('signed_request') as string) || '';
        // Don't bother validating the signature — we have nothing to delete
        // either way. Just pull user_id out for the confirmation code.
        if (signed.includes('.')) {
            const payload = signed.split('.')[1];
            const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
            userId = decoded.user_id || 'anonymous';
        }
    } catch {
        // ignore — we still respond with a valid shape
    }

    const confirmationCode = crypto.createHash('sha256').update(userId + '-kumolab').digest('hex').slice(0, 16);
    return NextResponse.json({
        url: `https://kumolabanime.com/api/oauth/threads/data-deletion/status?code=${confirmationCode}`,
        confirmation_code: confirmationCode,
    });
}

export async function GET() {
    return NextResponse.json({ ok: true, hint: 'POST endpoint for Meta data-deletion contract' });
}
