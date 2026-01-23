import { getPosts } from '@/lib/blog';
import Hero from '@/components/home/Hero';
import ConfirmationAlert from '@/components/home/ConfirmationAlert';
import MostRecentFeed from '@/components/home/MostRecentFeed';
import Manifesto from '@/components/home/Manifesto';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const posts = await getPosts();

  return (
    <>
      <Hero />
      <ConfirmationAlert posts={posts} />
      <MostRecentFeed posts={posts} />
      <Manifesto />
    </>
  );
}


