    const handleBulkAction = async (action: 'approve' | 'decline') => {
        if (selectedIds.length === 0) return;
        try {
            if (action === 'decline' && filter === 'HIDDEN') {
                const res = await fetch('/api/admin/bulk-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: selectedIds })
                });
                if (res.ok) {
                    setPosts(current => current.filter(p => !selectedIds.includes(p.id)));
                    setSelectedIds([]);
                }
            } else {
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