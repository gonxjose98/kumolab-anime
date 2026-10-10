import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import MediaFolders from '@/components/admin/studio/MediaFolders';

export const dynamic = 'force-dynamic';

/**
 * Content > Media: folders of loose pictures/videos the team uploads. Not
 * posts; they never publish on their own. New carousel and the editor pull
 * slides from here.
 */
export default function ContentMediaPage() {
    return (
        <div className="max-w-6xl mx-auto">
            <Link href="/admin/content" className="ak-btn ak-btn--ghost ak-btn--sm" style={{ marginBottom: 14 }}>
                <ArrowLeft size={14} /> Back to Content
            </Link>
            <MediaFolders />
        </div>
    );
}
