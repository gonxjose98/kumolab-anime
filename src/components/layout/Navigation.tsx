'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShoppingCart, Bell, User, LogOut, Sun, Moon, Cloud } from 'lucide-react';
import styles from './Navigation.module.css';

const Navigation = () => {
    const [theme, setTheme] = useState('dark');

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

    return (
        <nav className={styles.nav}>
            <div className={`container ${styles.navContainer}`}>
                <Link href="/" className={styles.logo}>
                    <div className={styles.logoIcon}>
                        <Cloud size={24} fill="currentColor" />
                    </div>
                    KumoLab
                </Link>

                <ul className={styles.links}>
                    <li><Link href="/">Home</Link></li>
                    <li><Link href="/blog">Blog</Link></li>
                    <li><Link href="/merch">Merch</Link></li>
                    <li><Link href="/about">About</Link></li>
                </ul>

                <div className={styles.actions}>
                    <button className={styles.iconBtn}>
                        <ShoppingCart size={20} />
                        <span className={styles.badge}>0</span>
                    </button>
                    <button className={styles.iconBtn} onClick={toggleTheme} aria-label="Toggle Theme">
                        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default Navigation;
