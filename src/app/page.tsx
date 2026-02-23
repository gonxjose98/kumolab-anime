import { Suspense } from 'react';
import { getPosts } from '@/lib/blog';
import Hero from '@/components/home/Hero';
import StatsBar from '@/components/home/StatsBar';
import ConfirmationAlert from '@/components/home/ConfirmationAlert';
import TodaysDrops from '@/components/home/TodaysDrops';
import MostRecentFeed from '@/components/home/MostRecentFeed';
import Manifesto from '@/components/home/Manifesto';
import { 
  HomePageSkeleton, 
  BlogListSkeleton 
} from '@/components/shared/SkeletonLoader';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function PostsContent() {
  let posts: any[] = [];
  
  try {
    posts = await getPosts();
  } catch (error) {
    console.error('[Home] Failed to fetch posts:', error);
    posts = [];
  }

  return (
    <>
      <ConfirmationAlert posts={posts} />
      <TodaysDrops posts={posts} />
      <Manifesto />
      <MostRecentFeed posts={posts} />
    </>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <StatsBar />
      <Suspense fallback={<HomePageSkeleton />}>
        <PostsContent />
      </Suspense>
    </>
  );
}
