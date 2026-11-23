// Premium subscriptions with Stripe, without passwords or a database.
// After checkout the visitor gets a signed "premium code" (also stored as a cookie).
// The code names their Stripe customer; Stripe stays the source of truth for whether
// the subscription is active, so cancelling in Stripe ends Premium automatically.
const crypto = require("crypto");
const Stripe = require("stripe");

const SECRET = process.env.SESSION_SECRET || "";
const KEY = process.env.STRIPE_SECRET_KEY || "";
const PRICES = { monthly: process.env.STRIPE_PRICE_MONTHLY || "", yearly: process.env.STRIPE_PRICE_YEARLY || "" };
const ENABLED = Boolean(KEY && SECRET && (PRICES.monthly || PRICES.yearly));
const TEST_MODE = /^(sk|rk)_test_/.test(KEY);
const COOKIE = "wwjd_premium";
const ACTIVE = new Set(["active", "trialing", "past_due"]);

// STRIPE_API_HOST lets tests point the SDK at a local stand-in.
const hostOpts = process.env.STRIPE_API_HOST ? (() => { const u = new URL(process.env.STRIPE_API_HOST); return { host: u.hostname, port: Number(u.port), protocol: u.protocol.replace(":", "") }; })() : {};
const stripe = ENABLED ? new Stripe(KEY, { maxNetworkRetries: 2, timeout: 20_000, ...hostOpts }) : null;

const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (data) => crypto.createHmac("sha256", SECRET).update(data).digest("base64url").slice(0, 32);

function makeCode(customerId) {
  const body = b64(customerId);
  return `${body}.${sign(body)}`;
}
function readCode(code) {
  if (!SECRET || typeof code !== "string") return null;
  const [body, sig] = code.trim().split(".");
  if (!body || !sig) return null;
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  const id = Buffer.from(body, "base64url").toString();
  return /^cus_[A-Za-z0-9]+$/.test(id) ? id : null;
}

const cache = new Map(); // customerId -> {active, at}
async function isActive(customerId) {
  const hit = cache.get(customerId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.active;
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  const active = subs.data.some((s) => ACTIVE.has(s.status));
  cache.set(customerId, { active, at: Date.now() });
  return active;
}

/** Returns the Stripe customer id if this request carries an active Premium code, else null. */
async function premiumCustomer(req) {
  if (!ENABLED) return null;
  const id = readCode(req.cookies?.[COOKIE]);
  if (!id) return null;
  try { return (await isActive(id)) ? id : null; }
  catch (err) { console.error(JSON.stringify({ event: "stripe_error", message: err.message })); return cache.get(id)?.active ? id : null; }
}

function setCookie(res, req, customerId) {
  res.cookie(COOKIE, makeCode(customerId), {
    httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 365 * 24 * 3600 * 1000, path: "/",
  });
}

// Button labels come from the real Stripe prices, so the site always shows what Stripe will charge.
let planCache = { at: 0, plans: null };
const money = (cents, cur) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
function describe(price) {
  const r = price.recurring;
  if (!r) return { problem: "This price is one-time. Premium needs a recurring price." };
  if (!price.active) return { problem: "This price is archived in Stripe." };
  const every = r.interval_count > 1 ? `${r.interval_count} ${r.interval}s` : r.interval;
  return { label: `${money(price.unit_amount, price.currency)} / ${every}`, cents: price.unit_amount, interval: r.interval, count: r.interval_count };
}
async function loadPlans() {
  const fine = planCache.plans && Object.values(planCache.plans).every((p) => !p || p.label);
  if (planCache.plans && Date.now() - planCache.at < (fine ? 60 * 60_000 : 60_000)) return planCache.plans;
  const plans = {};
  for (const [name, id] of Object.entries(PRICES)) {
    if (!id) { plans[name] = null; continue; }
    try { plans[name] = describe(await stripe.prices.retrieve(id)); }
    catch (err) {
      plans[name] = { problem: err.type === "StripeAuthenticationError" ? "Stripe didn't accept the secret key." :
        err.code === "resource_missing" ? `Stripe has no price with this ID in ${TEST_MODE ? "test" : "live"} mode. Test and live mode have different price IDs.` : err.message };
    }
  }
  const m = plans.monthly, y = plans.yearly;
  if (m?.label && y?.label && m.interval === "month" && m.count === 1 && y.interval === "year" && y.count === 1) {
    const save = Math.round((1 - y.cents / (m.cents * 12)) * 100);
    if (save >= 5) y.label += ` (save ${save}%)`;
  }
  planCache = { at: Date.now(), plans };
  return plans;
}
const publicPlans = async () => {
  let plans = {};
  try { plans = await loadPlans(); } catch {}
  const out = {};
  for (const name of Object.keys(PRICES)) out[name] = PRICES[name] ? { label: plans[name]?.label || null } : false;
  return out;
};

const baseUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;

function routes(app) {
  app.post("/api/checkout", async (req, res) => {
    if (!ENABLED) return res.status(503).json({ error: "Premium isn't available yet." });
    const plan = req.body?.plan === "yearly" && PRICES.yearly ? "yearly" : PRICES.monthly ? "monthly" : "yearly";
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: PRICES[plan], quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${baseUrl(req)}/api/premium/activate?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl(req)}/account`,
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error(JSON.stringify({ event: "stripe_error", where: "checkout", message: err.message }));
      res.status(502).json({ error: "Couldn't start checkout. Please try again." });
    }
  });

  // Stripe sends the buyer back here after paying.
  app.get("/api/premium/activate", async (req, res) => {
    if (!ENABLED) return res.redirect("/account");
    try {
      const session = await stripe.checkout.sessions.retrieve(String(req.query.session_id || ""));
      if (session.status === "complete" && typeof session.customer === "string") {
        cache.delete(session.customer);
        setCookie(res, req, session.customer);
        return res.redirect("/account?welcome=1");
      }
    } catch (err) {
      console.error(JSON.stringify({ event: "stripe_error", where: "activate", message: err.message }));
    }
    res.redirect("/account?error=activate");
  });

  app.get("/api/me", async (req, res) => {
    const id = await premiumCustomer(req);
    res.json({ available: ENABLED, premium: Boolean(id), code: id ? makeCode(id) : null, testMode: ENABLED && TEST_MODE,
      plans: ENABLED ? await publicPlans() : { monthly: false, yearly: false } });
  });

  // Setup check: open /api/premium/check to see whether Stripe is set up right. Never shows keys.
  let lastCheck = 0;
  app.get("/api/premium/check", async (_req, res) => {
    const missing = [["STRIPE_SECRET_KEY", KEY], ["SESSION_SECRET", SECRET]].filter(([, v]) => !v).map(([k]) => k);
    if (!PRICES.monthly && !PRICES.yearly) missing.push("STRIPE_PRICE_MONTHLY or STRIPE_PRICE_YEARLY");
    if (missing.length) return res.json({ ok: false, premium: "hidden", problem: `Missing in Render's Environment tab: ${missing.join(", ")}.` });
    if (KEY.startsWith("pk_")) return res.json({ ok: false, problem: "STRIPE_SECRET_KEY holds the publishable key (pk_). Use the secret key (sk_) instead." });
    if (Date.now() - lastCheck < 30_000) return res.json({ ok: null, note: "Checked a moment ago. Try again in 30 seconds." });
    lastCheck = Date.now();
    planCache.at = 0;
    const plans = await loadPlans();
    let portal = "unknown";
    try { portal = (await stripe.billingPortal.configurations.list({ limit: 1 })).data.length ? "activated" : "not activated yet (Settings > Billing > Customer portal)"; } catch {}
    const ok = Object.values(plans).every((p) => !p || p.label) && Object.values(plans).some((p) => p?.label);
    res.json({ ok, mode: TEST_MODE ? "test (no real charges)" : "live (real charges)",
      monthly: plans.monthly ? plans.monthly.label || plans.monthly.problem : "not set",
      yearly: plans.yearly ? plans.yearly.label || plans.yearly.problem : "not set",
      customerPortal: portal });
  });

  // Use a Premium code on another phone or computer.
  app.post("/api/restore", async (req, res) => {
    const id = ENABLED && readCode(req.body?.code);
    if (!id) return res.status(400).json({ error: "That code doesn't look right. Please check it and try again." });
    try {
      cache.delete(id);
      if (!(await isActive(id))) return res.status(402).json({ error: "That subscription isn't active anymore." });
    } catch {
      return res.status(502).json({ error: "Couldn't check that code right now. Please try again." });
    }
    setCookie(res, req, id);
    res.json({ ok: true });
  });

  // Stripe-hosted page to update the card, switch plans, or cancel.
  app.post("/api/portal", async (req, res) => {
    const id = ENABLED && readCode(req.cookies?.[COOKIE]);
    if (!id) return res.status(401).json({ error: "This device isn't signed in to Premium." });
    try {
      const portal = await stripe.billingPortal.sessions.create({ customer: id, return_url: `${baseUrl(req)}/account` });
      res.json({ url: portal.url });
    } catch (err) {
      console.error(JSON.stringify({ event: "stripe_error", where: "portal", message: err.message }));
      res.status(502).json({ error: "Couldn't open subscription settings. Please try again." });
    }
  });

  app.post("/api/signout", (req, res) => { res.clearCookie(COOKIE, { path: "/" }); res.json({ ok: true }); });
}

module.exports = { routes, premiumCustomer, ENABLED, TEST_MODE, makeCode, readCode };
