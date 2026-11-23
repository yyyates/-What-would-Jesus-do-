const $ = (id) => document.getElementById(id);
const msg = (text, cls) => { const m = $("msg"); m.textContent = text; m.className = cls || ""; m.hidden = false; };
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }).then(async r => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));

const params = new URLSearchParams(location.search);
if (params.get("welcome")) msg("Welcome to Premium! Your subscription is active.", "ok");
if (params.get("error")) msg("We couldn't confirm your payment yet. If you were charged, refresh this page in a minute or contact us.", "err");

fetch("/api/me").then(r => r.json()).then(m => {
  if (m.testMode) $("testmode").hidden = false;
  if (m.premium) {
    $("member").hidden = false;
    $("code").textContent = m.code;
  } else if (m.available) {
    $("join").hidden = false;
    $("restore").hidden = false;
    document.querySelectorAll("[data-plan]").forEach(b => { const p = m.plans[b.dataset.plan]; if (!p) b.hidden = true; else if (p.label) b.textContent = p.label; });
  } else {
    $("soon").hidden = false;
  }
});

document.querySelectorAll("[data-plan]").forEach(btn => btn.onclick = async () => {
  btn.disabled = true;
  const { d } = await post("/api/checkout", { plan: btn.dataset.plan });
  if (d.url) location.href = d.url; else { msg(d.error || "Couldn't start checkout.", "err"); btn.disabled = false; }
});
$("copy").onclick = async () => { try { await navigator.clipboard.writeText($("code").textContent); $("copy").textContent = "Copied"; } catch {} };
$("portal").onclick = async () => {
  const { d } = await post("/api/portal");
  if (d.url) location.href = d.url; else msg(d.error || "Couldn't open subscription settings.", "err");
};
$("signout").onclick = async () => { await post("/api/signout"); location.reload(); };
$("rf").onsubmit = async (e) => {
  e.preventDefault();
  const { ok, d } = await post("/api/restore", { code: $("rc").value });
  if (ok) location.replace("/account?welcome=1"); else msg(d.error || "Couldn't restore Premium.", "err");
};
