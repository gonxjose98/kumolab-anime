import type { ShippingRecipient } from '@/lib/printful';

/**
 * Countries the store ships to, with a representative destination for
 * rate lookups. Printful returns FLAT rates per country/region for our
 * products (confirmed against the live store), so a representative zip
 * yields the exact rate the buyer's real address will get, no per-address
 * variance. Keep this list in sync with the Stripe allowed_countries.
 */
export const SHIP_COUNTRIES: Record<string, { label: string; recipient: ShippingRecipient }> = {
    US: { label: 'United States', recipient: { country_code: 'US', state_code: 'CA', city: 'Los Angeles', zip: '90001' } },
    CA: { label: 'Canada', recipient: { country_code: 'CA', state_code: 'ON', city: 'Toronto', zip: 'M5V 2T6' } },
    GB: { label: 'United Kingdom', recipient: { country_code: 'GB', city: 'London', zip: 'SW1A 1AA' } },
    AU: { label: 'Australia', recipient: { country_code: 'AU', state_code: 'NSW', city: 'Sydney', zip: '2000' } },
};

export const SHIP_COUNTRY_CODES = Object.keys(SHIP_COUNTRIES);
