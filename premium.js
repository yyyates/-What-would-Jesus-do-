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
    res.json({ available: ENABLED, premium: Boolean(id), code: id ? makeCode(id) : null,
      plans: { monthly: Boolean(PRICES.monthly), yearly: Boolean(PRICES.yearly) } });
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

module.exports = { routes, premiumCustomer, ENABLED, makeCode, readCode };
