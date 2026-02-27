import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        // Check for authorization (simple check - in production use proper auth)
        const authHeader = req.headers.get('authorization');
        if (authHeader !== 'Bearer kumolab-migration-2024') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const results: any = {
            steps: [],
            errors: []
        };

        // Step 1: Add status column
        try {
            const { error: alterError } = await supabaseAdmin.rpc('exec_sql', {
                sql: `alter table public.posts add column if not exists status text default 'published'`
            });
            
            if (alterError) {
                // Try direct SQL if RPC not available
                const { error: directError } = await supabaseAdmin
                    .from('posts')
                    .select('status')
                    .limit(1);
                
                if (directError && directError.message.includes('status')) {
                    // Column doesn't exist, need to create it
                    results.steps.push('Status column needs to be created (RPC not available)');
                } else {
                    results.steps.push('Status column already exists or created successfully');
                }
            } else {
                results.steps.push('Status column added successfully');
            }
        } catch (e: any) {
            results.errors.push(`Step 1 error: ${e.message}`);
        }

        // Step 2: Update existing posts
        try {
            const { data: unpublishedPosts, error: fetchError } = await supabaseAdmin
                .from('posts')
                .select('id')
                .eq('is_published', false);

            if (fetchError) {
                results.errors.push(`Fetch error: ${fetchError.message}`);
            } else if (unpublishedPosts && unpublishedPosts.length > 0) {
                // Update in batches
                const batchSize = 100;
                let updatedCount = 0;
                
                for (let i = 0; i < unpublishedPosts.length; i += batchSize) {
                    const batch = unpublishedPosts.slice(i, i + batchSize);
                    const ids = batch.map(p => p.id);
                    
                    const { error: updateError } = await supabaseAdmin
                        .from('posts')
                        .update({ status: 'pending' })
                        .in('id', ids);
                    
                    if (updateError) {
                        results.errors.push(`Batch update error: ${updateError.message}`);
                    } else {
                        updatedCount += batch.length;
                    }
                }
                
                results.steps.push(`Updated ${updatedCount} unpublished posts to 'pending'`);
            } else {
                results.steps.push('No unpublished posts to update');
            }
        } catch (e: any) {
            results.errors.push(`Step 2 error: ${e.message}`);
        }

        // Step 3: Update published posts
        try {
            const { data: publishedPosts, error: fetchError } = await supabaseAdmin
                .from('posts')
                .select('id')
                .eq('is_published', true);

            if (fetchError) {
                results.errors.push(`Fetch published error: ${fetchError.message}`);
            } else if (publishedPosts && publishedPosts.length > 0) {
                const batchSize = 100;
                let updatedCount = 0;
                
                for (let i = 0; i < publishedPosts.length; i += batchSize) {
                    const batch = publishedPosts.slice(i, i + batchSize);
                    const ids = batch.map(p => p.id);
                    
                    const { error: updateError } = await supabaseAdmin
                        .from('posts')
                        .update({ status: 'published' })
                        .in('id', ids);
                    
                    if (updateError) {
                        results.errors.push(`Published batch error: ${updateError.message}`);
                    } else {
                        updatedCount += batch.length;
                    }
                }
                
                results.steps.push(`Updated ${updatedCount} published posts to 'published'`);
            }
        } catch (e: any) {
            results.errors.push(`Step 3 error: ${e.message}`);
        }

        return NextResponse.json({
            success: results.errors.length === 0,
            results,
            message: results.errors.length > 0 
                ? 'Migration completed with errors' 
                : 'Migration completed successfully'
        });

    } catch (err: any) {
        console.error('Migration error:', err);
        return NextResponse.json({ 
            error: err.message,
            stack: err.stack 
        }, { status: 500 });
    }
}
