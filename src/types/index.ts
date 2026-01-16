export type PostType = 'DROP' | 'INTEL' | 'TRENDING' | 'COMMUNITY';
export type ClaimType = 'confirmed' | 'premiered' | 'now_streaming' | 'delayed' | 'trailer' | 'finale_aired';

export interface BlogPost {
    id: string;
    title: string;
    slug: string;
    type: PostType;
    claimType?: ClaimType;
    premiereDate?: string; // ISO format: YYYY-MM-DD
    excerpt?: string; // For meta description or preview
    content: string; // Markdown or HTML
    image?: string;
    timestamp: string; // ISO string
    isPublished: boolean;
    verification_tier?: 'streamer' | 'popularity' | 'format_exception';
    verification_reason?: string;
    verification_sources?: any;
}

export interface Product {
    id: string;
    name: string;
    price: number;
    image: string;
    isVisible: boolean;
    link?: string; // Printful link (optional)
}
