# Setting up Home Os

No coding background needed. About 10 minutes, everything free.

**There is no Google step any more.** Sign-in is just an email and a password, so
the only account you need is Supabase.

---

## What you need

- A phone with **Google Play**
- The **Expo Go** app from the Play Store (for testing — you can delete it later)
- An email address for each family member

You do **not** need Android Studio, the Android SDK, Xcode, a Mac, or a Google
Cloud project.

---

## Part 1 — Supabase (about 8 minutes)

Supabase is where your family's data lives. It is the only place anything is
stored.

### 1.1 Create the project

1. Go to <https://supabase.com/dashboard>
2. **Start your project**, sign in with any account
3. **New project**
4. **Organization**: pick whatever is offered
5. **Name**: `home-os`
6. **Database Password**: invent a strong one and **save it somewhere safe** — you
   will not see it again
7. **Region**: nearest to you (India → Southeast Asia)
8. Wait about 2 minutes

### 1.2 Turn OFF email confirmation

This is the one setting people miss. While confirmation is on, new accounts
cannot sign in until they click a link, and this app sends no emails.

1. Left sidebar → **Authentication** (key icon)
2. **Sign In / Providers** → **Email**
3. Turn **Confirm email** off
4. Make sure **Email** sign-in itself is enabled

> Turning this off means anyone who knows an email and password can sign in.
> That is fine for a private family app on your own phone. Do not reuse the same
> password anywhere else.

### 1.3 Copy your keys

1. Click the **gear icon** (Project Settings) → **API**
2. Copy both:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **Publishable key** — starts with `sb_publishable_`

The publishable key is fine to put in the app. Supabase's Row Level Security is
what actually keeps each person's earnings private — not the key.

### 1.4 Create the tables

1. Left sidebar → **SQL Editor**
2. **New query**
3. Open `supabase/schema.sql` from this project in a text editor
4. Copy **all** of it, paste it in, click **Run**

Safe to run twice — it is written to be repeatable.

---

## Part 2 — Tell the app your keys

1. Copy `.env.example` to `.env`
   - PowerShell: `Copy-Item .env.example .env`
2. Open `.env` and fill in:

```
EXPO_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxx
```

That is the whole file. Nothing else.

3. Start the app:

```bash
npm start
```

The "not connected yet" warning disappears once those two values are real.

---

## Part 3 — How the app works now

There is no sign-in screen. When the app opens it goes straight to the setup
flow, and each person only does this once:

1. **Set up the profile.** Name, email, password, and a colour. Returning
   members just sign in here instead.
2. **Join a home, or create one.**
   - First family member picks **Create a home**, names it, and gets a 6-character
     code like `K7M2QP`.
   - Everyone else picks **Join a home** and types that code.
3. **Done** — the app opens.

On every later visit it goes straight to the app.

### The invite code

6 letters and numbers. The letters `O` and `I` and the digits `0` and `1` are
left out on purpose, because "0 or O" read off a screen is a coin flip.

Capital letters are added for you, and spaces are ignored, so `k7m2qp`,
`K7M2QP` and `k7m 2qp` all work.

The owner shares it from **Settings → Invite code**, which has a Share button.

You can also tap your photo in **Settings** to upload a profile picture — it is
stored in the app's own storage and shown to the whole home. No extra setup;
the photo storage is created with the tables in step 1.4.

### The Head of the House

Whoever creates the home automatically becomes its **Head**. There is always
exactly one head. The head can pass the title to another member from
**Settings** (next to their name → **Make head**), and only the head can rename
the home. The head cannot leave while other members remain — pass the title on
first.

---

## Part 4 — Putting it on a phone

Everything above you can test in **Expo Go** right now, because there is no native
sign-in code any more. Scan the QR code from `npm start`.

When you want a real icon on the home screen — no Expo Go needed:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

Free plan: 15 Android builds a month. Scan the QR it prints, download the `.apk`,
tap Install.

Then send changes to the family without rebuilding:

```bash
npx eas-cli@latest update --channel production --message "what changed"
```

Everyone's app picks it up next time they open it.

---

## Troubleshooting

**"Home Os is not connected yet"**
`.env` is missing or still has placeholder values. Stop the server, fix `.env`,
run `npm start` again.

**"We could not find a home with that code"**
Wrong code, or the person is on a different Supabase project. Everyone in the
family must use the same `.env` — check that first, it is the usual cause.

**"That email already has an account"**
They tapped "New here" instead of "I have an account". Switch the toggle at the
top of the profile screen.

**Sign-up appears to do nothing**
Email confirmation is probably still on. See 1.2.

**"Could not find the table"**
`supabase/schema.sql` was not run. Part 1.4.

**"Permission denied for table"**
A table was added after the initial setup. Run this in the SQL Editor (newer
versions of `supabase/schema.sql` handle future tables automatically):

```sql
grant select, insert, update, delete on all tables in schema public to authenticated;
```

**A family member forgot their password**
There is no reset email. They need to sign up again with a different email, or
you can change their password in Supabase → Authentication → Users.

---

## Command reference

```bash
npm start                            # development
npm run typecheck                    # check types
npm run lint                         # check code
npm run format                       # tidy formatting
npm run doctor                       # check the project

npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest update --channel production --message "..."
```
