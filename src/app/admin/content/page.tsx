import ContentHub from '@/components/admin/content/ContentHub';
import { getContentHub, type ContentView } from '@/lib/content/hub';

export const dynamic = 'force-dynamic';

const VIEWS: ContentView[] = ['posted', 'next', 'review', 'drafts'];

/**
 * Content (Content + Studio merged). Deep links: ?view=posted|next|review|drafts,
 * and ?new=carousel&topic=… (AI Insights' "Make a carousel").
 */
export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
    const sp = await searchParams;
    const data = await getContentHub();
    const view = VIEWS.includes(sp.view as ContentView) ? (sp.view as ContentView) : null;
    const newCarousel = sp.new === 'carousel' ? { topic: (sp.topic || '').slice(0, 200) } : null;
    return <ContentHub data={data} initialView={view} newCarousel={newCarousel} />;
}
