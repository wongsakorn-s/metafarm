# MetaFarm

Production web platform and operational management system for MetaFarm (Palm Oil & Stingless Bee Farm), located in Pluak Daeng, Rayong, Thailand.

Built with **Astro 7**, **Tailwind CSS 4**, and **Cloudflare Workers (D1, R2)**.

[![Production Status](https://img.shields.io/badge/Production-Live-2ea44f)](https://metafarm.wong-saengsurasak.workers.dev)
[![Platform](https://img.shields.io/badge/Platform-Cloudflare%20Workers-f38020)](https://workers.cloudflare.com)
[![Framework](https://img.shields.io/badge/Framework-Astro%207-bc52ee)](https://astro.build)
[![Styling](https://img.shields.io/badge/Styling-Tailwind%20CSS%204-06b6d4)](https://tailwindcss.com)
[![Package Manager](https://img.shields.io/badge/Package%20Manager-Bun%201.3-fbf0df)](https://bun.sh)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24%20LTS-339933)](https://nodejs.org)
[![Test Suite](https://img.shields.io/badge/Tests-406%20passed-brightgreen)](https://vitest.dev)
[![Mobile Lighthouse](https://img.shields.io/badge/Lighthouse-99--100-brightgreen)](https://pagespeed.web.dev)

---

## Table of Contents

- [Overview](#overview)
- [System Architecture & Stack](#system-architecture--stack)
- [Core Features](#core-features)
- [Getting Started](#getting-started)
- [Development and QA Scripts](#development-and-qa-scripts)
- [Project Directory Structure](#project-directory-structure)
- [Documentation Index](#documentation-index)
- [Operational Safety & Compliance](#operational-safety--compliance)

---

## Overview

MetaFarm operates a 50-rai palm oil orchard and an apiary of silver-haired stingless bees (*Tetragonula pegdeni* / ชันโรงขนเงิน) housed in proprietary teak hives. 

The system delivers a dual-purpose platform:
1. **Public Web Portal:** Educational articles, scientific research summaries, product catalogs, and traceability verification via digital hive passports and honey extraction lot lookups.
2. **Operational Backoffice (`/admin`):** Field records (honey extractions, colony divisions, queen rearing), media management, inventory, multi-channel customer orders, role-based access control, and offline-capable data synchronization for orchard work.

---

## System Architecture & Stack

| Component | Technology | Rationale & Characteristics |
|---|---|---|
| **Framework & SSR** | Astro 7 + Tailwind CSS 4 | Zero React client runtime overhead. Client scripts use modular vanilla TypeScript. Generates static and SSR edge pages with 99–100 Mobile Lighthouse scores. |
| **Compute Engine** | Cloudflare Workers | Server-side rendering and asset delivery deployed at the edge with sub-millisecond cold starts and zero infrastructure overhead. |
| **Database** | Cloudflare D1 + Drizzle ORM | SQLite at the edge with typed queries, strict foreign key constraints, automated point-in-time migrations, and nightly automated backups. |
| **Object Storage** | Cloudflare R2 | S3-compatible asset storage for full-resolution photos, thumbnails, and H.264 video. Media uploads automatically undergo client and server EXIF/GPS scrubbing. |
| **Testing & Verification** | Vitest + Playwright Core | 406 integration and unit tests running against isolated Miniflare D1 instances. Real browser tests for desktop and mobile viewport emulation. |

---

## Core Features

### Public Platform

- **Knowledge Base:**
  - Stingless Bee Biology (`/stingless-bee`): Anatomy, hive architecture, and colony behavior.
  - Honey Properties (`/honey`): Raw honey characteristics compliant with consumer food labeling guidelines.
  - Scientific Research (`/learn/research`): Peer-reviewed studies on stingless bee honey.
- **Product Catalog (`/products`):**
  - Live Colonies (`/products/hives/[code]`): Complete colony listings with top-down interior photos (through transparent hive covers) and queen origin history.
  - Equipment & Honey: Custom teak boxes (`/products/hive-box`) and bottled honey (`/products/stingless-honey`).
- **Hive Passport (`/passport/[code]`):**
  - Public record for all 147 colonies showing acquisition date, queen mother/egg origins, daughter colony lineages, timeline history, and 4:3 garden location photos.
- **Lot Traceability (`/lot/[code]`):**
  - Scannable bottle QR codes linking consumers directly to harvest dates, source hives, and batch origin records.
- **Interactive Media Experience:**
  - Dynamic on-page thumbnail switcher coupled with a touch-friendly, hardware-accelerated lightbox supporting pinch-to-zoom, double-tap, mouse wheel zoom, and pan.

### Operational Backoffice (`/admin`)

- **Hive Registry & Event Logging:**
  - Log honey harvests (ml/g), queen cell extraction, colony division, and health inspections with deduplication and idempotency keys.
- **Dual Photo Pipeline:**
  - Distinct photo roles for garden location photos (wide 4:3 shots to locate hives in the orchard) and sale photos (top-down view through transparent sheets showing colony population).
- **Sales & Lot Allocation:**
  - Manual order capture from chat channels (LINE, Facebook), stock deduction on payment, and automated FIFO honey lot allocation per bottle size.
- **Field & Offline Readiness:**
  - PWA support for mobile installation.
  - IndexedDB outbox queue ensuring offline form submissions in the orchard sync automatically when connectivity returns.
- **Role-Based Access Control (RBAC):**
  - Three distinct roles: Owner, Admin, and Staff (Staff cannot view revenue, supplier identities, or customer personal information).
- **Readiness Verification (`/admin/readiness`):**
  - Real-time launch checklist verifying real contact channels, confirmed pricing, required hive media, and pending field data.

---

## Getting Started

### Prerequisites

- **Bun** (v1.2+ or latest, recommended) or **Node.js 24 LTS**

### Local Environment Setup

1. **Install dependencies:**
   ```sh
   bun install
   ```

2. **Initialize local database and apply migrations:**
   ```sh
   bun run db:migrate:local
   ```

3. **Import initial dataset and seed media:**
   ```sh
   bun run import:excel
   bun run db:seed:local
   bun run media:seed:local
   bun run products:seed:local
   ```

4. **Create a local administrator user:**
   ```sh
   bun run user:create -- --email owner@metafarm.local --generate
   ```
   *Generated credentials are saved to `private/dev-owner.txt`.*

5. **Start local development server:**
   ```sh
   bun run dev
   ```
   - Public Website: `http://localhost:4321`
   - Admin Backoffice: `http://localhost:4321/admin`

---

## Development and QA Scripts

### Code Quality and Unit Testing

```sh
bun run check              # Run Astro and TypeScript static type checks
bun run test               # Execute complete Vitest suite (406 tests)
bun run build              # Produce production build assets
bun run preview            # Preview production build locally
```

### Comprehensive QA and Verification

```sh
# Verify rendering across desktop and mobile in installed Chromium/Edge
# (Requires local dev server running via `bun run dev`)
bun run check:browser

# Emulate mobile touchscreen UX (tap targets >= 44px, inputs >= 16px, offline resilience)
bun run check:mobile

# Scan public endpoints to ensure no confidential data (purchase price, supplier, customer PII) leaks
# (Requires local dev server running via `bun run dev`)
bun run check:leaks

# Automated validation of all admin forms and CSRF tokens
bun run check:forms

# Verify staff permission boundaries (confidential financial and customer isolation)
bun run check:staff

# Test offline outbox queue and network recovery behavior
bun run check:offline

# Audit mobile Lighthouse performance and accessibility scores
bun run check:lighthouse
```

### Data and Operations

```sh
bun run brand:build        # Generate optimized web logos and favicons from source assets
bun run predeploy          # Validate deployment prerequisites before release
bun run snapshot:export    # Export sanitized local database and media snapshot
bun run generate-types     # Update Cloudflare Worker typing definitions
```

---

## Project Directory Structure

```
metafarm/
├── content/               # Editable Markdown articles (loaded via src/lib/content.ts)
│   ├── learn/             # Scientific research summaries
│   ├── pages/             # Informational pages (species, honey, privacy)
│   └── training/          # Training course descriptions
├── design/                # Brand logo files and UI wireframes
├── design-system/         # Design system tokens and UX standards (MASTER.md)
├── docs/                  # Architectural documentation, decisions, and runbooks
├── drizzle/               # D1 SQL migration files
├── mock-data/             # Local test dataset schemas
├── private/               # Local-only supplier raw data and Excel imports (gitignored)
├── scripts/               # Automation scripts (import, backup, testing, and deployment)
└── src/                   # Application source code
    ├── components/        # Reusable Astro UI components
    ├── db/                # Drizzle schema definitions (schema.ts)
    ├── layouts/           # Page layouts (PublicLayout.astro, AdminLayout.astro)
    ├── lib/               # Shared domain utilities, validation, and SEO helpers
    ├── pages/             # File-based routing (public routes and /admin/* endpoints)
    ├── scripts/           # Client-side scripts (lightbox, outbox, image resize)
    ├── server/            # Server-side business logic, DB queries, and auth
    └── styles/            # Global Tailwind CSS 4 style definitions
```

---

## Documentation Index

Detailed engineering plans and operational guidelines are maintained in the [`docs/`](docs/) directory:

| Document | Description |
|---|---|
| [**docs/00-roadmap.md**](docs/00-roadmap.md) | Phased roadmap (Phases 0–5), implementation status, and pending milestones. |
| [**docs/01-requirements.md**](docs/01-requirements.md) | Stakeholder requirements, non-functional constraints, and user stories. |
| [**docs/02-architecture.md**](docs/02-architecture.md) | System architecture, edge execution model, and security isolation. |
| [**docs/03-data-model.md**](docs/03-data-model.md) | Entity relationship diagrams, schema specifications, and confidential field markers. |
| [**docs/04-sitemap.md**](docs/04-sitemap.md) | Complete URL mapping and desktop/mobile interface layouts. |
| [**docs/05-sales-channels.md**](docs/05-sales-channels.md) | Commercial workflows, customer communication, and regulatory requirements. |
| [**docs/06-mock-data.md**](docs/06-mock-data.md) | Baseline farm metrics and sample pricing configurations. |
| [**docs/07-decisions.md**](docs/07-decisions.md) | Architecture Decision Records (ADRs) and technical rationales. |
| [**docs/08-stack-comparison.md**](docs/08-stack-comparison.md) | Architectural evaluation comparing edge runtimes, databases, and frameworks. |
| [**docs/09-research-notes.md**](docs/09-research-notes.md) | Academic references and source data for stingless bee honey claims. |
| [**docs/10-deploy-runbook.md**](docs/10-deploy-runbook.md) | Production release runbook, backup procedures, and disaster recovery. |
| [**docs/11-phase4-plan.md**](docs/11-phase4-plan.md) | Specifications for inventory, bottling, orders, and sales reporting. |
| [**docs/12-phase5-plan.md**](docs/12-phase5-plan.md) | Multi-user roles, concurrency safeguards, and offline orchard operations. |

---

## Operational Safety & Compliance

> [!CAUTION]
> **Production Data Protection:**
> 1. Production is the single source of truth. Never run `seed.sql` or `snapshot.sql` against the remote production database; both scripts execute table-level deletions.
> 2. Supplier personal information and purchase agreements in `private/` are strictly confidential and must never be committed to git or exposed on public pages.
> 3. Fields flagged as confidential (purchase price, supplier name, customer personal information, private staff notes) must always pass through server-side allowlists before rendering.
> 4. In compliance with food advertising regulations, honey content must never claim curative, therapeutic, or medicinal properties. Product documentation must always reinforce: *"Stingless bee honey is a natural food, not a medical drug."*
