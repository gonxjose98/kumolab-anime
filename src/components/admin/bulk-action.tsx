    const handleBulkAction = async (action: 'approve' | 'decline') => {
        if (selectedIds.length === 0) return;

        try {
            // If declining from HIDDEN tab, actually DELETE the posts
            if (action === 'decline' && filter === 'HIDDEN') {
                const res = await fetch('/api/admin/bulk-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: selectedIds })
                });

                if (res.ok) {
                    setPosts(current => current.filter(p => !selectedIds.includes(p.id)));
                    setSelectedIds([]);
                } else {
                    const error = await res.json();
                    console.error('Bulk delete failed:', error);
                    alert('Failed to delete: ' + (error.error || 'Unknown error'));
                }
            } else {
                // Otherwise just update status
                const res = await fetch('/api/posts/bulk', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ids: selectedIds,
                        status: action === 'approve' ? 'published' : 'hidden'
                    })
                });

                if (res.ok) {
                    setPosts(current => current.filter(p => !selectedIds.includes(p.id)));
                    setSelectedIds([]);
                }
            }
        } catch (e) {
            console.error('Bulk action failed:', e);
        }
    };