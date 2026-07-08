/* Loads the Clear Skies admin design system (tokens + component classes) for
   every /admin route. The classes only take effect under a `.admin-root`
   wrapper (applied by AdminShell + the login page), so pages not yet migrated
   keep their old styling until they adopt the shell. */
import './tokens.css';
import './admin.css';

// Set the light/dark attribute BEFORE paint so there's no flash of the wrong
// theme. Reads the operator's saved choice; defaults to light (Clear Skies).
const themeScript =
    "(function(){try{var t=localStorage.getItem('kumolab-admin-theme');document.documentElement.dataset.adminTheme=(t==='dark'?'dark':'light');}catch(e){}})();";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <script dangerouslySetInnerHTML={{ __html: themeScript }} />
            {children}
        </>
    );
}
