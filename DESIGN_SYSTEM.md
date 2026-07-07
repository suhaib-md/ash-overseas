# ASH Overseas — Design System

The one constant style guide for the whole app. **Source of truth for tokens is
[`src/index.css`](src/index.css)** (Tailwind v4 `@theme`); this doc explains how to use them.
If a value isn't a token, it doesn't belong in a component. Never hard-code a hex, px
font size, or ad-hoc colour.

Derived from the owner's mockups, adapted to our constraints: **self-hosted** (no CDN/Google
Fonts — our CSP forbids external origins), **mobile-first** (the mockups' desktop sidebar is
the enhancement, not the base), and scoped to **SRS §17** (none of the mockups' out-of-scope
features — see the end of this file).

---

## Principles

- **Light, clean, institutional.** Deep navy on soft-white; calm surfaces; generous space.
- **Mobile-first, thumb-first.** Design at 360px first; large tap targets (≥44px).
- **The balance is the hero**, always in plain language with **colour + icon + words** —
  never colour alone (colour-blind + screen-reader users).
- **Money is tabular.** Every amount uses tabular figures so columns align.
- **Accessible by default.** AA contrast, real labels, visible focus, semantic HTML.

---

## How it's wired

| Concern    | Choice                                                             | Notes                                                                          |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| CSS engine | **Tailwind v4** via `@tailwindcss/vite`                            | Tokens live in `@theme` in `src/index.css`; utilities are generated on demand. |
| Font       | **Inter** (variable), self-hosted via `@fontsource-variable/inter` | Imported once in `src/main.tsx`. No Google Fonts.                              |
| Icons      | **`lucide-react`** (SVG components)                                | Tree-shaken, crisp, CSP-safe. Replaces the mockups' Material Symbols web font. |
| Currency   | **₹** only, via `formatPaise`                                      | Never `$`. Money is integer paise until render.                                |

---

## Colour tokens

Each generates `bg-*`, `text-*`, `border-*` utilities (e.g. `bg-primary`, `text-on-surface`).

### Brand + core

| Token                    | Hex       | Use                                           |
| ------------------------ | --------- | --------------------------------------------- |
| `primary`                | `#091426` | Brand, primary buttons, headings, key figures |
| `on-primary`             | `#ffffff` | Text/icons on `primary`                       |
| `primary-container`      | `#1e293b` | Dark accent surfaces (avatars, chips)         |
| `on-primary-container`   | `#d8e3fb` | Text on `primary-container`                   |
| `secondary`              | `#5b5e67` | Muted controls                                |
| `secondary-container`    | `#dfe2ed` | Neutral chips/toggles                         |
| `on-secondary-container` | `#3f424b` | Text on `secondary-container`                 |

### Surfaces & text

| Token                                 | Hex                   | Use                          |
| ------------------------------------- | --------------------- | ---------------------------- |
| `background` / `surface`              | `#f8f9ff`             | App background               |
| `surface-bright`                      | `#ffffff`             | App bar, raised header       |
| `surface-container-lowest`            | `#ffffff`             | Cards                        |
| `surface-container-low`               | `#eff4ff`             | Subtle panels, table headers |
| `surface-container`                   | `#e5eeff`             | Hover, filled fields         |
| `surface-container-high` / `-highest` | `#dce9ff` / `#d3e4fe` | Selected / emphasis          |
| `on-surface`                          | `#0b1c30`             | Primary text                 |
| `on-surface-variant`                  | `#45474c`             | Secondary text, labels       |
| `outline`                             | `#75777d`             | Strong borders, icons        |
| `outline-variant`                     | `#c5c6cd`             | Hairline borders, dividers   |

### Semantic — balance direction (the important ones)

Always render as **colour + icon + words**. Map to the plain-language headline (SRS §5):

| State (sign)          | Headline                 | Token pair                                   | Icon (Lucide)    |
| --------------------- | ------------------------ | -------------------------------------------- | ---------------- |
| Positive → receivable | **"Dealer owes you ₹X"** | `positive` / `positive-container` (+ `on-*`) | `ArrowUpRight`   |
| Negative → payable    | **"You owe dealer ₹X"**  | `negative` / `negative-container` (+ `on-*`) | `ArrowDownRight` |
| Zero                  | **"Settled"**            | `neutral` / `secondary-container`            | `Minus`          |

| Token                                          | Hex                   |
| ---------------------------------------------- | --------------------- |
| `positive` / `on-positive`                     | `#0f7b4d` / `#ffffff` |
| `positive-container` / `on-positive-container` | `#c9f2dc` / `#06301d` |
| `negative` / `on-negative`                     | `#ba1a1a` / `#ffffff` |
| `negative-container` / `on-negative-container` | `#ffdad6` / `#410002` |
| `neutral`                                      | `#5b5e67`             |

> `negative` doubles as the error/destructive colour (void, validation errors).

---

## Typography

Generates `text-<name>` (size + line-height + weight + tracking baked in). Font: Inter.

| Utility            | Size / line      | Weight | Use                                     |
| ------------------ | ---------------- | ------ | --------------------------------------- |
| `text-display-lg`  | 32 / 40, −0.02em | 700    | Balance headline, page hero figure      |
| `text-headline-md` | 24 / 32, −0.01em | 600    | Section headline, secondary balance     |
| `text-headline-sm` | 20 / 28          | 600    | Card titles, dealer name                |
| `text-body-lg`     | 16 / 24          | 400    | Body, form values                       |
| `text-body-md`     | 14 / 20          | 400    | Default body, table cells               |
| `text-label-caps`  | 12 / 16, +0.05em | 600    | Overline labels — pair with `uppercase` |

**Money:** add the `tnum` class (tabular figures) to every amount, at any size.

---

## Spacing & radius

- **Named spacing** (design vocabulary): `xs 4`, `sm 8`, `md 16`, `lg 24`, `xl 40` → `p-md`,
  `gap-sm`, `space-y-lg`, etc. (Tailwind's numeric `p-4`… still work; prefer named for intent.)
- **Radius:** `rounded-lg` (8px) buttons & inputs · `rounded-xl` (12px) cards & panels ·
  `rounded-full` pills, avatars, toggles. _(Refines the mockups: `rounded-full` is now truly
  round; card radius softened slightly for a cleaner read.)_

---

## Icons (Lucide)

Sizes: **16** inline with body text · **18** in chips/rows · **22–24** brand/feature.
Use `strokeWidth={2}` (default). Common mappings from the mockups' Material Symbols:

| Mockup (Material Symbol)      | Lucide                    |
| ----------------------------- | ------------------------- |
| `account_balance`             | `Landmark`                |
| `dashboard`                   | `LayoutDashboard`         |
| `shopping_cart` (Purchase)    | `ShoppingCart`            |
| `sell` (Sale)                 | `Tag`                     |
| `group` (Dealers)             | `Users`                   |
| `add`                         | `Plus`                    |
| `search`                      | `Search`                  |
| `settings` / `help`           | `Settings` / `CircleHelp` |
| `edit` / `chevron_right`      | `Pencil` / `ChevronRight` |
| `location_on` / `fingerprint` | `MapPin` / `Fingerprint`  |
| `verified`                    | `BadgeCheck`              |

---

## Component conventions (build once, reuse — see CLAUDE.md inventory)

- **Card:** `rounded-xl border border-outline-variant bg-surface-container-lowest p-lg`.
- **Overline label:** `text-label-caps uppercase text-on-surface-variant`.
- **Primary button:** `bg-primary text-on-primary rounded-lg` + `font-semibold`, min-height 44px.
- **Outline button:** `border border-primary text-primary rounded-lg`.
- **Chip / badge:** `rounded-full px-sm` + a `*-container` bg with its `on-*` text.
- **Input:** `rounded-lg border border-outline-variant bg-surface-container-lowest` +
  `focus:ring-2 focus:ring-primary`.
- **List/table row:** hairline `divide-outline-variant`; hover `bg-surface-container`;
  right-align amounts with `tnum`.
- **Money:** `MoneyDisplay` renders `formatPaise(...)` with `tnum`; direction via the semantic pair.

### Do / Don't

- ✅ Use tokens only; pair balance colour with icon + words; `tnum` on every amount.
- ❌ No raw hex/px in components, no `$`, no colour-only meaning, no external CDNs/fonts.

---

## Deliberately NOT taken from the mockups

Visual language only was adopted. These mockup elements are **out of scope (SRS §17)** and must
not be built: analytics/overview dashboard & aggregate receivable/payable cards, CSV export,
email ledger / PDF statements, dispute/reconciliation, exchange-rate widgets, notifications,
document upload, "consolidated units" view. Also dropped: `$` currency (we use ₹), and the
desktop-first fixed sidebar (we are mobile-first; a sidebar may appear at `lg+` as enhancement).

## Dark mode

Deferred. Tokens are named semantically (`surface`, `on-surface`, …) so a dark theme can later
be added as an overriding `@theme`/`.dark` block without touching components.
