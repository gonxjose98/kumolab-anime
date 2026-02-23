import { getPosts } from '@/lib/blog';
import Hero from '@/components/home/Hero';
import ConfirmationAlert from '@/components/home/ConfirmationAlert';
import MostRecentFeed from '@/components/home/MostRecentFeed';
import Manifesto from '@/components/home/Manifesto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  let posts: any[] = [];
  
  try {
    posts = await getPosts();
  } catch (error) {
    console.error('[Home] Failed to fetch posts:', error);
    // Return empty array - components will handle empty state
    posts = [];
  }

  return (
    <>
      <Hero />
      <ConfirmationAlert posts={posts} />
      <MostRecentFeed posts={posts} />
      <Manifesto />
    </>
  );
}
