import Image from "next/image";
import { getPosts } from '@/lib/blog';
import Hero from '@/components/home/Hero';
import TrendingCarousel from '@/components/home/TrendingCarousel';
import LatestUpdates from '@/components/home/LatestUpdates';
import Manifesto from '@/components/home/Manifesto';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const posts = await getPosts();

  // Logic: Trending gets the latest 4
  const trendingPosts = posts.slice(0, 4);

  // Logic: Latest Updates gets everything except 'DROP' type (per requirements), maybe skip the top 4 if redundant?
  // "Shows only: Anime Intel, Confirmations, Delays... No Daily Drops here"
  // If Trending shows drops, we shouldn't show them in Latest Updates anyway.
  // The User didn't strictly say Trending excludes Drops, but Latest Updates definitely does.
  const updatePosts = posts.filter(p => p.type !== 'DROP');

  return (
    <>
      <Hero />
      <TrendingCarousel posts={trendingPosts} />
      <LatestUpdates posts={updatePosts} />
      <Manifesto />
    </>
  );
}
