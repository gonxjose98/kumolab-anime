import CheckoutClient from './CheckoutClient';
import { SHIP_COUNTRY_CODES } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/**
 * Reads the ship-to country the customer chose in the cart (passed as ?country),
 * validated against the ship list with a US fallback, and hands it to the
 * embedded checkout so the session prices shipping for the right country.
 */
export default async function CheckoutPage({
    searchParams,
}: {
    searchParams: Promise<{ country?: string }>;
}) {
    const sp = await searchParams;
    const cc = (sp.country || '').toUpperCase();
    const country = SHIP_COUNTRY_CODES.includes(cc) ? cc : 'US';
    return <CheckoutClient country={country} />;
}
