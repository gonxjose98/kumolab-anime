import { Film, GalleryHorizontal, ImageIcon } from 'lucide-react';
import type { ScheduleRow, SchedulePlatform } from '@/lib/schedule';

/* Small display helpers shared by ContentHub and SchedulePreview. */

export const PLATFORM_LABEL: Record<SchedulePlatform, string> = {
    instagram: 'IG', facebook: 'FB', threads: 'Threads', website: 'Site',
};

export function kindLabel(r: ScheduleRow): string {
    if (r.kind === 'carousel') return `Carousel · ${r.slides.length}`;
    return r.kind === 'video' ? 'Video' : 'Image';
}

export function KindIcon({ kind, size = 12 }: { kind: ScheduleRow['kind']; size?: number }) {
    if (kind === 'carousel') return <GalleryHorizontal size={size} />;
    if (kind === 'video') return <Film size={size} />;
    return <ImageIcon size={size} />;
}

/** Hosts next/image may optimize (next.config remotePatterns). Others load as-is. */
export function isOptimizable(url: string): boolean {
    try {
        const h = new URL(url).hostname;
        return h.endsWith('.supabase.co') || h === 's4.anilist.co';
    } catch {
        return false;
    }
}
