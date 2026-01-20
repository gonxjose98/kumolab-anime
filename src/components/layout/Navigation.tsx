'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sun, Moon, Cloud, Menu, X, ShoppingCart } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCartStore } from '@/store/useCartStore';
import styles from './Navigation.module.css';

const Navigation = () => {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const cartItems = useCartStore((state) => state.items);
    const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

    // Prevent hydration mismatch
    useEffect(() => {
        setMounted(true);
    }, []);

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    if (!mounted) return null; // Or return a skeleton/placeholder to match server render if critical

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const closeMenu = () => setIsMenuOpen(false);

    return (
        <nav className={styles.nav}>
            <div className={`container ${styles.navContainer}`}>
                <Link href="/" className={styles.logo} onClick={closeMenu}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="KumoLab Logo" className={styles.logoImg} />
                </Link>

                <div className={styles.actions}>
                    {/* Cart Link - Only show when cart has items */}
                    {cartCount > 0 && (
                        <Link href="/merch/cart" className={styles.cartBtn} onClick={closeMenu}>
                            <ShoppingCart size={22} />
                            <span className={styles.cartBadge}>{cartCount}</span>
                        </Link>
                    )}

                    {/* Theme Toggle */}
                    <div className={styles.themeToggle} onClick={toggleTheme} role="button" aria-label="Toggle Theme">
                        <div className={`${styles.themeIcon} ${theme === 'light' ? styles.active : ''}`}>
                            <Sun size={18} />
                        </div>
                        <div className={`${styles.themeIcon} ${theme === 'dark' ? styles.active : ''}`}>
                            <Moon size={18} />
                        </div>
                    </div>

                    {/* Hamburger Button */}
                    <button
                        className={styles.menuBtn}
                        onClick={toggleMenu}
                        aria-label="Toggle Menu"
                    >
                        {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>

                {/* Dropdown Menu */}
                <div className={`${styles.dropdown} ${isMenuOpen ? styles.open : ''}`}>
                    <ul className={styles.dropdownLinks}>
                        <li><Link href="/" onClick={closeMenu}>Home</Link></li>
                        <li><Link href="/blog" onClick={closeMenu}>Blog</Link></li>
                        <li><Link href="/merch" onClick={closeMenu}>Merch</Link></li>
                        <li><Link href="/merch/cart" onClick={closeMenu}>Cart ({cartCount})</Link></li>
                        <li><Link href="/about" onClick={closeMenu}>About</Link></li>
                    </ul>
                </div>
            </div>

            {/* Overlay */}
            {isMenuOpen && <div className={styles.overlay} onClick={closeMenu}></div>}
        </nav>
    );
};

export default Navigation;
