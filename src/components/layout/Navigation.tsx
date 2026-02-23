'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sun, Moon, Menu, X, ShoppingCart } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCartStore } from '@/store/useCartStore';
import styles from './Navigation.module.css';

const Navigation = () => {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const cartItems = useCartStore((state) => state.items);
    const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

    useEffect(() => {
        setMounted(true);
        
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 10);
        };
        
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    if (!mounted) {
        return (
            <nav className={`${styles.nav} ${styles.loading}`}>
                <div className={styles.navContainer}>
                    <div className={styles.logoPlaceholder} />
                </div>
            </nav>
        );
    }

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const closeMenu = () => setIsMenuOpen(false);

    return (
        <nav className={`${styles.nav} ${isScrolled ? styles.scrolled : ''}`}>
            <div className={styles.navContainer}>
                {/* Logo */}
                <Link href="/" className={styles.logo} onClick={closeMenu} aria-label="KumoLab Home">
                    <img 
                        src="/logo.png" 
                        alt="" 
                        className={styles.logoImg}
                        width="160"
                        height="64"
                    />
                </Link>

                {/* Actions */}
                <div className={styles.actions}>
                    {/* Cart */}
                    {cartCount > 0 && (
                        <Link 
                            href="/merch/cart" 
                            className={styles.iconBtn} 
                            onClick={closeMenu}
                            aria-label="Cart"
                        >
                            <ShoppingCart size={22} />
                            <span className={styles.cartBadge}>{cartCount}</span>
                        </Link>
                    )}

                    {/* Theme Toggle */}
                    <button 
                        className={styles.iconBtn}
                        onClick={toggleTheme}
                        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                    </button>

                    {/* Menu Toggle */}
                    <button
                        className={`${styles.iconBtn} ${styles.menuToggle}`}
                        onClick={toggleMenu}
                        aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={isMenuOpen}
                    >
                        {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>

                {/* Mobile Menu */}
                <div className={`${styles.mobileMenu} ${isMenuOpen ? styles.open : ''}`}>
                    <nav className={styles.menuNav}>
                        <Link href="/" className={styles.menuLink} onClick={closeMenu}>
                            <span className={styles.linkNum}>01</span>
                            <span className={styles.linkText}>Home</span>
                        </Link>
                        <Link href="/blog" className={styles.menuLink} onClick={closeMenu}>
                            <span className={styles.linkNum}>02</span>
                            <span className={styles.linkText}>Blog</span>
                        </Link>
                        <Link href="/merch" className={styles.menuLink} onClick={closeMenu}>
                            <span className={styles.linkNum}>03</span>
                            <span className={styles.linkText}>Merch</span>
                        </Link>
                        <Link href="/about" className={styles.menuLink} onClick={closeMenu}>
                            <span className={styles.linkNum}>04</span>
                            <span className={styles.linkText}>About</span>
                        </Link>
                    </nav>
                    
                    {cartCount > 0 && (
                        <Link 
                            href="/merch/cart" 
                            className={styles.cartLink}
                            onClick={closeMenu}
                        >
                            <ShoppingCart size={18} />
                            <span>Cart ({cartCount})</span>
                        </Link>
                    )}
                </div>

                {/* Overlay */}
                {isMenuOpen && (
                    <div 
                        className={styles.overlay} 
                        onClick={closeMenu}
                        aria-hidden="true"
                    />
                )}
            </div>
        </nav>
    );
};

export default Navigation;
