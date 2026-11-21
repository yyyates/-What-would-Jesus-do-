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

## Settings (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Your key. Without it the app runs in demo mode. |
| `MODEL` | `claude-haiku-5-5` | Cheapest. `claude-sonnet-5-5` gives richer answers at ~10x cost. |
| `FREE_PER_DAY` | `3` | Free questions per visitor per day. |
| `DAILY_QUESTION_CAP` | `2000` | Whole-site daily limit, protects your bill. |
| `DONATE_URL` | none | If set, shows a "help keep it going" link (Stripe Payment Link, Buy Me a Coffee, etc.). |
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

- **Freemium:** 3 free questions a day (built in). Premium at about $4.99/month or $39/year: unlimited questions, saved history and journal, follow-up conversation, choice of translation.
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
- `public/` — `index.html`, `app.js`, `style.css`, privacy, terms and 404 pages
- `render.yaml`, `Dockerfile`, `.env.example` — deployment
- `bible.js` — KJV lookup with book-name aliases ("Psalm", "1 Cor", "First John")
- `data/kjv.json` — King James Version text, public domain
