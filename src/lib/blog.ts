import fs from 'fs';
import path from 'path';
import { BlogPost } from '@/types';

import { supabase } from './supabase/client';

const postsDirectory = path.join(process.cwd(), 'src/data/posts.json');
const USE_SUPABASE = process.env.NEXT_PUBLIC_USE_SUPABASE === 'true';

export async function getPosts(): Promise<BlogPost[]> {
    if (USE_SUPABASE) {
        const { data, error } = await supabase
            .from('posts')
            .select('*')
            .order('timestamp', { ascending: false });

        if (error) {
            console.error('Supabase fetch error:', error);
            return [];
        }

        // Map snake_case from DB to camelCase for the app
        return (data || []).map(post => {
            let image = post.image;

            // EMERGENCY OVERRIDE: Fix Frieren post image if it's missing or broken in DB
            if (post.slug === 'frieren-s2-announced-2026-01-15' && (!image || image === 'null')) {
                image = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170068-ijY3tCP8KoWP.jpg';
            }

            return {
                ...post,
                image,
                isPublished: post.is_published,
                claimType: post.claim_type,
                premiereDate: post.premiere_date
            };
        });
    }

    // Local JSON Fallback
    // In a real app, we might cache this
    const fileContents = fs.readFileSync(postsDirectory, 'utf8');
    const posts: BlogPost[] = JSON.parse(fileContents);

    // Sort by newest first
    return posts.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
}

export async function getPostBySlug(slug: string): Promise<BlogPost | undefined> {
    const posts = await getPosts();
    return posts.find((post) => post.slug === slug);
}

export async function getLatestPosts(limit: number = 4): Promise<BlogPost[]> {
    const posts = await getPosts();
    return posts.slice(0, limit);
}
