import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Editable copy for the automated ("system") emails.
 *
 * Each system email keeps its branded HTML LAYOUT here in code; only the
 * WORDING (subject, heading, intro, CTA label, ...) is editable from the
 * admin Email tab. Edited copy lives in the email_templates table and is
 * merged over the hardcoded DEFAULTS below at send time.
 *
 * CRITICAL CONTRACT: getEmailCopy() can NEVER throw and always returns a
 * complete copy object. The order emails run inside the Stripe webhook
 * (the customer has already paid), so a DB hiccup here must degrade to the
 * default wording, never to a failed send.
 *
 * The pure render* functions build { subject, html, text } for each email and
 * are shared by the real senders AND the admin live preview, so what Jose
 * previews is exactly what a customer receives.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://kumolabanime.com';
const MAX_LEN = 2000;

export const EMAIL_TEMPLATE_KEYS = ['order_confirmation', 'cart_recovery', 'forecast', 'welcome'] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

/** A complete set of wording strings for one email (defaults merged with any overrides). */
export type EmailCopy = Record<string, string>;

export interface EmailTemplateField {
    id: string;
    label: string;
    multiline?: boolean;
    hint?: string;
}

/** What the admin UI needs to render one editable system email. */
export interface SystemEmailTemplate {
    key: EmailTemplateKey;
    name: string;
    fires: string;
    note?: string;
    fields: EmailTemplateField[];
    copy: EmailCopy;
    defaults: EmailCopy;
}

// ── Defaults: the current wording, verbatim ───────────────────────────────────
// {firstName} and {orderNumber} are substituted at send time where noted.

export const EMAIL_COPY_DEFAULTS: Record<EmailTemplateKey, EmailCopy> = {
    order_confirmation: {
        subject: 'Your KumoLab order is confirmed (#{orderNumber})',
        heading: 'Thanks for your order, {firstName}.',
        intro: 'Your order is confirmed and we are getting it ready.',
        closing: 'We will email you tracking as soon as it ships. Questions about your order? Just reply to this email.',
        footer: 'KumoLab · the cloud sees everything first',
    },
    cart_recovery: {
        subject: 'You left something in your cart',
        heading: 'Your cart is still up here in the clouds.',
        intro: 'You were this close. We kept everything exactly where you left it:',
        cta: 'Finish checking out',
        closing: 'Questions? Just reply to this email.',
    },
    forecast: {
        subject: 'The Forecast: this week in anime',
        intro: 'One calm email. Here is everything confirmed this week: drops, dates, and trailers, no rumors.',
        signoff: 'See you next Sunday. The cloud sees everything first.',
        footer: 'You joined The Forecast at kumolabanime.com, so this lands once a week.',
    },
    welcome: {
        subject: 'Welcome to The Forecast',
        heading: 'Welcome aboard the cloud.',
        intro: 'You joined The Forecast: one calm email a week with the confirmed drops, dates, and trailers. No rumors, no spam.',
        cta: 'See what dropped this week',
        footer: 'KumoLab · the cloud sees everything first',
    },
};

export const EMAIL_TEMPLATE_META: Record<
    EmailTemplateKey,
    { name: string; fires: string; fields: EmailTemplateField[] }
> = {
    order_confirmation: {
        name: 'Order confirmation',
        fires: 'Sends when a customer completes checkout.',
        fields: [
            { id: 'subject', label: 'Subject', hint: '{orderNumber} inserts the order number.' },
            { id: 'heading', label: 'Greeting heading', hint: "{firstName} inserts the customer's first name." },
            { id: 'intro', label: 'Intro line', multiline: true },
            { id: 'closing', label: 'Closing line', multiline: true },
            { id: 'footer', label: 'Footer tagline' },
        ],
    },
    cart_recovery: {
        name: 'Cart recovery',
        fires: 'Sends once when a started checkout expires without paying.',
        fields: [
            { id: 'subject', label: 'Subject' },
            { id: 'heading', label: 'Heading' },
            { id: 'intro', label: 'Intro line', multiline: true },
            { id: 'cta', label: 'Button label' },
            { id: 'closing', label: 'Closing line', multiline: true },
        ],
    },
    forecast: {
        name: 'The Forecast (weekly)',
        fires: "Sends weekly to the list. The week's confirmed-news sections are built automatically; you edit the framing.",
        fields: [
            { id: 'subject', label: 'Subject' },
            { id: 'intro', label: 'Intro line', multiline: true },
            { id: 'signoff', label: 'Sign-off line', multiline: true },
            { id: 'footer', label: 'Footer line' },
        ],
    },
    welcome: {
        name: 'Welcome',
        fires: 'Sends when someone new joins the list from the homepage.',
        fields: [
            { id: 'subject', label: 'Subject' },
            { id: 'heading', label: 'Heading' },
            { id: 'intro', label: 'Intro line', multiline: true },
            { id: 'cta', label: 'Button label' },
            { id: 'footer', label: 'Footer tagline' },
        ],
    },
};

// ── Copy loading / saving ─────────────────────────────────────────────────────

/** Merge raw override fields over the defaults for a key. Pure, never throws. */
export function mergeCopy(key: EmailTemplateKey, raw: unknown): EmailCopy {
    const out: EmailCopy = { ...EMAIL_COPY_DEFAULTS[key] };
    if (raw && typeof raw === 'object') {
        for (const id of Object.keys(out)) {
            const v = (raw as Record<string, unknown>)[id];
            if (typeof v === 'string' && v.trim()) out[id] = v.trim().slice(0, MAX_LEN);
        }
    }
    return out;
}

/**
 * The effective copy for one email: DB overrides merged over the defaults.
 * NEVER throws and always returns every field (webhook-safe: a DB failure
 * simply means the default wording is used).
 */
export async function getEmailCopy(key: EmailTemplateKey): Promise<EmailCopy> {
    try {
        const { data, error } = await supabaseAdmin
            .from('email_templates')
            .select('fields')
            .eq('key', key)
            .maybeSingle();
        if (error || !data?.fields) return { ...EMAIL_COPY_DEFAULTS[key] };
        return mergeCopy(key, data.fields);
    } catch {
        return { ...EMAIL_COPY_DEFAULTS[key] };
    }
}

/**
 * Persist the edited wording for one email. Only values that differ from the
 * default are stored, so clearing a field (or matching the default) falls
 * back to the code default, and future default improvements show through.
 */
export async function saveEmailCopy(key: string, raw: unknown): Promise<{ ok: boolean; reason?: string }> {
    if (!(EMAIL_TEMPLATE_KEYS as readonly string[]).includes(key)) {
        return { ok: false, reason: `unknown template "${key}"` };
    }
    const k = key as EmailTemplateKey;
    const defaults = EMAIL_COPY_DEFAULTS[k];
    const overrides: EmailCopy = {};
    if (raw && typeof raw === 'object') {
        for (const id of Object.keys(defaults)) {
            const v = (raw as Record<string, unknown>)[id];
            if (typeof v === 'string') {
                const t = v.trim().slice(0, MAX_LEN);
                if (t && t !== defaults[id]) overrides[id] = t;
            }
        }
    }
    try {
        const { error } = await supabaseAdmin
            .from('email_templates')
            .upsert({ key: k, fields: overrides, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        return error ? { ok: false, reason: error.message } : { ok: true };
    } catch (e: unknown) {
        return { ok: false, reason: e instanceof Error ? e.message : 'Could not save' };
    }
}

/** Everything the admin Email tab needs to render the "System emails" section. */
export async function getSystemEmailTemplates(): Promise<SystemEmailTemplate[]> {
    let rows: { key: string; fields: unknown }[] = [];
    try {
        const { data } = await supabaseAdmin
            .from('email_templates')
            .select('key, fields')
            .in('key', [...EMAIL_TEMPLATE_KEYS]);
        rows = (data ?? []) as { key: string; fields: unknown }[];
    } catch {
        // Table missing or unreachable: the UI simply shows the defaults.
    }
    return EMAIL_TEMPLATE_KEYS.map((key) => {
        const meta = EMAIL_TEMPLATE_META[key];
        const row = rows.find((r) => r.key === key);
        const note =
            key === 'welcome' && process.env.WELCOME_EMAIL_ENABLED !== 'true'
                ? 'Not sending yet: set WELCOME_EMAIL_ENABLED=true in the environment to turn it on.'
                : undefined;
        return {
            key,
            name: meta.name,
            fires: meta.fires,
            note,
            fields: meta.fields,
            copy: mergeCopy(key, row?.fields),
            defaults: { ...EMAIL_COPY_DEFAULTS[key] },
        };
    });
}

// ── Shared layout helpers (pure) ──────────────────────────────────────────────

const esc = (s: string): string =>
    (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const money = (n: number): string => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

/** Substitute {token} placeholders. Unknown tokens are left as-is. */
const fill = (s: string, tokens: Record<string, string>): string =>
    (s || '').replace(/\{(\w+)\}/g, (m, k: string) => (k in tokens ? tokens[k] : m));

/** The shared branded card every KumoLab email uses (layout is fixed in code). */
function emailShell(opts: { brand: string; brandSub?: string; bodyHtml: string; footerHtml: string }): string {
    const sub = opts.brandSub
        ? `\n      <div style="font-size:13px;color:#46688c;margin-top:2px;">${esc(opts.brandSub)}</div>`
        : '';
    return `
<div style="background:#eef5fc;padding:32px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(24,70,120,.12);">
    <div style="background:linear-gradient(135deg,#8fc2f1 0%,#c3e0fb 55%,#fff5e2 100%);padding:26px 32px;text-align:center;">
      <img src="https://kumolabanime.com/kumolab-cloud-mark-gold.png" width="58" height="auto" alt="" style="display:inline-block;margin-bottom:4px;" />
      <div style="font-size:24px;font-weight:800;color:#16324f;letter-spacing:-.02em;">${esc(opts.brand)}</div>${sub}
    </div>
    <div style="padding:28px 32px;">
      ${opts.bodyHtml}
    </div>
    <div style="padding:16px 32px;text-align:center;font-size:12px;color:#8aa3bd;background:#f6fafe;">
      ${opts.footerHtml}
    </div>
  </div>
</div>`.trim();
}

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

// ── Order confirmation ────────────────────────────────────────────────────────

export interface RenderOrderLine {
    name: string;
    quantity: number;
    amount: number; // line total, in dollars
}

export function renderOrderConfirmation(
    copy: EmailCopy,
    data: {
        firstName: string;
        orderNumber: string;
        lines: RenderOrderLine[];
        subtotal: number;
        shipping: number;
        total: number;
    },
): RenderedEmail {
    const tokens = { firstName: data.firstName, orderNumber: data.orderNumber };
    const escTokens = { firstName: esc(data.firstName), orderNumber: esc(data.orderNumber) };

    const rows = data.lines
        .map(
            (l) =>
                `<tr><td style="padding:7px 0;color:#28374a;">${esc(String(l.quantity))}&times; ${esc(l.name)}</td>` +
                `<td align="right" style="padding:7px 0;color:#28374a;">${money(l.amount)}</td></tr>`,
        )
        .join('');

    const bodyHtml = `
      <h1 style="font-size:20px;margin:0 0 8px;color:#16324f;">${fill(esc(copy.heading), escTokens)}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#46688c;">
        ${fill(esc(copy.intro), escTokens)} Order <b>#${esc(data.orderNumber)}</b>.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${rows}
        <tr><td style="padding:9px 0 6px;border-top:1px solid #e6eef7;color:#46688c;">Subtotal</td><td align="right" style="padding:9px 0 6px;border-top:1px solid #e6eef7;color:#46688c;">${money(data.subtotal)}</td></tr>
        <tr><td style="padding:2px 0;color:#46688c;">Shipping</td><td align="right" style="padding:2px 0;color:#46688c;">${money(data.shipping)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:800;color:#16324f;font-size:15px;">Total</td><td align="right" style="padding:8px 0;font-weight:800;color:#16324f;font-size:15px;">${money(data.total)}</td></tr>
      </table>
      <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#46688c;">
        ${fill(esc(copy.closing), escTokens)}
      </p>`;

    const text =
        `${fill(copy.heading, tokens)}\n\n` +
        `${fill(copy.intro, tokens)} Order #${data.orderNumber}.\n\n` +
        data.lines.map((l) => `  ${l.quantity}x ${l.name}  ${money(l.amount)}`).join('\n') +
        `\n\n  Subtotal  ${money(data.subtotal)}\n  Shipping  ${money(data.shipping)}\n  Total     ${money(data.total)}\n\n` +
        `${fill(copy.closing, tokens)}\n\nKumoLab`;

    return {
        subject: fill(copy.subject, tokens),
        html: emailShell({ brand: 'KumoLab', bodyHtml, footerHtml: esc(copy.footer) }),
        text,
    };
}

// ── Cart recovery ─────────────────────────────────────────────────────────────

export function renderCartRecovery(
    copy: EmailCopy,
    items: { name?: string; quantity?: number }[],
): RenderedEmail {
    const names = (items || [])
        .map((i) => `${i.quantity && i.quantity > 1 ? `${i.quantity}× ` : ''}${i.name || ''}`.trim())
        .filter(Boolean);
    const itemRows = names.map((n) => `<li style="padding:3px 0;color:#28374a;">${esc(n)}</li>`).join('');
    const itemsBlock = itemRows
        ? `<ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.6;">${itemRows}</ul>`
        : '';

    const bodyHtml = `
      <h1 style="font-size:20px;margin:0 0 8px;color:#16324f;">${esc(copy.heading)}</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#46688c;">
        ${esc(copy.intro)}
      </p>
      ${itemsBlock}
      <div style="text-align:center;margin:6px 0 4px;">
        <a href="${BASE}/merch" style="display:inline-block;background:#16324f;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 28px;border-radius:999px;">${esc(copy.cta)}</a>
      </div>
      <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#46688c;">
        ${esc(copy.closing)}
      </p>`;

    const text =
        `${copy.heading}\n\n` +
        `${copy.intro}\n\n` +
        (names.length ? names.map((n) => `  - ${n}`).join('\n') + '\n\n' : '') +
        `${copy.cta}: ${BASE}/merch\n\n` +
        `${copy.closing}\n\nKumoLab`;

    return {
        subject: copy.subject,
        html: emailShell({ brand: 'KumoLab', bodyHtml, footerHtml: 'KumoLab &middot; the cloud sees everything first' }),
        text,
    };
}

// ── The Forecast (framing copy only; sections are auto-generated) ─────────────

export function forecastSectionHtml(heading: string, items: { title: string; url: string }[]): string {
    const links = items
        .map(
            (p) =>
                `<li style="padding:5px 0;">` +
                `<a href="${p.url}" style="color:#16324f;font-weight:600;text-decoration:none;border-bottom:1px solid #c3e0fb;">${esc(p.title)}</a>` +
                `</li>`,
        )
        .join('');
    return (
        `<h2 style="font-size:13px;margin:22px 0 6px;color:#8aa3bd;text-transform:uppercase;letter-spacing:.08em;">${esc(heading)}</h2>` +
        `<ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;">${links}</ul>`
    );
}

export function forecastSectionText(heading: string, items: { title: string; url: string }[]): string {
    return `${heading.toUpperCase()}\n` + items.map((p) => `  - ${p.title}\n    ${p.url}`).join('\n');
}

export function renderForecast(
    copy: EmailCopy,
    sections: { htmlSections: string[]; textSections: string[] },
): RenderedEmail {
    const bodyHtml = `
      <p style="margin:0 0 4px;font-size:15px;line-height:1.6;color:#46688c;">
        ${esc(copy.intro)}
      </p>
      ${sections.htmlSections.join('\n')}
      <p style="margin:26px 0 0;font-size:14px;line-height:1.6;color:#46688c;">
        ${esc(copy.signoff)}
      </p>`;

    const text =
        `THE FORECAST, by KumoLab\n\n` +
        `${copy.intro}\n\n` +
        sections.textSections.join('\n\n') +
        `\n\n${copy.signoff}\n\n` +
        `${copy.footer}`;

    return {
        subject: copy.subject,
        html: emailShell({
            brand: 'The Forecast',
            brandSub: 'by KumoLab',
            bodyHtml,
            footerHtml: `KumoLab &middot; the cloud sees everything first<br />\n      ${esc(copy.footer)}`,
        }),
        text,
    };
}

// ── Welcome (signup) ──────────────────────────────────────────────────────────

export function renderWelcome(copy: EmailCopy): RenderedEmail {
    const bodyHtml = `
      <h1 style="font-size:20px;margin:0 0 8px;color:#16324f;">${esc(copy.heading)}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#46688c;">
        ${esc(copy.intro)}
      </p>
      <div style="text-align:center;margin:6px 0 4px;">
        <a href="${BASE}/blog" style="display:inline-block;background:#16324f;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 28px;border-radius:999px;">${esc(copy.cta)}</a>
      </div>`;

    const text =
        `${copy.heading}\n\n` +
        `${copy.intro}\n\n` +
        `${copy.cta}: ${BASE}/blog\n\nKumoLab`;

    return {
        subject: copy.subject,
        html: emailShell({ brand: 'KumoLab', bodyHtml, footerHtml: esc(copy.footer) }),
        text,
    };
}

// ── Live preview (sample data + current copy) ─────────────────────────────────

/**
 * Render one system email with SAMPLE data and the given copy, for the admin
 * preview iframe. Pure: no DB, no network, never sends.
 */
export function renderEmailPreview(key: EmailTemplateKey, copy?: EmailCopy): { subject: string; html: string } {
    const c = { ...EMAIL_COPY_DEFAULTS[key], ...(copy || {}) };
    switch (key) {
        case 'order_confirmation': {
            const r = renderOrderConfirmation(c, {
                firstName: 'Aiko',
                orderNumber: 'A1B2C3D4',
                lines: [
                    { name: 'Cumulus Tee (M)', quantity: 1, amount: 32 },
                    { name: 'Nimbus Sticker Pack', quantity: 2, amount: 12 },
                ],
                subtotal: 44,
                shipping: 4.99,
                total: 48.99,
            });
            return { subject: r.subject, html: r.html };
        }
        case 'cart_recovery': {
            const r = renderCartRecovery(c, [
                { name: 'Cumulus Tee (M)', quantity: 1 },
                { name: 'Nimbus Sticker Pack', quantity: 2 },
            ]);
            return { subject: r.subject, html: r.html };
        }
        case 'forecast': {
            const trailers = [
                { title: 'Frieren: Beyond Journey’s End Season 2 trailer', url: `${BASE}/blog` },
                { title: 'Chainsaw Man: Reze Arc official trailer', url: `${BASE}/blog` },
            ];
            const dates = [{ title: 'Jujutsu Kaisen Season 3 premieres this January', url: `${BASE}/blog` }];
            const r = renderForecast(c, {
                htmlSections: [forecastSectionHtml('Trailers', trailers), forecastSectionHtml('Release dates', dates)],
                textSections: [forecastSectionText('Trailers', trailers), forecastSectionText('Release dates', dates)],
            });
            return { subject: r.subject, html: r.html };
        }
        case 'welcome': {
            const r = renderWelcome(c);
            return { subject: r.subject, html: r.html };
        }
    }
}
