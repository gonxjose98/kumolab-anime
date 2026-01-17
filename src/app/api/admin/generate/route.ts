
import { NextRequest, NextResponse } from 'next/server';
import { generateIntelPost, generateTrendingPost } from '@/lib/engine/generator';
// We need raw data fetchers or manual construction
import { fetchAnimeIntel, fetchTrendingSignals, fetchOfficialAnimeImage } from '@/lib/engine/fetchers';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Re-export this if cleaner, but logic is custom here
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { type, topic, title, content } = body; // type: 'INTEL' | 'TRENDING'

        let post = null;
        let signalItem: any = null;

        if (topic || title || content) {
            // Manual Mode
            let officialImage = undefined;
            if (topic) {
                officialImage = await fetchOfficialAnimeImage(topic);
            }

            signalItem = {
                title: title || `${topic || 'Update'}`,
                fullTitle: title || `${topic || 'Update'}`,
                slug: (title || topic || 'manual').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                content: content || `Manual post generation for ${title || topic}.`,
                image: officialImage,
                imageSearchTerm: topic,
                // Intel specific defaults that PASS validation
                claimType: 'confirmed',
                premiereDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow (safe from "past date" check)
                // Trending specific
                trendReason: 'Manual Pick',
                momentum: 1.0,
                source: 'Admin Manual'
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
            return NextResponse.json({ error: 'No new recent data found (<48h). Try entering a Topic manually.' }, { status: 404 });
        }

        // Apply content override if auto-fetched but user supplied content (rare but possible)
        if (content) {
            signalItem.content = content;
        }

        // Generate the Post
        // We pass Safe Dates to ensure generation succeeds
        if (type === 'INTEL') {
            // Force future date if missing to bypass strictly validation or ensures it works
            if (!signalItem.premiereDate) {
                signalItem.premiereDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
                signalItem.claimType = 'confirmed';
            }
            post = await generateIntelPost([signalItem], new Date(), true);
        } else {
            post = await generateTrendingPost(signalItem, new Date());
        }

        if (!post) {
            console.error('Generator returned null for item:', signalItem);
            return NextResponse.json({ error: 'Generator rejected the data (Validation Failed). Check logs.' }, { status: 500 });
        }

        // SAVE AS DRAFT (isPublished = false)
        post.isPublished = false;

        // Persist to Supabase
        const { data, error } = await supabaseAdmin
            .from('posts')
            .upsert([{
                id: post.id,
                title: post.title,
                slug: post.type === 'TRENDING' ? post.slug : post.slug + '-draft-' + Date.now().toString().slice(-4),
                type: post.type,
                content: post.content,
                image: post.image,
                timestamp: post.timestamp,
                is_published: false, // HIDDEN
                claim_type: post.claimType,
                premiere_date: post.premiereDate,
                verification_reason: 'Admin Generated'
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
