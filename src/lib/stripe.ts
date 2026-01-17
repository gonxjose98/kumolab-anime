
import Stripe from 'stripe';

// Prevent build failures if key is missing (e.g. during static analysis)
const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';

export const stripe = new Stripe(stripeKey, {
    apiVersion: '2025-02-24-preview' as any, // Use latest or stable
    typescript: true,
});
