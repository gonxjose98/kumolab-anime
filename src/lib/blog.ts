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
            // We force it to our local social image which HAS the required text.
            if (post.slug === 'frieren-s2-announced-2026-01-15') {
                image = '/blog/intel/frieren-s2-announced-2026-01-15-social.png';
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
