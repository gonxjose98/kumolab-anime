
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const API_KEY = process.env.CONVERTKIT_API_KEY || 'sklg2ChUDpveNjcQR3rVVQ';
        const FORM_ID = process.env.CONVERTKIT_FORM_ID || '8753533';
        const TAG_ID = '14489422'; // KumoLab Subscribers Tag

        if (!API_KEY || !FORM_ID) {
            console.error('Missing ConvertKit configuration');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        // 1. Subscribe to Form
        const formUrl = `https://api.convertkit.com/v3/forms/${FORM_ID}/subscribe`;
        const formResponse = await fetch(formUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: API_KEY, email: email }),
        });

        const formData = await formResponse.json();

        if (!formResponse.ok) {
            return NextResponse.json({ error: formData.message || 'Failed to subscribe to form' }, { status: formResponse.status });
        }

        // 2. Add Tag
        const tagUrl = `https://api.convertkit.com/v3/tags/${TAG_ID}/subscribe`;
        const tagResponse = await fetch(tagUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: API_KEY, email: email }),
        });

        // We don't strictly fail if tagging fails, but we log it
        if (!tagResponse.ok) {
            const tagData = await tagResponse.json();
            console.error('Failed to add tag:', tagData);
        }

        return NextResponse.json({ success: true, data: formData });
    } catch (error) {
        console.error('Subscribe error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
