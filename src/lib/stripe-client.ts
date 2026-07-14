import { loadStripe } from '@stripe/stripe-js';

// Client-side Stripe. The publishable key is public by design (safe to ship
// to the browser). Loaded once and reused across the app.
export const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');
