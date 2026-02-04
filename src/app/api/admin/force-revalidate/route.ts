import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export async function GET(req: NextRequest) {
    try {
        console.log('[Admin] Forcing global revalidation...');

        // Revalidate key pages
        revalidatePath('/', 'layout');
        revalidatePath('/blog', 'layout');
        revalidatePath('/blog/[slug]', 'layout');
        revalidatePath('/merch', 'layout');

        return NextResponse.json({
            success: true,
            message: 'Global revalidation triggered across all layouts and routes.'
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
