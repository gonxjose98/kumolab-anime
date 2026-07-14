import { headers } from 'next/headers';
import CartClient from './CartClient';
import { SHIP_COUNTRY_CODES } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/**
 * Server wrapper: pre-select the cart's ship-to country from the visitor's
 * location (Vercel sets x-vercel-ip-country on every request, no geo API).
 * The client dropdown remains the override, and the server still validates
 * and recomputes the rate, so this is pure convenience, no trust in it.
 * Falls back to US (locally the header is absent).
 */
export default async function CartPage() {
    const cc = (await headers()).get('x-vercel-ip-country')?.toUpperCase() || '';
    const initialCountry = SHIP_COUNTRY_CODES.includes(cc) ? cc : 'US';
    return <CartClient initialCountry={initialCountry} />;
}
