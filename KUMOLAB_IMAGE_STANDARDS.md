# KumoLab Image Generation Standards (Hard-Locked)

This document defines the permanent, hard-locked production standards for KumoLab's image generation engine and admin editor.

## 1. Final Output Dimensions
- **Resolution:** 1080 x 1350 pixels
- **Aspect Ratio:** 4:5 (Instagram Portrait)
- **Format:** PNG / High-Quality JPEG

## 2. Subject-Safe Framing Rules
- **Automatic Abort:** The engine must abort any post where the source asset violates the **0.6 to 1.6 aspect ratio** range.
- **Source Handling:** Source assets are analyzed and center-cropped into the clean 1080x1350 frame.
- **Safety:** If character cutoff or extreme panoramic stretching would occur, the post is canceled.

## 3. Visual Treatment Scrim & Gradient Rules
- **Text-Dependent FX:** Gradients, shadows, and watermarks are **ONLY** rendered when KumoLab is actively drawing text headlines/titles.
- **TEXT OFF Kill-Switch:** If text is disabled or the "TEXT OFF" toggle is active, the image must remain pure and untouched (center-cropped only).
- **Poster Protection:** "Text-Heavy" posters (Bucket 2) must **NEVER** receive a gradient overlay, even if text is rendered on top of them.

## 4. Platform Parity
- **Engine vs Admin:** The automated background engine and the manual Admin Dashboard editor must use the exact same:
  - Coordinate system (LOCKED at 1080x1350)
  - Regional zone math (35% safe zones)
  - Centering logic
  - Font scaling rules (Outfit-Black)

---
*Last Updated: 2026-02-06*
