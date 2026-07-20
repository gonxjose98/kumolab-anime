/* Route-level skeleton for Content while its force-dynamic data loads.
   Renders inside AdminShell (nav rail stays), so navigation lands on a shaped
   shimmer instead of an empty pane. */
export default function ContentLoading() {
    return (
        <div className="max-w-6xl mx-auto flex flex-col gap-5" aria-busy="true" aria-live="polite">
            <div className="flex items-center justify-between gap-4">
                <div className="ak-skel" style={{ height: 30, width: 200 }} />
                <div className="ak-skel" style={{ height: 32, width: 120 }} />
            </div>
            <div className="flex flex-col gap-3">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="ak-skel" style={{ height: 62 }} />
                ))}
            </div>
        </div>
    );
}
