// Opt-in check-in reminders: web push notifications and/or email.
// Nothing is sent unless a visitor turns it on, and every message has a one-click way to stop.
//
// Storage: Upstash Redis (free tier, over HTTPS) when UPSTASH_REDIS_REST_URL/TOKEN are set,
// otherwise a local JSON file (fine on your computer; on Render's free plan the disk is wiped
// on every deploy/restart, so use Upstash there).
// Sending: an outside scheduler (the GitHub Actions workflow in .github/workflows/reminders.yml)
// calls POST /api/reminders/send every hour with CRON_SECRET; each subscriber gets at most one
// message per day, at the local hour they picked.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const webpush = require("web-push");
const { lookup } = require("./bible");
const MESSAGES = require("./messages");

const SECRET = process.env.SESSION_SECRET || process.env.REMINDER_SECRET || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
const VAPID = { pub: process.env.VAPID_PUBLIC_KEY || "", priv: process.env.VAPID_PRIVATE_KEY || "", subject: process.env.VAPID_SUBJECT || "" };
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "";
const RESEND_HOST = process.env.RESEND_API_HOST || "https://api.resend.com"; // tests point this at a stand-in
const UPSTASH = { url: (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, ""), token: process.env.UPSTASH_REDIS_REST_TOKEN || "" };
const SITE_NAME = process.env.SITE_NAME || "What Would Jesus Do";

const PUSH = Boolean(SECRET && VAPID.pub && VAPID.priv && VAPID.subject);
const EMAIL = Boolean(SECRET && RESEND_KEY && EMAIL_FROM);
if (PUSH) webpush.setVapidDetails(VAPID.subject, VAPID.pub, VAPID.priv);

const HOURS = [7, 8, 12, 18, 20, 21];
const SEND_WINDOW = 3; // hours after the chosen time we still send, in case the scheduler runs late
const UNCONFIRMED_TTL = 7 * 24 * 3600 * 1000;

// ---------- storage ----------
const KEY = "wwjd:reminders";
const store = UPSTASH.url && UPSTASH.token ? upstashStore() : fileStore(process.env.REMINDERS_FILE || path.join(__dirname, "reminders-data.json"));

function upstashStore() {
  const call = async (...cmd) => {
    const r = await fetch(UPSTASH.url, { method: "POST", headers: { Authorization: `Bearer ${UPSTASH.token}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(`Upstash: ${d.error || r.status}`);
    return d.result;
  };
  return {
    kind: "upstash",
    async get(id) { const v = await call("HGET", KEY, id); return v ? JSON.parse(v) : null; },
    async put(rec) { await call("HSET", KEY, rec.id, JSON.stringify(rec)); },
    async del(id) { await call("HDEL", KEY, id); },
    async all() { const flat = (await call("HGETALL", KEY)) || []; const out = []; for (let i = 1; i < flat.length; i += 2) out.push(JSON.parse(flat[i])); return out; },
  };
}
function fileStore(file) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const save = () => fs.promises.writeFile(file, JSON.stringify(data));
  return {
    kind: "file",
    async get(id) { return data[id] || null; },
    async put(rec) { data[rec.id] = rec; await save(); },
    async del(id) { delete data[id]; await save(); },
    async all() { return Object.values(data); },
  };
}

// ---------- helpers ----------
const hmac = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
const idFor = (kind, key) => `${kind}_${hmac(`${kind}:${key}`).slice(0, 22)}`;
const tokenFor = (id) => `${id}.${hmac(`tok:${id}`).slice(0, 22)}`;
function readToken(t) {
  if (!SECRET || typeof t !== "string") return null;
  const [id, sig] = t.trim().split(".");
  if (!id || !sig) return null;
  const good = hmac(`tok:${id}`).slice(0, 22);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good)) ? id : null;
}
const validTz = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
function prefs(body) {
  const hour = Number(body?.hour);
  return {
    tz: typeof body?.tz === "string" && body.tz.length < 64 && validTz(body.tz) ? body.tz : "America/New_York",
    hour: HOURS.includes(hour) ? hour : 8,
    freq: body?.freq === "weekly" ? "weekly" : "daily",
  };
}
function localNow(tz, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short" })
    .formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday };
}
function due(rec, now = new Date()) {
  if (rec.kind === "email" && !rec.confirmed) return false;
  const l = localNow(rec.tz, now);
  if (rec.lastSent === l.date) return false;
  if (rec.freq === "weekly" && l.weekday !== "Sun") return false;
  return l.hour >= rec.hour && l.hour < rec.hour + SEND_WINDOW;
}
/** Today's message, the same for everyone on a given date. */
function messageFor(date) {
  const day = Math.floor(Date.parse(date + "T00:00:00Z") / 86_400_000);
  const m = MESSAGES[((day % MESSAGES.length) + MESSAGES.length) % MESSAGES.length];
  const v = lookup(m.ref);
  return { text: m.text, verse: v ? { reference: v.reference, text: v.text } : null };
}
const baseUrl = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const log = (o) => console.log(JSON.stringify(o));

// ---------- senders ----------
async function sendPush(rec, payload) {
  try {
    await webpush.sendNotification(rec.sub, JSON.stringify(payload), { TTL: 12 * 3600, urgency: "normal" });
    return "sent";
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) { await store.del(rec.id); return "gone"; } // browser unsubscribed
    log({ event: "push_error", status: err.statusCode, message: String(err.body || err.message).slice(0, 200) });
    return "failed";
  }
}

async function sendEmail({ to, subject, html, text, unsubUrl }) {
  const headers = unsubUrl ? { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
  const r = await fetch(`${RESEND_HOST}/emails`, {
    method: "POST", headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, text, headers }),
  });
  if (!r.ok) { log({ event: "email_error", status: r.status, message: (await r.text()).slice(0, 200) }); return false; }
  return true;
}

function emailLayout(site, inner, footer) {
  return `<!doctype html><html><body style="margin:0;background:#faf7f2;font-family:Georgia,serif;color:#2a2622">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<p style="font:600 15px Georgia,serif;color:#8a5a2b;margin:0 0 18px">&#10013; ${esc(SITE_NAME)}</p>
<div style="background:#fff;border:1px solid #e7dfd3;border-radius:16px;padding:22px">${inner}</div>
<p style="font:12px/1.5 Arial,sans-serif;color:#6f675e;margin-top:18px">${footer}</p>
</div></body></html>`;
}

function checkInEmail(site, msg, unsubUrl) {
  const verse = msg.verse ? `<div style="border-left:4px solid #8a5a2b;padding:6px 14px;margin:18px 0 6px"><p style="font:italic 16px/1.6 Georgia,serif;margin:0">&ldquo;${esc(msg.verse.text)}&rdquo;</p><p style="font:600 13px Arial,sans-serif;color:#8a5a2b;margin:6px 0 0">${esc(msg.verse.reference)} (KJV)</p></div>` : "";
  const html = emailLayout(site,
    `<p style="font:18px/1.6 Georgia,serif;margin:0">${esc(msg.text)}</p>${verse}
<p style="margin:22px 0 4px"><a href="${site}/" style="background:#8a5a2b;color:#fff;text-decoration:none;border-radius:10px;padding:10px 18px;font:600 15px Arial,sans-serif;display:inline-block">Talk with Jesus</a></p>`,
    `Written in the voice of Jesus, grounded in Scripture. You're getting this because you asked for check-in reminders at ${esc(site)}.<br><a href="${unsubUrl}" style="color:#6f675e">Unsubscribe</a> &middot; <a href="${site}/reminders" style="color:#6f675e">Change how often</a>`);
  const text = `${msg.text}\n\n${msg.verse ? `"${msg.verse.text}" ${msg.verse.reference} (KJV)\n\n` : ""}Talk with Jesus: ${site}/\n\nWritten in the voice of Jesus, grounded in Scripture.\nUnsubscribe: ${unsubUrl}`;
  return { subject: "I'm always in your heart", html, text };
}

const describe = (p) => `${p.freq === "weekly" ? "every Sunday" : "every day"} around ${p.hour === 12 ? "noon" : p.hour < 12 ? `${p.hour} am` : `${p.hour - 12} pm`}`;

// ---------- the send run ----------
async function runSend(site, now = new Date()) {
  const counts = { checked: 0, sent: 0, failed: 0, removed: 0 };
  for (const rec of await store.all()) {
    counts.checked++;
    if (rec.kind === "email" && !rec.confirmed && now - rec.created > UNCONFIRMED_TTL) { await store.del(rec.id); counts.removed++; continue; }
    if (!due(rec, now)) continue;
    const l = localNow(rec.tz, now);
    const msg = messageFor(l.date);
    let ok;
    if (rec.kind === "push" && PUSH) {
      const r = await sendPush(rec, { title: "A word for you today", body: msg.text, url: "/?from=reminder" });
      if (r === "gone") { counts.removed++; continue; }
      ok = r === "sent";
    } else if (rec.kind === "email" && EMAIL) {
      ok = await sendEmail({ to: rec.email, unsubUrl: `${site}/api/reminders/unsubscribe?t=${tokenFor(rec.id)}`, ...checkInEmail(site, msg, `${site}/reminders?stop=${tokenFor(rec.id)}`) });
    } else continue;
    if (ok) { rec.lastSent = l.date; await store.put(rec); counts.sent++; } else counts.failed++;
  }
  log({ event: "reminders_run", ...counts });
  return counts;
}

// ---------- routes ----------
function routes(app) {
  if (store.kind === "file" && process.env.RENDER) console.warn("Reminders are using a local file, which Render wipes on restart. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  const signupLimit = rateLimit({ windowMs: 3600_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many tries. Please wait a little and try again." } });

  app.get("/api/reminders/config", (_req, res) => res.json({ push: PUSH, email: EMAIL, vapidPublicKey: PUSH ? VAPID.pub : null, hours: HOURS }));

  app.post("/api/reminders/push", signupLimit, async (req, res) => {
    if (!PUSH) return res.status(503).json({ error: "Notifications aren't available yet." });
    const sub = req.body?.subscription;
    if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 1000 || !sub.keys?.p256dh || !sub.keys?.auth)
      return res.status(400).json({ error: "That browser subscription didn't look right. Please try again." });
    const p = prefs(req.body);
    const id = idFor("push", sub.endpoint);
    const old = await store.get(id);
    const rec = { id, kind: "push", sub: { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } }, ...p, created: old?.created || Date.now(), lastSent: old?.lastSent || null };
    await store.put(rec);
    if (!old) await sendPush(rec, { title: "I'm always in your heart", body: `I'll check in with you ${describe(p)}. You can turn this off anytime.`, url: "/" });
    log({ event: "reminder_on", kind: "push", freq: p.freq });
    res.json({ ok: true, token: tokenFor(id), summary: describe(p) });
  });

  app.post("/api/reminders/email", signupLimit, async (req, res) => {
    if (!EMAIL) return res.status(503).json({ error: "Email reminders aren't available yet." });
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@<>",;]+@[^\s@<>",;]+\.[a-z]{2,}$/i.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
    const p = prefs(req.body);
    const id = idFor("email", email);
    const old = await store.get(id);
    const rec = { id, kind: "email", email, ...p, confirmed: Boolean(old?.confirmed), created: old?.created || Date.now(), lastSent: old?.lastSent || null };
    await store.put(rec);
    const site = baseUrl(req);
    if (rec.confirmed) return res.json({ ok: true, confirmed: true, token: tokenFor(id), summary: describe(p) });
    // Double opt-in: nothing is sent until they click the link, so no one can sign up someone else.
    const link = `${site}/api/reminders/confirm?t=${tokenFor(id)}`;
    const sent = await sendEmail({
      to: email, subject: "Please confirm your check-in reminders",
      html: emailLayout(site, `<p style="font:17px/1.6 Georgia,serif;margin:0 0 16px">Friend, you asked for a gentle check-in ${describe(p)}. Tap below to confirm, and I'll be in touch.</p>
<p style="margin:0"><a href="${link}" style="background:#8a5a2b;color:#fff;text-decoration:none;border-radius:10px;padding:10px 18px;font:600 15px Arial,sans-serif;display:inline-block">Yes, send me reminders</a></p>`,
        `If you didn't ask for this, just ignore this email and you won't hear from us. Written in the voice of Jesus for ${esc(site)}.`),
      text: `You asked for check-in reminders ${describe(p)} from ${SITE_NAME}. Confirm here: ${link}\n\nIf you didn't ask for this, ignore this email.`,
    });
    if (!sent) return res.status(502).json({ error: "Couldn't send the confirmation email. Please try again." });
    log({ event: "reminder_on", kind: "email", freq: p.freq, confirmed: false });
    res.json({ ok: true, confirmed: false, token: tokenFor(id), summary: describe(p) });
  });

  app.get("/api/reminders/confirm", async (req, res) => {
    const id = readToken(req.query.t);
    const rec = id && (await store.get(id));
    if (!rec) return res.redirect("/reminders?error=confirm");
    rec.confirmed = true;
    await store.put(rec);
    log({ event: "reminder_confirmed" });
    res.redirect(`/reminders?confirmed=1&t=${encodeURIComponent(tokenFor(id))}`);
  });

  app.post("/api/reminders/status", async (req, res) => {
    const id = readToken(req.body?.t);
    const rec = id && (await store.get(id));
    if (!rec) return res.json({ active: false });
    res.json({ active: true, kind: rec.kind, confirmed: rec.kind === "push" || rec.confirmed, summary: describe(rec), hour: rec.hour, freq: rec.freq });
  });

  // Unsubscribe from the page (JSON), from an email client's one-click button (RFC 8058 form post), or by push endpoint.
  app.post("/api/reminders/unsubscribe", express.urlencoded({ extended: false, limit: "2kb" }), async (req, res) => {
    let id = readToken(req.query.t || req.body?.t);
    if (!id && typeof req.body?.endpoint === "string" && SECRET) id = idFor("push", req.body.endpoint);
    if (id) await store.del(id);
    log({ event: "reminder_off" });
    res.json({ ok: true });
  });

  // Called hourly by the scheduler.
  app.post("/api/reminders/send", async (req, res) => {
    const auth = String(req.get("authorization") || "");
    const want = `Bearer ${CRON_SECRET}`;
    if (!CRON_SECRET || auth.length !== want.length || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(want))) return res.status(401).json({ error: "unauthorized" });
    try { res.json({ ok: true, ...(await runSend(baseUrl(req))) }); }
    catch (err) { log({ event: "reminders_error", message: err.message }); res.status(500).json({ ok: false, error: err.message }); }
  });
}

module.exports = { routes, runSend, PUSH, EMAIL, due, messageFor, localNow, store };
