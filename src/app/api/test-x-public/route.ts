import { NextResponse } from 'next/server';

/**
 * Public test endpoint for X API
 * GET /api/test-x-public
 */
export async function GET() {
    const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;
    
    if (!X_BEARER_TOKEN) {
        return NextResponse.json({
            status: 'error',
            message: 'X_BEARER_TOKEN not configured'
        }, { status: 500 });
    }
    
    // Decode URL-encoded token if needed
    const token = X_BEARER_TOKEN.includes('%') 
        ? X_BEARER_TOKEN.replace(/%2F/g, '/').replace(/%2B/g, '+').replace(/%3D/g, '=')
        : X_BEARER_TOKEN;
    
    try {
        // Test X API
        const response = await fetch('https://api.twitter.com/2/users/by/username/Crunchyroll', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'KumoLab-Test/1.0'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return NextResponse.json({
                status: 'success',
                message: 'X API Bearer Token is working!',
                test_user: {
                    handle: 'Crunchyroll',
                    id: data.data?.id,
                    name: data.data?.name
                },
                token_preview: token.substring(0, 10) + '...' + token.substring(token.length - 5)
            });
        } else {
            const error = await response.json();
            return NextResponse.json({
                status: 'error',
                message: 'X API returned error',
                error_code: response.status,
                error_detail: error.detail || error.message,
                token_preview: token.substring(0, 10) + '...' + token.substring(token.length - 5),
                troubleshooting: error.detail?.includes('Project') 
                    ? 'Token generated before app was moved to Project. Regenerate in Keys and tokens tab.'
                    : 'Check X Developer Portal app settings'
            }, { status: response.status });
        }
    } catch (error: any) {
        return NextResponse.json({
            status: 'error',
            message: 'Failed to test X API',
            error: error.message
        }, { status: 500 });
    }
}