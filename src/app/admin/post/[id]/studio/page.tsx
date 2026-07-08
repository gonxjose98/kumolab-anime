'use client';

import { useParams } from 'next/navigation';
import StudioApp from '@/components/admin/studio/StudioApp';

// Full-screen video editor. Auth + the .admin-root design context are inherited
// from the parent /admin/post layout (AdminShell); StudioApp renders as a fixed
// full-viewport overlay on top of the shell.
export default function StudioPage() {
    const params = useParams();
    const id = params?.id as string;
    if (!id) return null;
    return <StudioApp postId={id} />;
}
