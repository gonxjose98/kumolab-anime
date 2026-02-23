'use client';

import { useEffect, useState, useCallback } from 'react';
import styles from './PullToRefresh.module.css';

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    children: React.ReactNode;
}

const PullToRefresh = ({ onRefresh, children }: PullToRefreshProps) => {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [startY, setStartY] = useState(0);
    const [isPulling, setIsPulling] = useState(false);

    const MAX_PULL_DISTANCE = 100;
    const REFRESH_THRESHOLD = 80;

    const handleTouchStart = useCallback((e: TouchEvent) => {
        // Only allow pull when at top of page
        if (window.scrollY === 0) {
            setStartY(e.touches[0].clientY);
            setIsPulling(true);
        }
    }, []);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!isPulling || isRefreshing) return;

        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        if (diff > 0 && window.scrollY === 0) {
            // Calculate pull distance with resistance
            const newDistance = Math.min(diff * 0.5, MAX_PULL_DISTANCE);
            setPullDistance(newDistance);
            
            // Prevent default scrolling
            if (diff > 10) {
                e.preventDefault();
            }
        }
    }, [isPulling, isRefreshing, startY]);

    const handleTouchEnd = useCallback(async () => {
        if (!isPulling) return;

        setIsPulling(false);

        if (pullDistance >= REFRESH_THRESHOLD && !isRefreshing) {
            setIsRefreshing(true);
            setPullDistance(MAX_PULL_DISTANCE);
            
            try {
                await onRefresh();
            } catch (error) {
                console.error('Refresh failed:', error);
            } finally {
                // Reset after refresh
                setTimeout(() => {
                    setIsRefreshing(false);
                    setPullDistance(0);
                }, 500);
            }
        } else {
            // Spring back
            setPullDistance(0);
        }
    }, [isPulling, pullDistance, isRefreshing, onRefresh]);

    useEffect(() => {
        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);

        return () => {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

    const getIndicatorText = () => {
        if (isRefreshing) return 'Refreshing...';
        if (pullDistance >= REFRESH_THRESHOLD) return 'Release to refresh';
        return 'Pull to refresh';
    };

    const getRotation = () => {
        const progress = Math.min(pullDistance / REFRESH_THRESHOLD, 1);
        return progress * 180;
    };

    return (
        <div className={styles.container}>
            {/* Pull indicator */}
            <div 
                className={styles.indicator}
                style={{
                    transform: `translateY(${Math.max(0, pullDistance - 60)}px)`,
                    opacity: pullDistance > 20 ? Math.min((pullDistance - 20) / 40, 1) : 0
                }}
            >
                <div 
                    className={styles.spinner}
                    style={{
                        transform: `rotate(${isRefreshing ? 360 : getRotation()}deg)`,
                        transition: isRefreshing ? 'transform 1s linear infinite' : 'transform 0.2s ease'
                    }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                </div>
                <span className={styles.indicatorText}>{getIndicatorText()}</span>
            </div>

            {/* Content */}
            <div 
                className={styles.content}
                style={{
                    transform: `translateY(${pullDistance}px)`,
                    transition: isPulling ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
            >
                {children}
            </div>
        </div>
    );
};

export default PullToRefresh;
