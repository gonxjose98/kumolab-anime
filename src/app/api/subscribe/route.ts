
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const API_KEY = process.env.CONVERTKIT_API_KEY || 'sklg2ChUDpveNjcQR3rVVQ';
        const FORM_ID = process.env.CONVERTKIT_FORM_ID || '8753533';

        if (!API_KEY || !FORM_ID) {
            console.error('Missing ConvertKit configuration');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const url = `https://api.convertkit.com/v3/forms/${FORM_ID}/subscribe`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: API_KEY,
                email: email,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json({ error: data.message || 'Something went wrong' }, { status: response.status });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Subscribe error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
