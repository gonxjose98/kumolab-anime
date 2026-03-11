'use client';

import { useMemo, useEffect, useState } from 'react';

const STAR_COUNT = 120;
const PARTICLE_COUNT = 70;
const COLORS_DARK = ['#00d4ff', '#ff3cac', '#7b61ff'];
const COLORS_LIGHT = ['#00d4ff', '#ff3cac', '#7b61ff'];

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
        background: isLight ? '#1c1b3a' : '#06060e',
        transition: 'background 0.8s ease',
      }}
    >
      {/* Light mode: cosmic dawn glow — warm radial light sources */}
      {isLight && (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `
                radial-gradient(ellipse 80% 60% at 60% 30%, rgba(100,80,180,0.18) 0%, transparent 60%),
                radial-gradient(ellipse 70% 50% at 25% 70%, rgba(0,180,255,0.1) 0%, transparent 55%),
                radial-gradient(ellipse 50% 40% at 80% 80%, rgba(255,60,172,0.08) 0%, transparent 50%)
              `,
              transition: 'opacity 0.8s ease',
            }}
          />
          {/* Warm sun-like glow */}
          <div
            style={{
              position: 'absolute',
              width: 800,
              height: 800,
              top: '-15%',
              right: '-10%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(160,140,255,0.12) 0%, rgba(100,80,200,0.06) 30%, transparent 65%)',
              animation: 'orbMove1 20s ease-in-out infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 600,
              height: 600,
              bottom: '5%',
              left: '10%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0,180,255,0.08) 0%, rgba(80,60,180,0.04) 40%, transparent 65%)',
              animation: 'orbMove2 25s ease-in-out infinite',
            }}
          />
        </>
      )}
      {/* Stars — brighter in light mode */}
      {stars.map((s) => (
        <div
          key={`s-${s.id}`}
          style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: isLight ? s.size * 1.2 : s.size,
            height: isLight ? s.size * 1.2 : s.size,
            borderRadius: '50%',
            background: s.tint,
            opacity: isLight ? Math.min(s.opacity * 1.4, 0.85) : s.opacity,
            animation: `twinkle ${s.twinkleDur}s ease-in-out ${s.twinkleDelay}s infinite`,
            boxShadow: isLight && s.size > 1 ? `0 0 ${s.size * 3}px rgba(255,255,255,0.3)` : 'none',
            transition: 'opacity 0.8s ease, width 0.8s ease, height 0.8s ease',
          }}
        />
      ))}
      {/* Colored particles — slightly more vivid in light mode */}
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
            opacity: isLight ? Math.min(p.opacity * 1.3, 0.7) : p.opacity,
            animation: `drift${p.hue} ${p.dur}s ease-in-out ${p.delay}s infinite`,
            boxShadow:
              p.size > 1.8
                ? `0 0 ${p.size * (isLight ? 6 : 4)}px ${colors[p.hue]}${isLight ? '70' : '50'}`
                : 'none',
            transition: 'opacity 0.8s ease',
          }}
        />
      ))}
    </div>
  );
}
