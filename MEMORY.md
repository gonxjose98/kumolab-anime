# MEMORY.md - Kumolab Workspace

## Project Overview
**Kumolab** - Anime intelligence hub for verified anime news distribution

### Mission
Relay official, trusted, verified anime information to fans in a clean, aesthetically pleasing, easy-to-digest format. Everything published should feel accurate, fast, and premium — never messy or outdated.

### Current Architecture
- **Scraper System:** Hourly scans of official anime news sources
- **Post Generation:** Structured posts with title + body, auto-selects relevant official visuals
- **Approval Workflow:** Pending → Analysis → Approved → Smart Scheduled
- **Image Engine:** Layered editing with text overlay, gradients, watermarks

### Current Blocker
**Admin Dashboard - Text Toggle Issue**
- Editor includes: image preview, title editor, caption editor, toggles (text/gradient/watermark), purple word targeting, text scaling, drag positioning
- **Problem:** Text is not generating on the preview image even when text toggle is enabled
- **Status:** Active issue requiring debug and fix

### Design Philosophy
- **Fast understanding:** Clean visuals, readable captions, strong presentation
- **Current visuals only:** If Season 5 announced → use Season 5 key visuals (never older promotional art)
- **Zero outdated info tolerance:** Information must always be current

### Content Types
- New season announcements
- Official confirmations (sequels, adaptations, renewals)
- Release date announcements
- Key visual / trailer drops
- Casting announcements
- Production updates
- Delays or schedule changes
- Studio/staff confirmations
- Streaming platform confirmations
- Major promotional reveals

### Next Phase
1. Auto-publish to social media platforms (once fully stable)
2. Spanish language expansion (separate social accounts)

### My Role (COO)
Optimize efficiency, reliability, automation, quality, trust, reach, growth, and scalability at all times.

---

*Workspace active. Full repository access granted.*
