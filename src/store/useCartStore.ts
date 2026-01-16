
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
    variantId: number;
    productId: number;
    name: string;
    price: number;
    quantity: number;
    image: string;
    size?: string;
    color?: string;
}

interface CartStore {
    items: CartItem[];
    addItem: (item: CartItem) => void;
    removeItem: (variantId: number) => void;
    updateQuantity: (variantId: number, quantity: number) => void;
    clearCart: () => void;
    getTotal: () => number;
}

export const useCartStore = create<CartStore>()(
    persist(
        (set, get) => ({
            items: [],
            addItem: (item) => {
                const items = get().items;
                const existingItem = items.find((i) => i.variantId === item.variantId);

                if (existingItem) {
                    set({
                        items: items.map((i) =>
                            i.variantId === item.variantId
                                ? { ...i, quantity: i.quantity + item.quantity }
                                : i
                        ),
                    });
                } else {
                    set({ items: [...items, item] });
                }
            },
            removeItem: (variantId) => {
                set({ items: get().items.filter((i) => i.variantId !== variantId) });
            },
            updateQuantity: (variantId, quantity) => {
                set({
                    items: get().items.map((i) =>
                        i.variantId === variantId ? { ...i, quantity: Math.max(1, quantity) } : i
                    ),
                });
            },
            clearCart: () => set({ items: [] }),
            getTotal: () => {
                return get().items.reduce((total, item) => total + item.price * item.quantity, 0);
            },
        }),
        {
            name: 'kumolab-cart',
        }
    )
);
