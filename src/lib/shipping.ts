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
    // Added 2026-07-15 — each verified to return a live Printful rate before shipping.
    DE: { label: 'Germany', recipient: { country_code: 'DE', city: 'Berlin', zip: '10115' } },
    FR: { label: 'France', recipient: { country_code: 'FR', city: 'Paris', zip: '75001' } },
    IE: { label: 'Ireland', recipient: { country_code: 'IE', city: 'Dublin', zip: 'D01 F5P2' } },
    NL: { label: 'Netherlands', recipient: { country_code: 'NL', city: 'Amsterdam', zip: '1011 AB' } },
    ES: { label: 'Spain', recipient: { country_code: 'ES', city: 'Madrid', zip: '28001' } },
    IT: { label: 'Italy', recipient: { country_code: 'IT', city: 'Rome', zip: '00184' } },
    NZ: { label: 'New Zealand', recipient: { country_code: 'NZ', city: 'Auckland', zip: '1010' } },
    JP: { label: 'Japan', recipient: { country_code: 'JP', state_code: 'JP-13', city: 'Tokyo', zip: '100-0001' } },
};

export const SHIP_COUNTRY_CODES = Object.keys(SHIP_COUNTRIES);

/** Dropdown options for the storefront country picker — single source of truth,
 *  so the cart UI can never drift from the countries checkout actually supports. */
export const SHIP_COUNTRY_OPTIONS = Object.entries(SHIP_COUNTRIES).map(
    ([code, v]) => ({ code, label: v.label }),
);
