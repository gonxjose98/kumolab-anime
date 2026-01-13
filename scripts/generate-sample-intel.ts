/**
 * generate-sample-intel.ts
 * Manually generates realistic Intel posts for the last 3 days using the official spec.
 */

import { generateIntelPost } from '../src/lib/engine/generator';
import { getPosts } from '../src/lib/blog';
import fs from 'fs';
import path from 'path';
import { BlogPost } from '../src/types';

const POSTS_PATH = path.join(process.cwd(), 'src/data/posts.json');

async function publishPost(post: BlogPost) {
    const fileContents = fs.readFileSync(POSTS_PATH, 'utf8');
    const posts: BlogPost[] = JSON.parse(fileContents);
    posts.unshift(post);
    fs.writeFileSync(POSTS_PATH, JSON.stringify(posts, null, 2));
    console.log(`[SUCCESS] Published: ${post.title} (${post.timestamp})`);
}

async function main() {
    console.log("Generating sample Intel posts for the last 3 days...");

    const sampleIntel = [
        {
            date: new Date('2026-01-11T12:00:00Z'),
            item: {
                title: "Hell's Paradise",
                tag: "Season 2 Premiere",
                fullTitle: "Hell's Paradise Season 2 Officially Premieres on Crunchyroll",
                slug: "hells-paradise-s2-premiere",
                content: "Gabimaru the Hollow returns as Hell's Paradise Season 2 makes its global debut on Crunchyroll. The quest for the Elixir of Life deepens as new Tensen-class threats emerge.",
                image: "https://images.unsplash.com/photo-1541562232579-512a21360020"
            }
        },
        {
            date: new Date('2026-01-12T12:00:00Z'),
            item: {
                title: "One Piece",
                tag: "Production Hiatus",
                fullTitle: "One Piece Anime Enters 3-Month Production Hiatus",
                slug: "one-piece-hiatus-announcement",
                content: "Toei Animation has confirmed a strategic hiatus for the One Piece anime from January to March 2026 to ensure peak production quality for the upcoming Elbaf Arc.",
                image: "https://images.unsplash.com/photo-1578632767115-351597cf2477"
            }
        },
        {
            date: new Date('2026-01-13T12:00:00Z'),
            item: {
                title: "Boruto: Two Blue Vortex",
                tag: "Official Confirmation",
                fullTitle: "Boruto: Two Blue Vortex Anime Adaptation Confirmed for 2026",
                slug: "boruto-two-blue-vortex-announcement",
                content: "The wait is over. Boruto: Two Blue Vortex is officially coming to screens in 2026. This adaptation will stick faithfully to the manga's high-stakes narrative.",
                image: "https://images.unsplash.com/photo-1626544827763-d516dce335ca"
            }
        }
    ];

    for (const data of sampleIntel) {
        const post = await generateIntelPost([data.item], data.date);
        if (post) {
            await publishPost(post);
        }
    }
}

main().catch(console.error);
