const $ = (id) => document.getElementById(id);
const msg = (text, cls) => { const m = $("msg"); m.textContent = text; m.className = cls || ""; m.hidden = false; m.scrollIntoView({ behavior: "smooth", block: "center" }); };
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }).then(async r => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const params = new URLSearchParams(location.search);
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
const prefs = () => ({ tz, hour: Number($("hour").value), freq: $("freq").value });
$("tzNote").textContent = `Times are in your time zone (${tz.replace(/_/g, " ")}).`;

// Arriving from the unsubscribe link in an email.
if (params.get("stop")) {
  $("stop").hidden = false; $("setup").hidden = true;
  $("stopBtn").onclick = async () => {
    $("stopBtn").disabled = true;
    await post("/api/reminders/unsubscribe", { t: params.get("stop") });
    $("stop").hidden = true; $("setup").hidden = false;
    msg("Done. You won't get any more reminders. I'm still always in your heart.", "ok");
  };
}
if (params.get("confirmed")) msg("You're all set. Watch for your first check-in.", "ok");
if (params.get("error") === "confirm") msg("That confirmation link didn't work. Please sign up again below.", "err");

const urlKey = (b64) => { const s = (b64 + "=".repeat((4 - b64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let cfg = {};

fetch("/api/reminders/config").then(r => r.json()).then(async c => {
  cfg = c;
  if (!c.push && !c.email) { $("none").hidden = false; return; }
  if (c.email) $("emailBox").hidden = false;
  if (c.push) {
    $("pushBox").hidden = false;
    if (!pushSupported) {
      $("pushOn").hidden = true;
      if (isIOS) $("iosNote").hidden = false; else $("pushText").textContent = "This browser doesn't support notifications. Try email instead.";
      return;
    }
    const reg = await navigator.serviceWorker.register("/sw.js");
    const sub = await reg.pushManager.getSubscription();
    if (sub) showPushOn();
  }
}).catch(() => {});

// Show the saved schedule if this device already signed up.
const saved = store.get("wwjd_reminder_token") || params.get("t");
if (saved) post("/api/reminders/status", { t: saved }).then(({ d }) => {
  if (!d.active) return;
  store.set("wwjd_reminder_token", saved);
  $("hour").value = String(d.hour); $("freq").value = d.freq;
});

function showPushOn(summary) {
  $("pushOn").textContent = "Update time"; $("pushOff").hidden = false;
  $("pushText").textContent = summary ? `Notifications are on: ${summary}.` : "Notifications are on for this device.";
}

$("pushOn").onclick = async () => {
  const btn = $("pushOn"); btn.disabled = true;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return msg("Notifications are blocked for this site. You can allow them in your browser settings, or use email instead.", "err");
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(cfg.vapidPublicKey) });
    const { ok, d } = await post("/api/reminders/push", { subscription: sub.toJSON(), ...prefs() });
    if (!ok) return msg(d.error || "Couldn't turn on notifications. Please try again.", "err");
    store.set("wwjd_reminder_token", d.token);
    showPushOn(d.summary);
    msg(`Notifications are on. I'll check in ${d.summary}.`, "ok");
  } catch { msg("Couldn't turn on notifications in this browser. Please try again, or use email.", "err"); }
  finally { btn.disabled = false; }
};

$("pushOff").onclick = async () => {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await post("/api/reminders/unsubscribe", { endpoint: sub.endpoint }); await sub.unsubscribe(); }
  store.set("wwjd_reminder_token", null);
  $("pushOn").textContent = "Turn on notifications"; $("pushOff").hidden = true;
  $("pushText").textContent = "Get a notification, like a text from a friend.";
  msg("Notifications are off on this device.", "ok");
};

$("ef").onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.submitter || $("ef").querySelector("button"); btn.disabled = true;
  try {
    const { ok, d } = await post("/api/reminders/email", { email: $("email").value, ...prefs() });
    if (!ok) return msg(d.error || "Couldn't sign you up. Please try again.", "err");
    store.set("wwjd_reminder_token", d.token);
    msg(d.confirmed ? `Updated. I'll email you ${d.summary}.` : "Almost done! Check your inbox and tap the link to confirm.", "ok");
    $("email").value = "";
  } finally { btn.disabled = false; }
};
