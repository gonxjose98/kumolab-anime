'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Sun, Moon, ShoppingCart } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCartStore } from '@/store/useCartStore';
import styles from './Navigation.module.css';

const NAV_ITEMS = [
    { label: 'Home', jp: 'ホーム', href: '/' },
    { label: 'Blog', jp: 'ブログ', href: '/blog' },
    { label: 'Merch', jp: 'グッズ', href: '/merch' },
    { label: 'About', jp: '概要', href: '/about' },
];

const Navigation = () => {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const cartItems = useCartStore((state) => state.items);
    const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

    useEffect(() => {
        setMounted(true);
        const handleScroll = () => setIsScrolled(window.scrollY > 50);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (!isMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isMenuOpen]);

    const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
    const closeMenu = () => setIsMenuOpen(false);

    if (!mounted) {
        return (
            <nav className={styles.nav}>
                <div className={styles.navContainer}>
                    <div className={styles.logoPlaceholder} />
                </div>
            </nav>
        );
    }

    return (
        <nav className={`${styles.nav} ${isScrolled || isMenuOpen ? styles.scrolled : ''}`}>
            <div className={styles.navContainer}>
                {/* Logo */}
                <Link href="/" className={styles.logo} onClick={closeMenu} aria-label="KumoLab Home">
                    <img
                        src="/logo.png"
                        alt="KumoLab"
                        className={styles.logoImg}
                        width="160"
                        height="64"
                    />
                </Link>

                {/* Right side actions */}
                <div className={styles.actions}>
                    {/* Cart */}
                    {cartCount > 0 && (
                        <Link href="/merch/cart" className={styles.iconBtn} onClick={closeMenu} aria-label="Cart">
                            <ShoppingCart size={20} />
                            <span className={styles.cartBadge}>{cartCount}</span>
                        </Link>
                    )}

                    {/* Theme Toggle */}
                    <button
                        className={styles.iconBtn}
                        onClick={toggleTheme}
                        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </button>

                    {/* Menu Toggle */}
                    <div ref={menuRef} className={styles.menuWrapper}>
                        <button
                            className={`${styles.menuToggle} ${isMenuOpen ? styles.menuOpen : ''}`}
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                            aria-expanded={isMenuOpen}
                        >
                            <span className={styles.menuLine} />
                            <span className={styles.menuLine} />
                            <span className={styles.menuLine} />
                        </button>

                        {/* Dropdown Menu */}
                        <div className={`${styles.dropdown} ${isMenuOpen ? styles.dropdownOpen : ''}`}>
                            <span className={styles.dropdownAccentTop} />
                            <span className={styles.dropdownAccentLeft} />
                            <div className={styles.dropdownNav}>
                                {NAV_ITEMS.map((item) => (
                                    <Link
                                        key={item.label}
                                        href={item.href}
                                        className={styles.dropdownLink}
                                        onClick={closeMenu}
                                    >
                                        <span className={styles.dropdownLinkLabel}>{item.label}</span>
                                        <span className={styles.dropdownLinkJp}>{item.jp}</span>
                                    </Link>
                                ))}
                            </div>
                            {cartCount > 0 && (
                                <Link href="/merch/cart" className={styles.dropdownCart} onClick={closeMenu}>
                                    <ShoppingCart size={16} />
                                    <span>Cart ({cartCount})</span>
                                </Link>
                            )}
                            <span className={styles.dropdownAccentBottom} />
                        </div>
                    </div>
                </div>

                {/* Overlay */}
                {isMenuOpen && (
                    <div className={styles.overlay} onClick={closeMenu} aria-hidden="true" />
                )}
            </div>
        </nav>
    );
};

export default Navigation;
