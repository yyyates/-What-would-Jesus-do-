# What Would Jesus Do

Ask any life question and get warm guidance grounded in the teachings of Jesus, with 2 to 4 Bible verses quoted word for word from the King James Version.

## How it works

1. The question goes to Claude with a system prompt that frames answers as *what Jesus taught* (never "I am Jesus"), plus safety rules for crisis, medical and legal topics.
2. Claude returns structured JSON: the answer, plus verse **references only** (book, chapter, verses, why it applies).
3. The server looks every reference up in a bundled public-domain KJV (31,102 verses, `data/kjv.json`). Anything that doesn't exist is dropped. So the quoted scripture can never be misquoted or invented.
4. A crisis check (model flag + keyword match) shows a 988 banner.

## Run it on your computer

```bash
npm install
cp .env.example .env      # then open .env and paste your key after ANTHROPIC_API_KEY=
npm start                 # http://localhost:3000
```

With no key it runs in demo mode with a sample answer.

## Add your API key privately

Your key is like a password. Never paste it into chat, email, or code, and never commit `.env` (it's in `.gitignore`).

- **On your computer:** put it in the `.env` file as shown above.
- **On Render:** when you create the service from `render.yaml`, Render asks for `ANTHROPIC_API_KEY` in its dashboard. Paste it there. It's stored encrypted and never appears in the code.
- **Spend limit:** in the Anthropic Console go to **Settings > Limits** and set a monthly limit (e.g. $10). The app also has its own daily cap (`DAILY_QUESTION_CAP`, default 2,000 questions/day, about $1/day on Haiku).

## Set up Premium with Stripe

Premium ($4.99/month or $39/year) gives unlimited questions, follow-up questions and saved history. It stays hidden until these steps are done.

1. Sign up at [stripe.com](https://stripe.com) and finish account activation (business details and bank account for payouts). An individual or sole proprietor is fine.
2. In the Stripe Dashboard go to **Product catalog > Add product**. Name it "Premium". Add a **recurring** price of $4.99 **monthly**, then add a second price of $39 **yearly**. Copy each price's ID (starts with `price_`).
3. Go to **Settings > Billing > Customer portal** and click **Activate** so members can cancel or change their card themselves.
4. Go to **Developers > API keys** and copy the **Secret key** (starts with `sk_live_`; use `sk_test_` first to try it with Stripe's test card 4242 4242 4242 4242).
5. In Render, open the service, go to **Environment**, and fill in `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`. Save. Render redeploys and the Premium button appears.

How sign-in works without passwords: after paying, the member's browser gets a signed Premium code (shown on their Premium page). To use Premium on another device they paste that code. Stripe remains the record of who is paying, so cancelling ends Premium automatically. Stripe takes about 2.9% + 30¢ per payment.

## Set up check-in reminders

Visitors can opt in (on the new **Reminders** page, or from a gentle invite after their first answer) to a short, warm check-in from Jesus with a KJV verse, by **push notification**, **email**, or both. They pick daily or Sundays, and the time in their own time zone. Nothing is sent unless they ask; email uses double opt-in (a confirm link) and every email has a one-click unsubscribe. Messages are pre-written in `messages.js` (31 that rotate daily), so reminders cost nothing in AI usage. Each part stays hidden until its keys are set.

1. **Storage (free):** sign up at [upstash.com](https://upstash.com), create a Redis database, and copy the **REST URL** and **REST token** into `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. (Render's free disk is wiped on every restart, so this is where subscribers are kept.)
2. **Push notifications (free):** run `npm run vapid-keys` once on your computer. Paste the public key into `VAPID_PUBLIC_KEY`, the private key into `VAPID_PRIVATE_KEY`, and set `VAPID_SUBJECT` to `mailto:` plus your email. Works on Android, Windows, Mac and Linux browsers; on iPhone the visitor first adds the site to their home screen (the page explains how).
3. **Email (free up to 3,000/month):** sign up at [resend.com](https://resend.com), add and verify your domain (a few DNS records), create an API key, and set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `What Would Jesus Do <hello@yourdomain.com>`). Set `PUBLIC_URL` to your site's address so email links point to it.
4. **The hourly sender:** set `CRON_SECRET` on the server to any long random string. In GitHub go to **Settings > Secrets and variables > Actions** and add `CRON_SECRET` (same value) and `SITE_URL` (your site's address). The workflow in `.github/workflows/reminders.yml` then runs every hour; you can also run it by hand from the **Actions** tab. (GitHub pauses scheduled workflows after 60 days with no commits; re-enable it from the Actions tab if that happens.)

To test: turn on notifications at `/reminders` and you should get a welcome notification right away.

## Settings (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Your key. Without it the app runs in demo mode. |
| `MODEL` | `claude-haiku-5-5` | Cheapest. `claude-sonnet-5-5` gives richer answers at ~10x cost. |
| `FREE_PER_DAY` | `10` | Free messages per visitor per day. |
| `DAILY_QUESTION_CAP` | `2000` | Whole-site daily limit, protects your bill. |
| `DONATE_URL` | none | If set, shows a "help keep it going" link (Stripe Payment Link, Buy Me a Coffee, etc.). |
| `STRIPE_SECRET_KEY` | none | Stripe secret key. Premium is hidden without it. |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` | none | Stripe price IDs for the two plans. |
| `SESSION_SECRET` | none | Long random string for signing Premium codes (Render generates it). |
| `PREMIUM_PER_DAY` | `100` | Fair-use daily limit for Premium members. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | none | Push notification keys (`npm run vapid-keys`). |
| `RESEND_API_KEY` / `EMAIL_FROM` | none | Email reminders via Resend. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | none | Where reminder subscribers are stored. Without them, a local file is used. |
| `CRON_SECRET` | none | Lets the hourly scheduler trigger reminders. |
| `PUBLIC_URL` | none | Your site address, used in email links. |
| `SITE_NAME` | `What Would Jesus Do` | Used in server logs and config. |

## Production features

- Verse text always comes from the bundled KJV, invalid references are dropped
- Per-visitor daily limit, burst limit (6 per minute), site-wide daily cap
- Failed answers don't use up a visitor's free question
- Security headers (Content-Security-Policy etc.), 10 KB request limit, no questions stored
- `/healthz` health check, logs token usage per answer (not the question) so you can watch cost
- Crisis banner (988), privacy and terms pages, 404 page, copy-answer button, dark mode

Limits are kept in memory, which is right for one server. They reset on restart. To run several servers or add paid accounts, move them to a database.

## Rough running cost per question

About 1K input + 500 to 800 output tokens. Estimates, measure with real traffic:

| Model | ~Cost per question | 10,000 questions/month |
|---|---|---|
| Claude Haiku 5.5 (default) | ~$0.0005 | ~$5 |
| Claude Sonnet 5.5 | ~$0.007 to $0.01 | ~$70 to $100 |
| Claude Opus 5.5 | ~$0.015 to $0.02 | ~$150 to $200 |

## Making money (sketch)

- **Freemium (built in):** 10 free messages a day. Premium at $4.99/month or $39/year: unlimited questions, follow-ups, saved history.
- **Daily devotional email/push:** free list builder; a personalized version is a premium perk. The email list is the most valuable asset.
- **Donations / "pay it forward":** a tip jar (Stripe Payment Links, Buy Me a Coffee) fits this audience well. "Sponsor 100 questions for someone who can't pay."
- **Churches and ministries (B2B):** a white-label widget for church websites at $20 to $50/month per church.
- **Avoid:** heavy ads (cheapens trust) and selling user data (questions are deeply personal).
- **Growth:** short-form video of real (anonymized) questions and answers, Christian Facebook groups, SEO pages for common questions ("What does the Bible say about anxiety?").

## Deploying

**Render (free to start; ~$7/month "starter" plan keeps it always on):**
1. Put this folder in a GitHub repository.
2. On render.com: **New > Blueprint**, pick the repo. It reads `render.yaml`.
3. Paste your `ANTHROPIC_API_KEY` when asked (and `DONATE_URL` if you have one). Deploy.
4. Optional: add your own domain under **Settings > Custom Domains** (~$12/year from any registrar).

**Anywhere with Docker** (Fly.io, Railway, a VPS): a `Dockerfile` is included. Set the same environment variables in that host's secrets settings.

**Before launch:** have the privacy and terms pages reviewed, set the Console spend limit, and ask a pastor or two to try tricky questions.

## Files

- `server.js` — API (`POST /api/ask`), prompt, limits, security, demo mode
- `premium.js` — Stripe checkout, Premium codes, subscription portal
- `reminders.js`, `messages.js`, `public/reminders.*`, `public/sw.js` — opt-in check-in reminders (push and email)
- `public/` — `index.html`, `app.js`, `style.css`, privacy, terms and 404 pages
- `render.yaml`, `Dockerfile`, `.env.example` — deployment
- `bible.js` — KJV lookup with book-name aliases ("Psalm", "1 Cor", "First John")
- `data/kjv.json` — King James Version text, public domain
