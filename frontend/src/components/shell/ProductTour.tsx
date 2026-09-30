import { useEffect, useLayoutEffect, useState } from 'react';
import { Button } from '../ui';
import { markTourSeen, tourSeen } from '../../lib/localStore';

const STEPS = [
  {
    target: 'sidebar',
    title: 'Navigation',
    text: 'Every screen lives here, grouped by what you want to do. Collapse it to get more room.',
  },
  {
    target: 'context',
    title: 'Region · Crop',
    text: 'Pick a region, crop and yield unit once; every screen uses the same context.',
  },
  {
    target: 'predict',
    title: 'Yield Predictor',
    text: 'Describe a field and season to estimate yield, then explore what-if scenarios.',
  },
  { target: 'search', title: 'Search anything', text: 'Press Ctrl+K (⌘K on Mac) to jump to any screen or action.' },
];

/** First-sign-in coach marks, anchored to elements with a matching data-tour attribute. */
export function ProductTour({ username }: { username: string }) {
  const [step, setStep] = useState<number | null>(() => (tourSeen(username) ? null : 0));
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (step === null) return;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${STEPS[step].target}"]`);
      setRect(el && el.getBoundingClientRect().width > 0 ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [step]);

  const close = () => {
    markTourSeen(username);
    setStep(null);
  };

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (step === null) return null;
  const s = STEPS[step];
  const width = 300;
  const top = rect ? Math.min(window.innerHeight - 200, rect.bottom + 12) : window.innerHeight / 2 - 90;
  const left = rect
    ? Math.max(16, Math.min(window.innerWidth - width - 16, rect.left + (rect.width > 400 ? 24 : 0)))
    : window.innerWidth / 2 - width / 2;

  return (
    <>
      {rect && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: rect.top - 4,
            left: rect.left - 4,
            width: Math.min(rect.width + 8, window.innerWidth),
            height: Math.min(rect.height + 8, window.innerHeight),
            border: '2px solid var(--primary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 0 0 9999px var(--overlay)',
            zIndex: 'var(--z-modal)' as unknown as number,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        style={{
          position: 'fixed',
          top,
          left,
          width,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'var(--space-4)',
          zIndex: 'var(--z-toast)' as unknown as number,
        }}
      >
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
          Step {step + 1} of {STEPS.length}
        </div>
        <h2 id="tour-title" style={{ margin: 'var(--space-1) 0', fontSize: 'var(--text-lg)' }}>
          {s.title}
        </h2>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 'var(--text-md)' }}>{s.text}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-4)' }}>
          <Button size="sm" variant="ghost" onClick={close}>
            Skip tour
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => (step + 1 < STEPS.length ? setStep(step + 1) : close())}
            autoFocus
          >
            {step + 1 < STEPS.length ? 'Next' : 'Done'}
          </Button>
        </div>
      </div>
    </>
  );
}
