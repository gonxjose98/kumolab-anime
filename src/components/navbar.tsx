"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./theme-provider";
import { ThemeToggle } from "./theme-toggle";

export function Navbar() {
  const pathname = usePathname();
  const T = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const NAV_ITEMS = [
    { label: "Home", jp: "ホーム", href: "/" },
    { label: "Blog", jp: "ブログ", href: "/blog" },
    { label: "Merch", jp: "グッズ", href: "/merch" },
    { label: "About", jp: "概要", href: "/about" },
  ];

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: "0 24px",
        background: scrolled || menuOpen ? T.navBg : "transparent",
        backdropFilter: scrolled || menuOpen ? "blur(24px) saturate(1.4)" : "none",
        WebkitBackdropFilter: scrolled || menuOpen ? "blur(24px) saturate(1.4)" : "none",
        borderBottom: scrolled ? `1px solid ${T.navBorder}` : "1px solid transparent",
        transition: "all 0.4s ease",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}
          onClick={() => setMenuOpen(false)}
        >
          <div
            style={{
              width: 36,
              height: 36,
              background: "linear-gradient(135deg, #00d4ff, #7b61ff)",
              clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "#06060e",
                fontFamily: "'Rajdhani', sans-serif",
              }}
            >
              K
            </span>
          </div>
          <span
            style={{
              fontSize: 20,
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              color: T.text,
              letterSpacing: "0.06em",
              transition: "color 0.5s ease",
            }}
          >
            KUMOLAB
          </span>
          <span
            style={{
              fontSize: 9,
              fontFamily: "'Zen Kaku Gothic New', sans-serif",
              color: "rgba(0,212,255,0.5)",
              letterSpacing: "0.1em",
              marginLeft: -4,
            }}
          >
            クモラボ
          </span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ThemeToggle />
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                width: 42,
                height: 42,
                background: menuOpen ? "rgba(0,212,255,0.08)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${menuOpen ? "rgba(0,212,255,0.25)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 2,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                padding: 0,
                transition: "all 0.3s ease",
                clipPath: "polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 1.5,
                  background: menuOpen ? "#00d4ff" : "#a0a0c0",
                  borderRadius: 1,
                  transition: "all 0.3s ease",
                  transform: menuOpen ? "rotate(45deg) translate(2.3px, 2.3px)" : "none",
                }}
              />
              <span
                style={{
                  width: 12,
                  height: 1.5,
                  background: menuOpen ? "#00d4ff" : "#a0a0c0",
                  borderRadius: 1,
                  transition: "all 0.3s ease",
                  opacity: menuOpen ? 0 : 1,
                  transform: menuOpen ? "scaleX(0)" : "scaleX(1)",
                }}
              />
              <span
                style={{
                  width: 18,
                  height: 1.5,
                  background: menuOpen ? "#00d4ff" : "#a0a0c0",
                  borderRadius: 1,
                  transition: "all 0.3s ease",
                  transform: menuOpen ? "rotate(-45deg) translate(2.3px, -2.3px)" : "none",
                }}
              />
            </button>

            <div
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                right: 0,
                width: 240,
                background: T.dropBg,
                backdropFilter: "blur(24px) saturate(1.4)",
                WebkitBackdropFilter: "blur(24px) saturate(1.4)",
                border: `1px solid rgba(0,212,255,${T.light ? 0.15 : 0.1})`,
                overflow: "hidden",
                opacity: menuOpen ? 1 : 0,
                transform: menuOpen ? "translateY(0) scale(1)" : "translateY(-10px) scale(0.96)",
                pointerEvents: menuOpen ? "auto" : "none",
                transition: "all 0.3s cubic-bezier(0.22,1,0.36,1)",
                clipPath:
                  "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 60,
                  height: 1,
                  background: "linear-gradient(90deg, #00d4ff60, transparent)",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 1,
                  height: 40,
                  background: "linear-gradient(180deg, #00d4ff60, transparent)",
                }}
              />
              <div style={{ padding: "8px 0" }}>
                {NAV_ITEMS.map((item, i) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "14px 20px",
                        textDecoration: "none",
                        transition: "all 0.2s ease",
                        background: isActive ? "rgba(0,212,255,0.06)" : "transparent",
                        borderLeft: `2px solid ${isActive ? "#00d4ff" : "transparent"}`,
                        opacity: menuOpen ? 1 : 0,
                        transform: menuOpen ? "translateX(0)" : "translateX(10px)",
                        transitionDelay: menuOpen ? `${i * 0.05 + 0.1}s` : "0s",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 700,
                          color: isActive ? "#00d4ff" : T.textSoft,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                        }}
                      >
                        {item.label}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "'Zen Kaku Gothic New', sans-serif",
                          color: isActive ? "rgba(0,212,255,0.5)" : "rgba(0,212,255,0.3)",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {item.jp}
                      </span>
                    </Link>
                  );
                })}
              </div>
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 60,
                  height: 1,
                  background: "linear-gradient(270deg, #7b61ff40, transparent)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
