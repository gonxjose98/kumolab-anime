'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    Inbox,
    Factory,
    Truck,
    PackageCheck,
    XCircle,
    RefreshCw,
    Search,
    ChevronDown,
    ExternalLink,
    MapPin,
} from 'lucide-react';
import type { KumoOrder, OrderStage } from '@/lib/orders';

// The four positive stages, in order, plus canceled as an off-track terminal.
const STAGES: { key: OrderStage; label: string; jp: string; icon: typeof Inbox }[] = [
    { key: 'received', label: 'Received', jp: '受注', icon: Inbox },
    { key: 'production', label: 'In production', jp: '制作中', icon: Factory },
    { key: 'shipped', label: 'Shipped', jp: '発送', icon: Truck },
    { key: 'delivered', label: 'Delivered', jp: '到着', icon: PackageCheck },
];
const STAGE_INDEX: Record<OrderStage, number> = { awaiting: -2, received: 0, production: 1, shipped: 2, delivered: 3, canceled: -1 };

type FilterKey = 'all' | OrderStage;

const money = (n: number, ccy: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy || 'USD' }).format(n || 0);

const shortDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function OrdersBoard({ orders, error }: { orders: KumoOrder[]; error: string | null }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [filter, setFilter] = useState<FilterKey>('all');
    const [query, setQuery] = useState('');
    const [openId, setOpenId] = useState<number | null>(null);
    const [approvingId, setApprovingId] = useState<number | null>(null);
    const [approveErr, setApproveErr] = useState<string | null>(null);

    const counts = useMemo(() => {
        const c: Record<FilterKey, number> = { all: orders.length, awaiting: 0, received: 0, production: 0, shipped: 0, delivered: 0, canceled: 0 };
        for (const o of orders) c[o.stage]++;
        return c;
    }, [orders]);

    const awaiting = useMemo(() => orders.filter((o) => o.stage === 'awaiting'), [orders]);

    async function approve(id: number) {
        setApprovingId(id);
        setApproveErr(null);
        try {
            const res = await fetch('/api/admin/orders/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ orderId: id }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Approve failed (HTTP ${res.status})`);
            startTransition(() => router.refresh());
        } catch (e: any) {
            setApproveErr(e?.message || 'Could not approve the order');
        } finally {
            setApprovingId(null);
        }
    }

    const revenue = useMemo(
        () => orders.filter((o) => o.stage !== 'canceled').reduce((s, o) => s + o.total, 0),
        [orders],
    );
    const currency = orders[0]?.currency || 'USD';

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return orders.filter((o) => {
            // Awaiting-approval orders live in the top banner, not the card list.
            if (o.stage === 'awaiting') return false;
            if (filter !== 'all' && o.stage !== filter) return false;
            if (!q) return true;
            return (
                o.customerName.toLowerCase().includes(q) ||
                (o.customerEmail || '').toLowerCase().includes(q) ||
                String(o.id).includes(q) ||
                (o.externalId || '').toLowerCase().includes(q) ||
                o.items.some((it) => it.name.toLowerCase().includes(q))
            );
        });
    }, [orders, filter, query]);

    const refresh = () => startTransition(() => router.refresh());

    return (
        <div className="ak-ord">
            {/* Approval banner — paid orders waiting for you to approve before
                Printful charges + produces them. Most time-sensitive thing here. */}
            {awaiting.length > 0 && (
                <div className="ak-ord-approve">
                    <div className="ak-ord-approve__head">
                        <span className="ak-ord-approve__badge">{awaiting.length}</span>
                        <div>
                            <div className="ak-ord-approve__title">
                                {awaiting.length === 1 ? 'An order is' : `${awaiting.length} orders are`} awaiting your approval
                            </div>
                            <div className="ak-ord-approve__sub">Customer has paid. Approving sends it to Printful for production, which is when Printful charges you.</div>
                        </div>
                    </div>
                    {approveErr && <div className="ak-ord-error" style={{ marginTop: 10 }}>{approveErr}</div>}
                    <div className="ak-ord-approve__list">
                        {awaiting.map((o) => (
                            <div key={o.id} className="ak-ord-approve__row">
                                <div className="ak-ord-approve__info">
                                    <span className="ak-ord-approve__num">#{o.id}</span>
                                    <span className="ak-ord-approve__cust">{o.customerName}</span>
                                    <span className="ak-ord-approve__items">{o.itemCount} item{o.itemCount === 1 ? '' : 's'} · {o.items.map((i) => i.name).join(', ')}</span>
                                </div>
                                <span className="ak-ord-approve__total">{money(o.total, o.currency)}</span>
                                <button
                                    className="ak-btn ak-btn--primary ak-btn--sm"
                                    onClick={() => approve(o.id)}
                                    disabled={approvingId != null}
                                >
                                    {approvingId === o.id ? 'Approving…' : 'Approve'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Summary strip */}
            <div className="ak-ord-summary">
                {counts.awaiting > 0 && <SummaryChip icon={Inbox} label="To approve" value={counts.awaiting} tone="awaiting" />}
                <SummaryChip icon={Inbox} label="Received" value={counts.received} tone="received" />
                <SummaryChip icon={Factory} label="In production" value={counts.production} tone="production" />
                <SummaryChip icon={Truck} label="Shipped" value={counts.shipped} tone="shipped" />
                <SummaryChip icon={PackageCheck} label="Delivered" value={counts.delivered} tone="delivered" />
                <div className="ak-ord-summary__spacer" />
                <div className="ak-ord-rev">
                    <span className="ak-ord-rev__label">Revenue (active)</span>
                    <span className="ak-ord-rev__value">{money(revenue, currency)}</span>
                </div>
            </div>

            {/* Controls */}
            <div className="ak-ord-controls">
                <div className="ak-ord-filters">
                    {(['all', 'received', 'production', 'shipped', 'delivered', 'canceled'] as FilterKey[]).map((k) => {
                        const label = k === 'all' ? 'All' : STAGES.find((s) => s.key === k)?.label ?? 'Canceled';
                        return (
                            <button
                                key={k}
                                className={`ak-ord-pill ${filter === k ? 'ak-ord-pill--active' : ''}`}
                                onClick={() => setFilter(k)}
                            >
                                {label}
                                <span className="ak-ord-pill__count">{counts[k]}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="ak-ord-tools">
                    <div className="ak-ord-search">
                        <Search size={15} />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search name, email, order #, item"
                            aria-label="Search orders"
                        />
                    </div>
                    <button className="ak-ord-refresh" onClick={refresh} disabled={pending}>
                        <RefreshCw size={15} className={pending ? 'ak-spin' : ''} />
                        {pending ? 'Syncing' : 'Refresh'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="ak-ord-error">
                    Couldn&apos;t reach Printful: {error}. Showing whatever loaded; try Refresh in a moment.
                </div>
            )}

            {/* List */}
            {visible.length === 0 ? (
                <div className="ak-ord-empty">
                    <Inbox size={30} strokeWidth={1.5} />
                    <p>{orders.length === 0 ? 'No orders yet. The moment a customer checks out, it lands here.' : 'No orders match this view.'}</p>
                </div>
            ) : (
                <div className="ak-ord-list">
                    {visible.map((o) => (
                        <OrderCard key={o.id} order={o} open={openId === o.id} onToggle={() => setOpenId(openId === o.id ? null : o.id)} />
                    ))}
                </div>
            )}
        </div>
    );
}

function SummaryChip({ icon: Icon, label, value, tone }: { icon: typeof Inbox; label: string; value: number; tone: string }) {
    return (
        <div className={`ak-ord-chip ak-ord-chip--${tone}`}>
            <Icon size={17} strokeWidth={1.9} />
            <span className="ak-ord-chip__value">{value}</span>
            <span className="ak-ord-chip__label">{label}</span>
        </div>
    );
}

function OrderCard({ order, open, onToggle }: { order: KumoOrder; open: boolean; onToggle: () => void }) {
    const canceled = order.stage === 'canceled';
    const activeIdx = STAGE_INDEX[order.stage];

    return (
        <div className={`ak-ord-card ${open ? 'ak-ord-card--open' : ''} ${canceled ? 'ak-ord-card--canceled' : ''}`}>
            <button className="ak-ord-card__head" onClick={onToggle} aria-expanded={open}>
                <div className="ak-ord-card__id">
                    <span className="ak-ord-card__num">#{order.id}</span>
                    <span className="ak-ord-card__date">{shortDate(order.createdAt)}</span>
                </div>
                <div className="ak-ord-card__who">
                    <span className="ak-ord-card__name">{order.customerName}</span>
                    <span className="ak-ord-card__dest">
                        <MapPin size={11} /> {order.destination}
                    </span>
                </div>

                {canceled ? (
                    <div className="ak-ord-canceled">
                        <XCircle size={15} /> {order.rawStatus === 'failed' ? 'Failed' : 'Canceled'}
                    </div>
                ) : (
                    <div className="ak-ord-track" aria-label={`Status: ${STAGES[activeIdx]?.label}`}>
                        {STAGES.map((s, i) => {
                            const Icon = s.icon;
                            const done = i < activeIdx;
                            const current = i === activeIdx;
                            return (
                                <div key={s.key} className={`ak-ord-node ${done ? 'is-done' : ''} ${current ? 'is-current' : ''}`}>
                                    {i > 0 && <span className="ak-ord-node__line" />}
                                    <span className="ak-ord-node__dot"><Icon size={13} strokeWidth={2} /></span>
                                    <span className="ak-ord-node__label">{s.label}</span>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="ak-ord-card__right">
                    <span className="ak-ord-card__total">{money(order.total, order.currency)}</span>
                    <span className="ak-ord-card__items">{order.itemCount} item{order.itemCount === 1 ? '' : 's'}</span>
                    <ChevronDown size={17} className="ak-ord-card__chev" />
                </div>
            </button>

            {open && (
                <div className="ak-ord-card__body">
                    <div className="ak-ord-detail">
                        <div className="ak-ord-items">
                            {order.items.map((it, i) => (
                                <div key={i} className="ak-ord-item">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {it.thumbnail ? <img src={it.thumbnail} alt="" /> : <div className="ak-ord-item__ph" />}
                                    <div className="ak-ord-item__info">
                                        <span className="ak-ord-item__name">{it.name}</span>
                                        <span className="ak-ord-item__meta">Qty {it.quantity} · {money(it.price, order.currency)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="ak-ord-side">
                            {order.customerEmail && (
                                <div className="ak-ord-side__row">
                                    <span className="ak-ord-side__k">Customer</span>
                                    <span className="ak-ord-side__v">{order.customerEmail}</span>
                                </div>
                            )}
                            <div className="ak-ord-side__row">
                                <span className="ak-ord-side__k">Printful status</span>
                                <span className="ak-ord-side__v ak-ord-side__v--mono">{order.rawStatus || '—'}</span>
                            </div>
                            {order.externalId && (
                                <div className="ak-ord-side__row">
                                    <span className="ak-ord-side__k">Stripe session</span>
                                    <span className="ak-ord-side__v ak-ord-side__v--mono">{order.externalId.slice(0, 22)}…</span>
                                </div>
                            )}

                            <div className="ak-ord-ship">
                                <span className="ak-ord-side__k">Tracking</span>
                                {order.shipments.length === 0 ? (
                                    <span className="ak-ord-ship__none">Not shipped yet</span>
                                ) : (
                                    order.shipments.map((s, i) =>
                                        s.trackingUrl ? (
                                            <a key={i} className="ak-ord-ship__link" href={s.trackingUrl} target="_blank" rel="noopener noreferrer">
                                                <Truck size={13} /> {s.carrier || 'Carrier'} · {s.trackingNumber}
                                                <ExternalLink size={12} />
                                            </a>
                                        ) : (
                                            <span key={i} className="ak-ord-ship__none">{s.carrier || 'Carrier'} · pending tracking</span>
                                        ),
                                    )
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
