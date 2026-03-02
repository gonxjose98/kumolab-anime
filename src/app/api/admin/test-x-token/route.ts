import { NextRequest, NextResponse } from 'next/server';

/**
 * Diagnostic endpoint to verify X API Bearer Token
 * GET /api/admin/test-x-token
 */
export async function GET(req: NextRequest) {
    const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;
    
    if (!X_BEARER_TOKEN) {
        return NextResponse.json({
            status: 'error',
            message: 'X_BEARER_TOKEN not set in environment variables',
            deployed: false
        }, { status: 500 });
    }
    
    // Mask token for display
    const maskedToken = X_BEARER_TOKEN.substring(0, 10) + '...' + X_BEARER_TOKEN.substring(X_BEARER_TOKEN.length - 5);
    
    try {
        // Test 1: User lookup
        const userRes = await fetch('https://api.twitter.com/2/users/by/username/Crunchyroll', {
            headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` }
        });
        
        if (userRes.ok) {
            const data = await userRes.json();
            return NextResponse.json({
                status: 'success',
                message: 'X API Bearer Token is working correctly',
                deployed: true,
                token_preview: maskedToken,
                test_result: {
                    user_lookup: '✅ PASS',
                    crunchyroll_user_id: data.data?.id
                }
            });
        } else {
            const error = await userRes.json();
            return NextResponse.json({
                status: 'error',
                message: 'X API token rejected',
                deployed: true,
                token_preview: maskedToken,
                error_detail: error.detail,
                action_needed: error.detail?.includes('Project') 
                    ? 'App must be attached to a Project in X Developer Portal (developer.twitter.com)'
                    : 'Check token validity in X Developer Portal'
            }, { status: 403 });
        }
    } catch (error: any) {
        return NextResponse.json({
            status: 'error',
            message: 'Failed to test X API',
            error: error.message
        }, { status: 500 });
    }
}