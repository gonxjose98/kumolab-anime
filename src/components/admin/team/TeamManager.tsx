'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Trash2, Check } from 'lucide-react';

// Kept in sync by hand with src/lib/auth/access.ts PERMISSIONS/PERM_LABELS.
// access.ts pulls in server-only modules, so this client screen can't import
// it (same reason AdminShell uses plain string keys).
const PERM_META: { key: string; label: string; hint: string }[] = [
    { key: 'pending', label: 'Pending review', hint: 'See and approve incoming posts' },
    { key: 'studio', label: 'Studio', hint: 'Edit videos & photos, upload via URL, Library' },
    { key: 'content', label: 'Content', hint: 'Posts, schedule & calendar' },
    { key: 'analytics', label: 'Analytics', hint: 'Reach & performance dashboards' },
    { key: 'store', label: 'Store', hint: 'Products & order approval' },
];

const ALL_ON = (): Record<string, boolean> =>
    Object.fromEntries(PERM_META.map((p) => [p.key, true]));

export type Member = { email: string; perms: Record<string, boolean> };

export default function TeamManager({ members }: { members: Member[] }) {
    return (
        <div className="flex flex-col gap-6" style={{ maxWidth: '760px' }}>
            <AddMemberForm />
            <div className="ak-card ak-card--flush">
                <div className="p-5 pb-3">
                    <span className="ak-title">Team members</span>
                </div>
                {members.length === 0 ? (
                    <div className="ak-empty">
                        <span className="ak-heading">No members yet</span>
                        <span className="ak-caption">Add a login above to give someone access.</span>
                    </div>
                ) : (
                    <ul>
                        {members.map((m) => (
                            <MemberRow key={m.email} member={m} />
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function PermChecks({
    perms,
    onToggle,
    disabled,
}: {
    perms: Record<string, boolean>;
    onToggle: (key: string, val: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {PERM_META.map((p) => (
                <label key={p.key} className="flex items-center gap-2" style={{ cursor: disabled ? 'default' : 'pointer' }} title={p.hint}>
                    <input
                        type="checkbox"
                        checked={!!perms[p.key]}
                        disabled={disabled}
                        onChange={(e) => onToggle(p.key, e.target.checked)}
                        className="ak-checkbox"
                    />
                    <span className="ak-body-sm">{p.label}</span>
                </label>
            ))}
        </div>
    );
}

function MemberRow({ member }: { member: Member }) {
    const router = useRouter();
    const [perms, setPerms] = useState<Record<string, boolean>>(() => ({ ...member.perms }));
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedFlash, setSavedFlash] = useState(false);

    const dirty = PERM_META.some((p) => !!perms[p.key] !== !!member.perms[p.key]);

    async function save() {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/team/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ email: member.email, permissions: perms }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Save failed (HTTP ${res.status})`);
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1800);
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    async function remove() {
        if (!confirm(`Remove ${member.email}? They will lose access immediately.`)) return;
        setRemoving(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/team/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ email: member.email }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Remove failed (HTTP ${res.status})`);
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Remove failed');
            setRemoving(false);
        }
    }

    return (
        <li className="flex flex-col gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="ak-heading">{member.email}</span>
                <div className="flex items-center gap-2">
                    {savedFlash && <span className="ak-caption" style={{ color: '#1d7a4f', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Saved</span>}
                    <button className="ak-btn ak-btn--primary ak-btn--sm" onClick={save} disabled={!dirty || saving || removing}>
                        {saving ? '…' : 'Save'}
                    </button>
                    <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={remove} disabled={saving || removing} title="Remove member">
                        <Trash2 size={14} /> {removing ? '…' : 'Remove'}
                    </button>
                </div>
            </div>
            <PermChecks perms={perms} onToggle={(k, v) => setPerms((prev) => ({ ...prev, [k]: v }))} disabled={saving || removing} />
            {error && <div className="ak-auth__err">{error}</div>}
        </li>
    );
}

function AddMemberForm() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [perms, setPerms] = useState<Record<string, boolean>>(ALL_ON);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function reset() {
        setEmail('');
        setPassword('');
        setPerms(ALL_ON());
        setError(null);
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim() || !password.trim()) {
            setError('Email and password are both required');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/team/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ email: email.trim().toLowerCase(), password, permissions: perms }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Could not add member (HTTP ${res.status})`);
            reset();
            setOpen(false);
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Could not add member');
        } finally {
            setSaving(false);
        }
    }

    if (!open) {
        return (
            <div>
                <button className="ak-btn ak-btn--primary" onClick={() => setOpen(true)}>
                    <UserPlus size={15} /> Add member
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={submit} className="ak-card flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <span className="ak-title">Add a member</span>
                <button type="button" className="ak-btn ak-btn--ghost ak-btn--sm" onClick={() => { setOpen(false); reset(); }} disabled={saving}>Close</button>
            </div>

            <div className="ak-field">
                <label className="ak-field__label">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} placeholder="name@example.com" className="ak-field__input" autoFocus />
            </div>

            <div className="ak-field">
                <label className="ak-field__label">Password <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--ink-3)' }}>(you set it, share it with them)</span></label>
                <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} disabled={saving} placeholder="at least 8 characters" className="ak-field__input" />
            </div>

            <div className="ak-field">
                <label className="ak-field__label">Can access</label>
                <p className="ak-caption" style={{ marginTop: -4, marginBottom: 8 }}>Starts as a full copy of your admin. Switch off what they shouldn&apos;t have.</p>
                <PermChecks perms={perms} onToggle={(k, v) => setPerms((prev) => ({ ...prev, [k]: v }))} disabled={saving} />
            </div>

            {error && <div className="ak-auth__err">{error}</div>}

            <div className="flex justify-end gap-2">
                <button type="button" className="ak-btn ak-btn--secondary" onClick={() => { setOpen(false); reset(); }} disabled={saving}>Cancel</button>
                <button type="submit" className="ak-btn ak-btn--primary" disabled={saving || !email.trim() || !password.trim()}>
                    {saving ? 'Adding…' : 'Add member'}
                </button>
            </div>
        </form>
    );
}
