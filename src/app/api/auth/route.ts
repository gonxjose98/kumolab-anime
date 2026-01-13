import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    const { password } = await request.json();

    if (password === 'admin') { // Hardcoded for simplified MVP
        // Next.js 15+ cookies() is async
        const cookieStore = await cookies();
        cookieStore.set('admin_token', 'secure-token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24, // 1 day
            path: '/',
        });
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false }, { status: 401 });
}
