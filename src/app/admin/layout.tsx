/* Loads the Clear Skies admin design system (tokens + component classes) for
   every /admin route. The classes only take effect under a `.admin-root`
   wrapper (applied by AdminShell + the login page), so pages not yet migrated
   keep their old styling until they adopt the shell. */
import './tokens.css';
import './admin.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
