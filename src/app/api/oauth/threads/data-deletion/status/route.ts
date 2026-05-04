import { NextResponse } from 'next/server';

// Status page Meta links the user to after a deletion request. KumoLab
// has no user PII to delete, so this is purely informational.

export const dynamic = 'force-dynamic';

export async function GET() {
    return new NextResponse(
        `<!doctype html><html><head><title>Threads data deletion · KumoLab</title><meta name="robots" content="noindex"></head>
<body style="font-family:system-ui;max-width:640px;margin:3rem auto;padding:0 1rem;line-height:1.5">
<h1>Threads data deletion confirmed</h1>
<p>KumoLab does not store any personal data from Threads users. The integration is publish-only on behalf of the @kumolabanime account.</p>
<p>If you have questions, email <a href="mailto:kumolabanime@gmail.com">kumolabanime@gmail.com</a>.</p>
</body></html>`,
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
}
