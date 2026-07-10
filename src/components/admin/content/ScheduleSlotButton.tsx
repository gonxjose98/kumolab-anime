'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import SchedulePicker from './SchedulePicker';

/**
 * The clickable time in the Content > Schedule list. Editable only for future
 * scheduled (approved) posts; published/past slots render as plain text. Opens
 * SchedulePicker (wheel + manual) and saves via the posts PUT endpoint.
 */
export default function ScheduleSlotButton({
    id, title, iso, slotLabel, editable,
}: {
    id: string;
    title: string;
    iso: string;
    slotLabel: string;
    editable: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    if (!editable) return <span className="ak-sched__time">{slotLabel}</span>;

    async function save(when: Date) {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/api/posts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ id, scheduled_post_time: when.toISOString() }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Reschedule failed (HTTP ${res.status})`);
            setOpen(false);
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Reschedule failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <button
                type="button"
                className="ak-sched__time ak-sched__time--edit"
                onClick={() => { setError(null); setOpen(true); }}
                title="Tap to reschedule"
            >
                {slotLabel}
                <Pencil size={11} />
            </button>
            {open && (
                <SchedulePicker
                    title={title}
                    initialIso={iso}
                    busy={busy}
                    error={error}
                    onCancel={() => setOpen(false)}
                    onSave={save}
                />
            )}
        </>
    );
}
