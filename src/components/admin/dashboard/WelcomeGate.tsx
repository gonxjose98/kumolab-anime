'use client';

import { useEffect, useRef, useState } from 'react';
import WelcomeCinematic from './WelcomeCinematic';

/**
 * Mounts the one-time welcome cinematic for a member's first login, then
 * consumes the flag server-side so it never plays again (and the owner's Team
 * toggle auto-clears). The consume fires once on mount — as soon as the
 * dashboard loads it's marked seen, even if they navigate away mid-animation.
 */
export default function WelcomeGate({ name }: { name: string }) {
    const [show, setShow] = useState(true);
    const consumed = useRef(false);

    useEffect(() => {
        if (consumed.current) return;
        consumed.current = true;
        fetch('/api/admin/welcome/seen', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    }, []);

    if (!show) return null;
    return <WelcomeCinematic name={name} onDone={() => setShow(false)} />;
}
