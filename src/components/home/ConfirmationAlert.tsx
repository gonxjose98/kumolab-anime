
'use client';

import { useState, useEffect } from 'react';
import { BlogPost } from '@/types';
import Link from 'next/link';
import { Bell, ArrowRight, ShieldCheck } from 'lucide-react';
import styles from './ConfirmationAlert.module.css';

interface ConfirmationAlertProps {
    posts: BlogPost[];
}

const ConfirmationAlert = ({ posts }: ConfirmationAlertProps) => {
    // Get the most recent CONFIRMATION_ALERT from the last 24 hours
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const alerts = posts
        .filter(p => p.type === 'CONFIRMATION_ALERT' && p.isPublished)
        .filter(p => new Date(p.timestamp) > oneDayAgo)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (alerts.length === 0) return null;

    const latestAlert = alerts[0];

    return (
        <section className={styles.alertContainer}>
            <div className="container">
                <Link href={`/blog/${latestAlert.slug}`} className={styles.alertBar}>
                    <div className={styles.alertGlow} />
                    <div className={styles.alertContent}>
                        <div className={styles.alertHeader}>
                            <div className={styles.pulseContainer}>
                                <div className={styles.pulseDot} />
                                <div className={styles.pulseRing} />
                            </div>
                            <span className={styles.alertLabel}>BREAKING CONFIRMATION</span>
                        </div>

                        <div className={styles.mainInfo}>
                            <h2 className={styles.title}>{latestAlert.title}</h2>
                            <p className={styles.excerpt}>{latestAlert.content.substring(0, 120)}...</p>
                        </div>

                        <div className={styles.footer}>
                            <div className={styles.sourceInfo}>
                                <ShieldCheck size={14} className={styles.shieldIcon} />
                                <span className={styles.sourceText}>OFFICIAL SOURCE VERIFIED</span>
                            </div>
                            <div className={styles.action}>
                                <span className={styles.actionText}>READ FULL INTEL</span>
                                <ArrowRight size={16} />
                            </div>
                        </div>
                    </div>
                    {latestAlert.image && (
                        <div className={styles.imageZone}>
                            <img src={latestAlert.image} alt="" className={styles.alertImage} />
                            <div className={styles.imageOverlay} />
                        </div>
                    )}
                </Link>
            </div>
        </section>
    );
};

export default ConfirmationAlert;
