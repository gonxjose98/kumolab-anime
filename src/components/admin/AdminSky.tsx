import { CelCloud, CelCloudWide, Moon } from '@/components/sky-content/art';

/**
 * The admin's sea-to-sky backdrop — a viewport-fixed layer behind all admin
 * content. Light theme paints the homepage DAY sky, dark paints the NIGHT
 * starfield; the same cel-shaded cumulus art the storefront uses drifts gently
 * in the margins so the console lives in the same world as the homepage.
 * Purely decorative; content scrolls over a calm, stationary sky.
 */
export default function AdminSky() {
    return (
        <div className="ak-sky" aria-hidden="true">
            <div className="ak-sky__day" />
            <div className="ak-sky__night">
                <div className="ak-sky__starsFar" />
                <div className="ak-sky__stars" />
                <Moon id="admin" className="ak-sky__moon" />
            </div>
            <div className="ak-sky__clouds">
                <CelCloudWide id="admin-a" className="ak-sky__cloud ak-sky__cloud--a" />
                <CelCloud id="admin-b" className="ak-sky__cloud ak-sky__cloud--b" />
                <CelCloudWide id="admin-c" className="ak-sky__cloud ak-sky__cloud--c" />
            </div>
            <div className="ak-sky__veil" />
            <div className="ak-sky__grain" />
        </div>
    );
}
