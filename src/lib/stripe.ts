
import Stripe from 'stripe';

// Prevent build failures if key is missing (e.g. during static analysis)
const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';

// No apiVersion pin: '2025-02-24-preview' was invalid and made Stripe reject
// every checkout with StripeInvalidRequestError. Omitting it lets the SDK use
// its own built-in pinned version, which is always valid for this library.
export const stripe = new Stripe(stripeKey, {
    typescript: true,
});
