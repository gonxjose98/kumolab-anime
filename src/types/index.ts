export type PostType = 'DROP' | 'INTEL' | 'TRENDING' | 'COMMUNITY' | 'CONFIRMATION_ALERT';
export type ClaimType =
    | 'NEW_SEASON_CONFIRMED'
    | 'DATE_ANNOUNCED'
    | 'DELAY'
    | 'NEW_KEY_VISUAL'
    | 'TRAILER_DROP'
    | 'CAST_ADDITION'
    | 'STAFF_UPDATE'
    | 'TRENDING_UPDATE'
    | 'STALE_CONFIRMATION_ABORT'
    | 'STALE_OR_DUPLICATE_FACT'
    | 'OTHER_ABORT';

export interface BlogPost {
    id?: string;
    title: string;
    slug: string;
    type: PostType;
    claimType?: ClaimType;
    event_fingerprint?: string;
    truth_fingerprint?: string;
    anime_id?: string;
    season_label?: string;
    premiereDate?: string; // ISO format: YYYY-MM-DD
    excerpt?: string; // For meta description or preview
    content: string; // Markdown or HTML
    image?: string; // The final composite image
    background_image?: string; // The raw background image (anime art)
    image_settings?: {
        textScale?: number;
        textPosition?: { x: number; y: number };
        isApplyText?: boolean;
        isApplyGradient?: boolean;
        isApplyWatermark?: boolean;
        purpleWordIndices?: number[];
        gradientPosition?: 'top' | 'bottom';
        imageScale?: number;
        imagePosition?: { x: number; y: number };
        watermarkPosition?: { x: number; y: number };
    };
    is_announcement_tied?: boolean;
    headline?: string;
    timestamp: string; // ISO string
    isPublished: boolean;
    status: 'pending' | 'approved' | 'published' | 'declined';
    sourceTier?: number;
    relevanceScore?: number;
    isDuplicate?: boolean;
    duplicateOf?: number | string;
    scrapedAt?: string;
    approvedAt?: string;
    approvedBy?: string;
    scheduledPostTime?: string;
    published_at?: string;
    expires_at?: string;
    source?: string;
    source_url?: string;
    // Operator-curated social hashtags. NULL = auto-derive at publish
    // (defaultSocialHashtags). When set, this exact list publishes (sanitized,
    // deduped, capped at 6). Edited via the admin editor's hashtag chip row.
    hashtags?: string[];
    // Platform-native post IDs — populated after publisher fires
    twitter_tweet_id?: string;
    twitter_url?: string;
    youtube_video_id?: string;
    youtube_url?: string;
    youtube_embed_url?: string;
    social_ids?: Record<string, string>;
    social_metrics?: Record<string, any>;
    verification_tier?: 'streamer' | 'popularity' | 'format_exception' | number;
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
    price: number;            // live Printful retail_price (the charged price)
    image: string;
    isVisible: boolean;
    description?: string;
    variants?: any[];
    link?: string; // Printful link (optional)
    // KumoLab-side display overrides (merch_settings). The anchor is cosmetic
    // only — never charged. See src/lib/merch.ts + merch_settings migration.
    isFeatured?: boolean;         // flagship — takes the big hero slot on the home band
    anchorPrice?: number | null;  // cosmetic struck-through compare-at price
    label?: string | null;        // e.g. 'Launch price'
    // Placement controls (merch_settings). sortOrder is the manual display order
    // shared by /merch and the home band (asc, nulls last). showOnHome picks
    // which products land in the home Cloud Collection band.
    sortOrder?: number | null;
    showOnHome?: boolean;
}
