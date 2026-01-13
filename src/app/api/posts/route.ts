import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { BlogPost } from '@/types';

const postsDirectory = path.join(process.cwd(), 'src/data/posts.json');

function getPosts(): BlogPost[] {
    const fileContents = fs.readFileSync(postsDirectory, 'utf8');
    return JSON.parse(fileContents);
}

function savePosts(posts: BlogPost[]) {
    fs.writeFileSync(postsDirectory, JSON.stringify(posts, null, 2));
}

export async function GET() {
    const posts = getPosts();
    return NextResponse.json(posts);
}

export async function POST(request: Request) {
    const newPost = await request.json();
    const posts = getPosts();

    const postToAdd: BlogPost = {
        ...newPost,
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
    };

    posts.unshift(postToAdd);
    savePosts(posts);

    return NextResponse.json(postToAdd);
}

export async function DELETE(request: Request) {
    const { id } = await request.json();
    let posts = getPosts();
    posts = posts.filter(p => p.id !== id);
    savePosts(posts);
    return NextResponse.json({ success: true });
}
