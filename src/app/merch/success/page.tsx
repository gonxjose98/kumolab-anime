
'use client';

import { useEffect } from 'react';
import { useCartStore } from '@/store/useCartStore';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

export default function SuccessPage() {
    const clearCart = useCartStore((state) => state.clearCart);

    useEffect(() => {
        clearCart();
    }, [clearCart]);

    return (
        <div className="container mx-auto px-4 py-24 min-h-screen flex flex-col items-center justify-center text-center gap-6">
            <CheckCircle size={80} className="text-green-500" />
            <h1 className="text-4xl font-bold tracking-tight">Order Confirmed!</h1>
            <p className="text-xl text-gray-400 max-w-md">
                Thank you for your purchase. We&apos;ve sent a confirmation email to your inbox and are preparing your artifacts for shipment.
            </p>
            <div className="flex gap-4 mt-8">
                <Link
                    href="/merch"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-full font-semibold transition"
                >
                    Back to Shop
                </Link>
                <Link
                    href="/"
                    className="border border-white/20 hover:bg-white/10 text-white px-8 py-3 rounded-full font-semibold transition"
                >
                    Home
                </Link>
            </div>
        </div>
    );
}
