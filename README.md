# 🏠 Home Os

> One home, everyone on the same page. ✨

A shared **family organizer** — groceries 🛒, tasks ✅, goals 🎯, house bills 🧾, private earnings 🔒 and a shared savings pool 💰 — wrapped in a calm lime + sage brand.

![Expo](https://img.shields.io/badge/Expo-SDK_57-000020?style=for-the-badge&logo=expo)
![React Native](https://img.shields.io/badge/React_Native-0.86-61DAFB?style=for-the-badge&logo=react)
![Supabase](https://img.shields.io/badge/Supabase-Postgres_+_RLS-3ECF8E?style=for-the-badge&logo=supabase)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript)
![License](https://img.shields.io/badge/License-MIT-9FE870?style=for-the-badge)

---

## ✨ What it does

| 🏡 Area | What you get |
|---|---|
| 🏠 **Home** | Today at a glance, month card (spending + savings pool + coverage), shortcuts, goals preview, family row |
| 🛒 **Groceries** | Shared monthly list, grouped by category, monthly staples 🔁, swipe-to-tick, undo toast, browse past months |
| ✅ **Tasks** | My-tasks-first (Overdue / Today / This week), per-member view, 7-day week view, daily / weekly / one-off, history, undo on delete |
| 🎯 **Goals** | Family goals (trip, repaint, savings target), open-first ordering, credit to setter, celebration moment 🎉, monthly focus |
| 💰 **Money** | Private earnings (only you — with 🔒 note), month total + last-month compare, salary / freelance / gift sources, private savings, shared pool total |
| 🧾 **Bills** | Rent, electricity, water, gas, internet, maid… paid/unpaid + due-day, due-soon ⚠️ highlights, this-vs-last month |
| 📍 **Maps & SOS** | Saved shared places, opt-in live location, one-tap SOS alert the whole home sees 🚨 |
| ⚙️ **Settings** | Photo + name profile, Light/Dark 🌗 toggle, home name + invite code 📋, Head 👑 transfer, grocery store shortcut, sign out |

---

## 🎨 Brand

One accent. No exceptions. 💅

* 💚 **Lime** `#9FE870` — the *only* CTA / identity colour
* 🌿 **Sage canvas** `#E8EBE6` — page background, white cards float on it
* 🖤 **Ink** `#0E0F0C` — text, dark cards, splash base `#101208`
* 🔤 **Inter** — `900 Black` for display, `600 SemiBold` for titles/labels, `400` for body
* ⬛ **24px** (`radius.xl`) — every card + button. Pills for chips/badges.
* 🚫 No second accent, no blue-violet gradients, no emoji-as-icons, no `allowFontScaling={false}`, 48px touch targets minimum

> Tokens live in exactly one place: `src/theme/tokens.ts` — never hardcode a hex outside it. 🔒

---

## 🧱 Tech stack

| Layer | Pinned |
|---|---|
| 📱 Expo SDK | `~57.0.26` |
| ⚛️ React Native / React | `0.86.3` / `19.2.3` (New Architecture) |
| 🧭 Routing | `expo-router ~57` + `unstable-native-tabs` (4 tabs: Home, Groceries, Tasks, Money) |
| 🗄️ Backend | Supabase — Postgres + Auth (email/password) + **RLS** |
| 🎨 Styling | Plain `StyleSheet` + token file. No NativeWind / Tamagui — on purpose |
| 📳 Motion | Reanimated v4 `FadeInUp` on mount, haptics via `expo-haptics` |
| 🔔 Push | `expo-notifications` |
| 🧰 Types | TypeScript `strict` |

---

## 🔐 Privacy model (the important bit)

Privacy is enforced **in Postgres, not in the UI**. Unzipping the APK only reveals the *publishable* key — which is public by design.

* 🔒 **Earnings / savings rows:** `user_id = auth.uid()` — owner-only, all verbs
* 👨‍👩‍👧 **Groceries / bills / tasks / goals:** household members only (`is_member()`)
* ➕ **Joining:** only via `create_household()` / `join_household()` RPC with the 6-letter code (`ABCDEFGHJKMNPQRSTUVWXYZ23456789` — no `0/O/1/I/L` confusion)
* 👑 **Head:** exactly one per home (partial unique index). Moves only via `transfer_headship()`. Invite code + creator frozen by trigger — can never lock the family out
* 🖼️ **Avatars:** `avatars/<user-id>/…` bucket, owner-folder policies

---

## 📁 Project structure

```
Home Os/
├── 📱 app.json / eas.json        → icon, splash, adaptive icon, build profiles
├── 🎨 assets/                    → icon.png, splash-icon.png, favicon.png, gradient.png
├── 🧭 src/app/                   → routes (Expo Router — every file is a screen)
│   ├── _layout.tsx               → providers + Stack.Protected flow gate + gradient BootSplash
│   ├── (tabs)/                   → Home / Groceries / Tasks / Money (+ Maps)
│   ├── onboarding.tsx / profile.tsx / invite.tsx
│   └── settings.tsx / house-expenses.tsx / notifications.tsx …
├── 🧩 src/components/ui/         → THE ui kit (Screen, Text, Button, Card, Sheet, Avatar…)
├── 🎨 src/theme/                 → tokens.ts, ThemeProvider (light/dark, default light)
├── 🔌 src/lib/                   → supabase, session, household, email-auth, hooks, format (₹ en-IN)
├── 🛒 src/features/              → groceries, expenses, money, tasks, goals, maps
├── 🗄️ supabase/schema.sql        → full idempotent DDL + RLS + RPCs (run once)
└── 📖 docs/SETUP.md              → 10-min no-code setup guide
```

---

## 🚀 Getting started

> Full hand-holding version: [`docs/SETUP.md`](docs/SETUP.md) 📖

```bash
# 1️⃣ clone + install
npm install

# 2️⃣ backend (Supabase, free)
#   • create project → turn OFF email confirmation → copy URL + publishable key
#   • SQL Editor → paste + Run supabase/schema.sql

# 3️⃣ keys
Copy-Item .env.example .env   # PowerShell
# fill in:
# EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
# EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx

# 4️⃣ run 🥳
npm start
# scan QR with Expo Go, or press w for web
```

First run flow: **Account → Home (create/join with 6-letter code) → Invite → Tabs** 🏁

---

## 🧪 Scripts

```bash
npm start          # 🟢 dev server
npm run typecheck  # 🔍 tsc --noEmit (must be silent)
npm run lint       # 🧹 eslint (must exit 0)
npm run format     # 💅 prettier --write
npm run doctor     # 🩺 expo-doctor
```

Pre-declare-done checklist (plan.md §4.5):
```bash
npm run typecheck && npm run lint && npm run format:check
npx expo export --platform web  # proves it bundles — delete dist/ after
```

---

## 📦 Build the APK

```bash
npx eas-cli@latest login
npx eas-cli@latest init          # once — links projectId
npx eas-cli@latest build --profile preview --platform android
# ⏳ ~10-20 min → expo.dev link → Install / download .apk 📲
```

* `preview` = installable `.apk` (internal) ✅
* `production` = store `.aab` + `autoIncrement` ✅
* OTA later, no rebuild: `npx eas-cli@latest update --channel production --message "what changed"` ⚡

---

## 🖼️ Branding assets

| File | Use | Status |
|---|---|---|
| `assets/Asset-1.png` | 🎨 Master logo (lime on forest-green) | ✅ your creation |
| `assets/icon.png` | 📱 App icon 1024px | ✅ replaced from logo |
| `assets/splash-icon.png` | 🚀 Splash logo 200px on `#101208` | ✅ replaced from logo |
| `assets/favicon.png` | 🌐 Web favicon | ✅ replaced from logo |
| `assets/gradient.png` | 🌈 Hero art + BootSplash background | ✅ on-brand |
| `android-icon-*` | 🤖 Adaptive + monochrome | 🔧 remake from logo before store |

Splash = native solid `#101208` + logo → fades into full gradient `BootSplash` with centered 132px logo. 🌗

---

## 🗺️ Roadmap ideas

* 🔔 Bill-due push reminders
* 📊 Spending charts per category
* 🛍️ Receipt scan → grocery add
* 🌍 Multi-language (Hindi + English)
* 🍎 iOS TestFlight build

---

## 📄 License

MIT — see [LICENSE](LICENSE). Built with 💚 on Expo.
```

**Made for families, by family.** 🏡✨
