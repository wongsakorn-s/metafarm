# Phase 5 — multiple users and hardening

> **Status:** **5.1 done** (2026-10-08): owner/staff roles, `/admin/users`, migration 0011. **5.2 done** (2026-10-08): three-key login throttle, unlock on `/admin/users`. Next: 5.3.

## Work order

| # | Item | Why |
|---|---|---|
| **5.1** | **Owner / staff roles** | Must exist before a second user is added. |
| 5.2 | Per-email login throttle | Lockout was keyed only by email + IP; rotating IPs gave unlimited guesses. |
| 5.3 | Optimistic concurrency (two people editing the same hive/order) | Needed once there is more than one user. |
| 5.4 | LINE notifications (unpaid orders, harvest reminders) | Owner request. |
| 5.5 | Offline mode for the field | Weak signal in the garden; large piece of work, last. |
| — | Palm module | Scope still to be agreed with the owner. |

## 5.1 Roles (as built)

Decisions (user, 2026-10-08, "as recommended"): staff have **no** access to sales; staff **may** edit basic hive info without money fields; temporary passwords **must** be changed at first login.

| Area | Owner | Staff |
|---|---|---|
| Dashboard | everything | hive work only; no order rows, sales totals or readiness link |
| Hive: view history, record work (honey, split, queen cells, note, collapse) | ✅ | ✅ |
| Hive: purchase price, supplier, sale price, sold price | ✅ | ❌ hidden; server ignores submitted values |
| Hive: list for sale / mark sold | ✅ | ❌ (status only active ↔ collapsed; a sold hive cannot be changed) |
| Add hive / edit hive info | ✅ | ✅ without purchase price |
| Hive internal notes | ✅ | ✅ (needed for work — free text, may mention who a hive was bought from) |
| Order codes in hive history ("ขายตามออเดอร์ S…") | ✅ | masked (`maskOrderCodes`) |
| Photos, photo queue, incomplete data | ✅ | ✅ |
| Production + weather | ✅ | ✅ (no link to settings) |
| Honey lots: create, bottle, print labels | ✅ | ✅ without bottling cost or bottles sold |
| Sales: orders, customers, products/prices, reports, CSV | ✅ | ❌ 403 |
| Settings, readiness | ✅ | ❌ 403 |
| Users (`/admin/users`) | ✅ | ❌ 403 |
| Own account / password | ✅ | ✅ |

**Enforcement (three layers):**
1. `src/middleware.ts` + `ownerOnlyPath()` — staff get the "no permission" page (403) on owner paths; POSTs and file downloads get a bare 403.
2. Server functions ignore or refuse money/sales input from staff: `updateHive`/`createHive` (purchase price), `updateSale`, `changeStatus`/`fillMissing` (`statusTargets`), `addBottling` (unit cost).
3. Pages hide menus, fields and columns (`isOwner`).

**Users page:** the owner adds staff (name + email); the system generates a temporary password, shown once, with a copy-to-LINE button. Submitting the same form twice issues a fresh password for the same account instead of a duplicate. Disable (ends all sessions at once, reversible) and reset password (new temporary password, ends sessions). Owner accounts are never managed from this page, so the owner cannot lock themselves out. Owners are still created with `scripts/create-owner.ts`.

**Tests:** `check:forms` section 15 — real staff login, forced password change, menus, 403s, tampered POSTs (sale, sold status, purchase price), "recorded by", disable/enable. `check:staff` — logs in as that staff user and scans every staff-reachable page (all hives, edit pages, lots, labels) for real supplier/customer/order/payment data, money amounts and links to owner pages, and checks owner paths return 403.

## 5.2 Login throttle (as built)

`src/lib/auth/throttle.ts` — failed logins in a rolling 15-minute window, counted under three hashed keys in `login_attempts` (no migration):

| Key | Limit | Stops |
|---|---|---|
| email + IP (unchanged format) | 5 | one person or bot guessing from one place |
| email, any IP | 10 | a bot rotating IPs against one account |
| IP, any email | 30 | password spraying many accounts from one place (30 leaves room for staff sharing the farm's internet) |

- When locked, the login page answers "ลองผิดหลายครั้งเกินไป" **without checking the password**, so locked attempts tell an attacker nothing.
- A successful login clears only its own email + IP key. The per-email and per-IP counts stay, so the owner logging in does not hand a guessing bot a fresh allowance.
- Reaching the per-email limit on a real account writes `login.locked` to `audit_logs`.
- `/admin/users` shows failed attempts per account in the last 15 minutes. The owner can **unlock** a staff account, which deletes its per-email key.
- **Trade-off (accepted):** someone deliberately guessing the owner's password can stop the owner logging in *on a new device* for about 15 minutes. Devices already logged in keep working, since sessions last 30 days. The owner row on `/admin/users` explains this when it happens.
- IP comes from `cf-connecting-ip`, which Cloudflare sets in production. Locally, `check:forms` section 16 uses the same header to simulate rotating IPs.
