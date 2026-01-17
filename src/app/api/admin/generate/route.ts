
import { NextRequest, NextResponse } from 'next/server';
import { generateIntelPost, generateTrendingPost } from '@/lib/engine/generator';
// We need raw data fetchers or manual construction
import { fetchAnimeIntel, fetchTrendingSignals, fetchOfficialAnimeImage } from '@/lib/engine/fetchers';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Re-export this if cleaner, but logic is custom here
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { type, topic, title } = body; // type: 'INTEL' | 'TRENDING'

        let post = null;
        let finalImage = undefined;

        // Custom Logic: If Topic/Title provided, we manufacture a "signal" object manually
        // Instead of fetching from RSS/Reddit.

        let signalItem = null;

        if (topic || title) {
            // Manual Mode
            // 1. Fetch Image based on Topic (if provided) or Title
            const searchTerm = topic || title;
            const officialImage = await fetchOfficialAnimeImage(searchTerm);

            signalItem = {
                title: title || `${searchTerm} Update`, // Fallback title
                fullTitle: title || `${searchTerm} Update`,
                slug: (title || topic).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                content: `Manual post generation for ${title || topic}. Edit content in dashboard.`,
                image: officialImage,
                imageSearchTerm: searchTerm,
                // Intel specific
                claimType: 'confirmed',
                premiereDate: new Date().toISOString().split('T')[0],
                // Trending specific
                trendReason: 'Manual Pick',
                momentum: 1.0
            };
        } else {
            // Auto Mode: Fetch real data
            if (type === 'INTEL') {
                const items = await fetchAnimeIntel();
                if (items.length > 0) signalItem = items[0];
            } else if (type === 'TRENDING') {
                const items = await fetchTrendingSignals();
                if (items.length > 0) signalItem = items[0];
            }
        }

        if (!signalItem) {
            return NextResponse.json({ error: 'No data found for generation' }, { status: 404 });
        }

        // Generate the Post (processing image overlay etc)
        // We set force=true effectively by passing 'now'
        if (type === 'INTEL') {
            post = await generateIntelPost([signalItem], new Date(), true);
        } else {
            post = await generateTrendingPost(signalItem, new Date());
        }

        if (!post) {
            return NextResponse.json({ error: 'Failed to generate post object' }, { status: 500 });
        }

        // SAVE AS DRAFT (isPublished = false)
        post.isPublished = false;

        // Persist to Supabase so it has an ID and can be edited/previewed
        const { data, error } = await supabaseAdmin
            .from('posts')
            .upsert([{
                id: post.id,
                title: post.title,
                slug: post.type === 'TRENDING' ? post.slug : post.slug + '-draft-' + Date.now().toString().slice(-4), // Ensure unique slug for drafts if needed
                type: post.type,
                content: post.content,
                image: post.image,
                timestamp: post.timestamp,
                is_published: false, // HIDDEN
                claim_type: post.claimType,
                premiere_date: post.premiereDate
            }])
            .select()
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true, post: data });

    } catch (error: any) {
        console.error('Generation API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
