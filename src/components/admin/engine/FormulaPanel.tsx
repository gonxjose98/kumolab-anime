import type { FormulaElement } from '@/lib/engine/engine-config';
import ScoreLegend from './ScoreLegend';

/**
 * The posting formula, rendered as a canonical, numbered checklist. This is the
 * spec both Jose and any AI agent working on KumoLab should follow and verify
 * their output against. Read-only here (edited in the DB / a future editor).
 */
export default function FormulaPanel({ formula }: { formula: FormulaElement[] }) {
    return (
        <div className="ak-card">
            <div className="flex items-baseline justify-between" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span className="ak-overline" style={{ color: 'var(--gold)' }}>The posting formula</span>
                <ScoreLegend />
            </div>
            <div className="ak-caption" style={{ marginBottom: 12 }}>
                The rules a winning post follows. Any agent acting on KumoLab should check its work against these.
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr' }} className="ak-formula-grid">
                {formula.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
                        <span style={{
                            flexShrink: 0, width: 24, height: 24, borderRadius: 7,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--surface-2)', border: '1px solid var(--line)',
                            fontFamily: 'var(--ak-display)', fontWeight: 800, fontSize: '0.8rem', color: 'var(--gold)',
                        }}>{i + 1}</span>
                        <div style={{ minWidth: 0 }}>
                            <div className="ak-body-sm" style={{ fontWeight: 700, color: 'var(--ink)' }}>{f.title}</div>
                            <div className="ak-caption" style={{ marginTop: 1 }}>{f.detail}</div>
                        </div>
                    </div>
                ))}
            </div>
            <style>{`@media (min-width: 720px){ .ak-formula-grid { grid-template-columns: 1fr 1fr !important; gap: 12px 22px !important; } }`}</style>
        </div>
    );
}
