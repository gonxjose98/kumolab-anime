/* Route-level skeleton for the Engine tab while its force-dynamic data loads.
   Renders inside AdminShell (nav rail stays), so navigation lands on a shaped
   shimmer instead of an empty pane. */
export default function EngineLoading() {
    return (
        <div className="max-w-6xl mx-auto flex flex-col gap-6" aria-busy="true" aria-live="polite">
            <div className="ak-skel" style={{ height: 30, width: 240 }} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="ak-skel" style={{ height: 128 }} />
                ))}
            </div>
            <div className="ak-skel" style={{ height: 44, width: 260 }} />
            <div className="ak-skel" style={{ height: 340 }} />
        </div>
    );
}
