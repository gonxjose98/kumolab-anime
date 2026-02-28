'use client';

import { useRef, useMemo } from 'react';

const STAR_COUNT = 120;
const PARTICLE_COUNT = 70;
const COLORS = ['#00d4ff', '#ff3cac', '#7b61ff'];

export default function GalaxyBackground() {
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
            background: s.tint,
            opacity: s.opacity,
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
            background: COLORS[p.hue],
            opacity: p.opacity,
            animation: `drift${p.id % 3} ${p.dur}s ease-in-out ${p.delay}s infinite`,
            boxShadow:
              p.size > 1.8
                ? `0 0 ${p.size * 4}px ${COLORS[p.hue]}50`
                : 'none',
          }}
        />
      ))}
    </div>
  );
}
