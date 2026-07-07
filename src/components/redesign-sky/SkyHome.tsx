import { BlogPost, Product } from '@/types';
import styles from './SkyHome.module.css';
import SkyThemeRoot from './SkyThemeRoot';
import ScrollFix from './ScrollFix';
import SeaToSky from './SeaToSky';
import ReachBar from './ReachBar';
import CloudCollection from './CloudCollection';
import DriftFeed from './DriftFeed';
import Forecast from './Forecast';
import SkyFooter from './SkyFooter';
import SkyWeather from '@/components/sky-weather';
import { CelCloud, CelCloudWide } from './art';

interface SkyHomeProps {
    posts: BlogPost[];
    products: Product[];
}

/**
 * Redesign Sky — "Sea to Sky".
 * Server shell: the sea→sky scroll journey up top, then every section
 * lives high above the clouds on a serene deeper blue, with soft cel
 * clouds drifting between sections.
 */
export default function SkyHome({ posts, products }: SkyHomeProps) {
    return (
        <SkyThemeRoot>
            {/* Ambient weather overlay: fixed z-1 — above the journey and the
                aloft sky (z-0/auto), below .aloftContent (z-2) and the global
                nav (z-1000). Inherits --t from SkyThemeRoot. */}
            <SkyWeather />
            <ScrollFix />
            <SeaToSky />
            <div className={styles.aloft}>
                {/* Aloft sky gradient lives on its own z-0 layer so the
                    weather overlay (z-1) can slide between it and the
                    content (z-2) — rain falls on the sky, never on text. */}
                <div className={styles.aloftBg} aria-hidden="true" />
                <div className={styles.aloftContent}>
                    <div className={styles.ambience} aria-hidden="true">
                        <CelCloudWide id="aloft-a" className={`${styles.driftCloud} ${styles.driftA}`} />
                        <CelCloud id="aloft-b" className={`${styles.driftCloud} ${styles.driftB}`} />
                        <CelCloudWide id="aloft-c" className={`${styles.driftCloud} ${styles.driftC}`} />
                        <CelCloud id="aloft-d" className={`${styles.driftCloud} ${styles.driftD}`} />
                        <CelCloud id="aloft-e" className={`${styles.driftCloud} ${styles.driftE}`} />
                    </div>
                    {/* THE LANDING — where the ride sets you down. The scroll
                        assist (SeaToSky) glides until this section's top meets
                        the top of the viewport: the journey's big payoff rises
                        and condenses away while this compact docked header
                        takes its place, with the reach stats framed directly
                        beneath it — no dead full-screen beat, no wasted
                        viewport. Top padding clears the fixed nav. */}
                    <section className={styles.landing} data-sky-landing>
                        <header className={styles.landingHead}>
                            <p className={styles.landingKanji} aria-hidden="true">
                                雲の上へ
                            </p>
                            <h2 className={styles.landingTitle}>Welcome above the clouds.</h2>
                        </header>
                        <ReachBar />
                    </section>
                    <CloudCollection products={products} />
                    <DriftFeed posts={posts} />
                    <Forecast />
                    <SkyFooter />
                </div>
            </div>
        </SkyThemeRoot>
    );
}
