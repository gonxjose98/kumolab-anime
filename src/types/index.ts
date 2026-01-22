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
    // Social IDs & Cache
    socialIds?: {
        twitter?: string;
        instagram?: string;
        facebook?: string;
        threads?: string;
    };
    socialMetrics?: {
        twitter?: { views: number; likes: number; comments: number; retweets: number };
        instagram?: { views: number; likes: number; comments: number };
        facebook?: { views: number; likes: number; comments: number };
        updatedAt: string;
    };
}

export interface Product {
    id: string;
    name: string;
    price: number;
    image: string;
    isVisible: boolean;
    description?: string;
    variants?: any[];
    link?: string; // Printful link (optional)
}
