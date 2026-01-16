'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sun, Moon, Cloud, Menu, X } from 'lucide-react';
import styles from './Navigation.module.css';

const Navigation = () => {
    const [theme, setTheme] = useState('dark');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Initialize theme from localStorage or system preference
    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        setTheme(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    };

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const closeMenu = () => setIsMenuOpen(false);

    return (
        <nav className={styles.nav}>
            <div className={`container ${styles.navContainer}`}>
                <Link href="/" className={styles.logo} onClick={closeMenu}>
                    <img src="/logo.png" alt="KumoLab Logo" className={styles.logoImg} />
                </Link>

                <div className={styles.actions}>
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
