import type { BlogPost } from '@/types';

/**
 * Centralized mapping layer to keep DB shape (snake_case) and UI shape (camelCase)
 * consistent across BOTH admin editors.
 */

export function fromDbPost(row: any): BlogPost {
  const scheduledTime = row?.scheduled_post_time ?? row?.scheduledPostTime;
  const sourceTier = row?.source_tier ?? row?.sourceTier ?? 3;
  const relevanceScore = row?.relevance_score ?? row?.relevanceScore ?? 0;
  const scrapedAt = row?.scraped_at ?? row?.scrapedAt;
  const source = row?.source ?? 'Unknown';

  // Canonical: DB uses `excerpt` (short headline/tag used on images + card excerpt).
  const excerpt = (row?.excerpt ?? '').toString();

  return {
    ...(row as any),

    // Canonical UI fields
    isPublished: row?.is_published ?? row?.isPublished ?? false,
    scheduledPostTime: scheduledTime,
    socialIds: row?.social_ids ?? row?.socialIds ?? {},
    sourceTier,
    relevanceScore,
    scrapedAt,
    source,

    excerpt,
  } as BlogPost;
}

export function fromDbPosts(rows: any[] | null | undefined): BlogPost[] {
  if (!rows || rows.length === 0) return [];
  return rows.map(fromDbPost);
}
