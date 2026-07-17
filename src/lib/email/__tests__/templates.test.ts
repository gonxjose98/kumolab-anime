import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getEmailCopy's safety contract: it runs inside the Stripe webhook path, so
 * it must NEVER throw and must always return complete copy, whatever the DB
 * does (throws, errors, missing row, junk fields).
 */

const maybeSingle = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
    supabaseAdmin: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({ maybeSingle })),
                in: vi.fn(async () => ({ data: [], error: null })),
            })),
        })),
    },
}));

import { getEmailCopy, mergeCopy, renderEmailPreview, EMAIL_COPY_DEFAULTS, EMAIL_TEMPLATE_KEYS } from '@/lib/email/templates';

beforeEach(() => {
    maybeSingle.mockReset();
});

describe('getEmailCopy', () => {
    it('returns the defaults when the DB read throws', async () => {
        maybeSingle.mockRejectedValue(new Error('connection refused'));
        const copy = await getEmailCopy('order_confirmation');
        expect(copy).toEqual(EMAIL_COPY_DEFAULTS.order_confirmation);
    });

    it('returns the defaults when the DB returns an error (e.g. table missing)', async () => {
        maybeSingle.mockResolvedValue({ data: null, error: { message: 'relation "email_templates" does not exist' } });
        const copy = await getEmailCopy('cart_recovery');
        expect(copy).toEqual(EMAIL_COPY_DEFAULTS.cart_recovery);
    });

    it('returns the defaults when there is no override row', async () => {
        maybeSingle.mockResolvedValue({ data: null, error: null });
        const copy = await getEmailCopy('forecast');
        expect(copy).toEqual(EMAIL_COPY_DEFAULTS.forecast);
    });

    it('merges overrides over the defaults, field by field', async () => {
        maybeSingle.mockResolvedValue({ data: { fields: { subject: 'Custom subject!' } }, error: null });
        const copy = await getEmailCopy('welcome');
        expect(copy.subject).toBe('Custom subject!');
        expect(copy.heading).toBe(EMAIL_COPY_DEFAULTS.welcome.heading);
    });

    it('ignores junk override values (non-strings, empties, unknown ids)', async () => {
        maybeSingle.mockResolvedValue({
            data: { fields: { subject: '   ', heading: 42, hacker: 'x' } },
            error: null,
        });
        const copy = await getEmailCopy('welcome');
        expect(copy).toEqual(EMAIL_COPY_DEFAULTS.welcome);
        expect('hacker' in copy).toBe(false);
    });
});

describe('mergeCopy + renderEmailPreview', () => {
    it('renders every template with defaults and includes edited copy in the html', () => {
        for (const key of EMAIL_TEMPLATE_KEYS) {
            const { subject, html } = renderEmailPreview(key);
            expect(subject.length).toBeGreaterThan(0);
            expect(html).toContain('kumolab-cloud-mark-gold.png');
        }
        const edited = mergeCopy('cart_recovery', { heading: 'Come back, your cart misses you' });
        const { html } = renderEmailPreview('cart_recovery', edited);
        expect(html).toContain('Come back, your cart misses you');
    });

    it('escapes html in edited copy and substitutes order tokens', () => {
        const edited = mergeCopy('order_confirmation', {
            subject: 'Order {orderNumber} confirmed',
            heading: 'Hi {firstName} <script>alert(1)</script>',
        });
        const { subject, html } = renderEmailPreview('order_confirmation', edited);
        expect(subject).toBe('Order A1B2C3D4 confirmed');
        expect(html).toContain('Hi Aiko');
        expect(html).not.toContain('<script>');
    });
});
