import styles from './SkyContent.module.css';
import { CelCloud, CelCloudWide, Moon } from './art';

/**
 * Calm content-page sky backdrop — viewport-fixed, opaque, behind the
 * content. Two full-bleed layers (bright day sky / navy starfield night)
 * are cross-faded by the continuous `--t` variable that SkyContentRoot
 * tweens, plus a handful of gently drifting cel clouds that dim and cool
 * at night. No scroll-driven motion: content pages stay readable and
 * scroll normally.
 */
export default function SkyContentBackdrop() {
    return (
        <div className={styles.backdrop} aria-hidden="true">
            <div className={styles.dayLayer} />
            <div className={styles.nightLayer}>
                <div className={styles.starsFar} />
                <div className={styles.stars} />
                <Moon id="content" className={styles.moon} />
            </div>
            <div className={styles.clouds}>
                <CelCloudWide id="content-a" className={`${styles.cloud} ${styles.cloudA}`} />
                <CelCloud id="content-b" className={`${styles.cloud} ${styles.cloudB}`} />
                <CelCloudWide id="content-c" className={`${styles.cloud} ${styles.cloudC}`} />
                <CelCloud id="content-d" className={`${styles.cloud} ${styles.cloudD}`} />
                <CelCloud id="content-e" className={`${styles.cloud} ${styles.cloudE}`} />
            </div>
        </div>
    );
}
