import { getPosts } from '@/lib/blog';
import Hero from '@/components/home/Hero';
import MostRecentFeed from '@/components/home/MostRecentFeed';
import Manifesto from '@/components/home/Manifesto';
import TrendingCarousel from '@/components/home/TrendingCarousel';
import LatestUpdates from '@/components/home/LatestUpdates';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const posts = await getPosts();

  return (
    <>
      <Hero />
      <TrendingCarousel posts={posts.filter(p => p.type === 'TRENDING')} />
      <LatestUpdates posts={posts} />
      <MostRecentFeed posts={posts} />
      <Manifesto />
    </>
  );
}

