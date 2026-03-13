import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/scraper-feed
 * Returns today's scraped content organized by category for the Scraper tab.
 * Data resets daily at 6 AM EST.
 */
export async function GET() {
  try {
    // Calculate today's 6 AM EST as the reset point
    const now = new Date();
    const estOffset = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const estNow = new Date(estOffset);
    const today6AM = new Date(estNow);
    today6AM.setHours(6, 0, 0, 0);

    // If it's before 6 AM EST, use yesterday's 6 AM as start
    if (estNow.getHours() < 6) {
      today6AM.setDate(today6AM.getDate() - 1);
    }

    // Convert back to UTC for DB query
    const estToUtcOffset = now.getTime() - estNow.getTime();
    const cutoffUTC = new Date(today6AM.getTime() + estToUtcOffset).toISOString();

    // 1. Fetch detection candidates from today
    const { data: candidates, error: candError } = await supabaseAdmin
      .from('detection_candidates')
      .select('*')
      .gte('detected_at', cutoffUTC)
      .order('detected_at', { ascending: false })
      .limit(200);

    if (candError) {
      console.error('[ScraperFeed] Candidates error:', candError.message);
    }

    // 2. Fetch today's posts (to show what made it through)
    const { data: todayPosts, error: postError } = await supabaseAdmin
      .from('posts')
      .select('id, title, source, status, timestamp, image_url, source_url, claim_type')
      .gte('timestamp', cutoffUTC)
      .order('timestamp', { ascending: false })
      .limit(50);

    if (postError) {
      console.error('[ScraperFeed] Posts error:', postError.message);
    }

    // 3. Fetch source health status
    const { data: sourceHealth } = await supabaseAdmin
      .from('source_health')
      .select('source_name, health_score, is_enabled, last_success, consecutive_failures')
      .order('source_name');

    // 4. Fetch latest scheduler runs for timing info
    const { data: recentRuns } = await supabaseAdmin
      .from('scheduler_runs')
      .select('worker_name, status, completed_at, metadata')
      .order('completed_at', { ascending: false })
      .limit(20);

    // ─── Categorize candidates ───
    const allCandidates = candidates || [];

    const youtube: any[] = [];
    const rssNews: any[] = [];
    const newsroom: any[] = [];
    const other: any[] = [];

    for (const c of allCandidates) {
      const item = {
        id: c.id,
        title: c.title,
        source: c.source_name,
        url: c.source_url,
        detected_at: c.detected_at,
        status: c.status,
        tier: c.source_tier,
        media: c.media_urls,
        content_grade: c.metadata?.content_grade,
        content_category: c.metadata?.content_category,
        content_label: c.metadata?.content_label,
        channel_name: c.metadata?.channel_name,
      };

      if (c.extraction_method === 'YouTube') {
        youtube.push(item);
      } else if (c.extraction_method === 'RSS') {
        rssNews.push(item);
      } else if (c.source_name?.includes('Newsroom') || c.extraction_method === 'HTML') {
        newsroom.push(item);
      } else {
        other.push(item);
      }
    }

    // ─── YouTube channel summary ───
    const ytChannelMap: Record<string, { count: number; bestGrade: number; bestTitle: string }> = {};
    for (const v of youtube) {
      const ch = v.channel_name || v.source?.replace('YouTube_', '') || 'Unknown';
      if (!ytChannelMap[ch]) ytChannelMap[ch] = { count: 0, bestGrade: 0, bestTitle: '' };
      ytChannelMap[ch].count++;
      if ((v.content_grade || 0) > ytChannelMap[ch].bestGrade) {
        ytChannelMap[ch].bestGrade = v.content_grade || 0;
        ytChannelMap[ch].bestTitle = v.title;
      }
    }

    // ─── RSS source summary ───
    const rssSourceMap: Record<string, number> = {};
    for (const r of rssNews) {
      const src = r.source || 'Unknown';
      rssSourceMap[src] = (rssSourceMap[src] || 0) + 1;
    }

    // ─── Last run times ───
    const lastDetection = recentRuns?.find(r => r.worker_name === 'detection');
    const lastProcessing = recentRuns?.find(r => r.worker_name === 'processing');
    const lastDailyDrops = recentRuns?.find(r => r.worker_name === 'dailydrops');

    return NextResponse.json({
      cutoff: cutoffUTC,
      summary: {
        totalCandidates: allCandidates.length,
        youtubeVideos: youtube.length,
        rssArticles: rssNews.length,
        newsroomItems: newsroom.length,
        postsCreated: (todayPosts || []).length,
        postsPending: (todayPosts || []).filter(p => p.status === 'pending').length,
        postsPublished: (todayPosts || []).filter(p => p.status === 'published').length,
      },
      youtube: {
        items: youtube,
        channels: Object.entries(ytChannelMap).map(([name, data]) => ({
          name, ...data,
        })).sort((a, b) => b.bestGrade - a.bestGrade),
      },
      rss: {
        items: rssNews,
        sources: Object.entries(rssSourceMap).map(([name, count]) => ({
          name, count,
        })).sort((a, b) => b.count - a.count),
      },
      newsroom: {
        items: newsroom,
      },
      posts: todayPosts || [],
      health: (sourceHealth || []).map(h => ({
        name: h.source_name,
        score: h.health_score,
        enabled: h.is_enabled,
        lastSuccess: h.last_success,
        failures: h.consecutive_failures,
      })),
      lastRuns: {
        detection: lastDetection ? { at: lastDetection.completed_at, status: lastDetection.status } : null,
        processing: lastProcessing ? { at: lastProcessing.completed_at, status: lastProcessing.status } : null,
        dailyDrops: lastDailyDrops ? { at: lastDailyDrops.completed_at, status: lastDailyDrops.status } : null,
      },
    });
  } catch (err: any) {
    console.error('[ScraperFeed] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
