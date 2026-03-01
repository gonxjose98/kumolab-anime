'use client';

import { useMemo, useEffect, useState } from 'react';

const STAR_COUNT = 120;
const PARTICLE_COUNT = 70;
const COLORS_DARK = ['#00d4ff', '#ff3cac', '#7b61ff'];
const COLORS_LIGHT = ['#0099cc', '#cc2080', '#5a40cc'];

export default function GalaxyBackground() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const check = () => setIsLight(document.documentElement.classList.contains('light'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const colors = isLight ? COLORS_LIGHT : COLORS_DARK;

  const stars = useMemo(
    () =>
      Array.from({ length: STAR_COUNT }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 1.8 + 0.3,
        opacity: Math.random() * 0.6 + 0.1,
        twinkleDur: Math.random() * 4 + 3,
        twinkleDelay: Math.random() * -6,
        tint: i % 7 === 0 ? '#d0e8ff' : i % 11 === 0 ? '#ffe8d0' : '#fff',
      })),
    []
  );

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2.5 + 0.5,
        dur: Math.random() * 25 + 20,
        delay: Math.random() * -30,
        opacity: Math.random() * 0.5 + 0.1,
        hue: i % 3,
      })),
    []
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {stars.map((s) => (
        <div
          key={`s-${s.id}`}
          style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            background: isLight
              ? (s.tint === '#fff' ? '#c0d0f0' : s.tint === '#d0e8ff' ? '#90b8e8' : '#d0a880')
              : s.tint,
            opacity: isLight ? s.opacity * 0.75 : s.opacity,
            animation: `twinkle ${s.twinkleDur}s ease-in-out ${s.twinkleDelay}s infinite`,
          }}
        />
      ))}
      {particles.map((p) => (
        <div
          key={`p-${p.id}`}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: colors[p.hue],
            opacity: isLight ? p.opacity * 0.65 : p.opacity,
            animation: `drift${p.id % 3} ${p.dur}s ease-in-out ${p.delay}s infinite`,
            boxShadow:
              p.size > 1.8
                ? `0 0 ${p.size * 4}px ${colors[p.hue]}${isLight ? '45' : '50'}`
                : 'none',
          }}
        />
      ))}
    </div>
  );
}
