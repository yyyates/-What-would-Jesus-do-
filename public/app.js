const f = document.getElementById("f"), q = document.getElementById("q"), b = document.getElementById("b"), out = document.getElementById("out");
const upsell = document.getElementById("upsell"), histBox = document.getElementById("hist"), histList = document.getElementById("histList");
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

let me = { premium: false, available: false };
let thread = []; // current conversation, for Premium follow-ups

fetch("/api/config").then(r => r.json()).then(cfg => {
  if (cfg.donateUrl) { document.getElementById("donateLink").href = cfg.donateUrl; document.getElementById("donate").style.display = "block"; }
}).catch(() => {});
fetch("/api/me").then(r => r.json()).then(m => {
  me = m;
  const a = document.getElementById("acct");
  if (!m.available && !m.premium) a.hidden = true;
  if (m.premium) { a.textContent = "★ Premium"; showHistory(); }
  upsell.querySelectorAll("[data-plan]").forEach(btn => { if (!m.plans?.[btn.dataset.plan]) btn.hidden = true; });
}).catch(() => {});

upsell.querySelectorAll("[data-plan]").forEach(btn => btn.onclick = () => checkout(btn.dataset.plan, btn));
async function checkout(plan, btn) {
  btn.disabled = true;
  try {
    const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
    const d = await r.json();
    if (d.url) location.href = d.url; else out.replaceChildren(el("p", "err", d.error || "Couldn't start checkout."));
  } finally { btn.disabled = false; }
}

document.querySelectorAll(".chip").forEach(c => c.onclick = () => { q.value = c.textContent; thread = []; q.focus(); });
q.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) f.requestSubmit(); });

function showHistory() {
  const items = store.get("wwjd_history", []);
  if (!me.premium || !items.length) { histBox.hidden = true; return; }
  histBox.hidden = false;
  histList.replaceChildren(...items.slice(0, 20).map(item => {
    const li = el("li", null, item.question);
    li.append(el("small", null, new Date(item.at).toLocaleDateString()));
    li.onclick = () => { q.value = item.question; thread = []; render(item.data, item.question); window.scrollTo({ top: 0, behavior: "smooth" }); };
    return li;
  }));
}

function render(d, question) {
  out.replaceChildren();
  if (d.crisis) out.append(el("div", "crisis", "You matter, and you don't have to face this alone. If you might hurt yourself or are in danger, please call or text 988 (US), call your local emergency number, or reach out to someone you trust right now."));
  const card = el("div", "answer-card");
  const head = el("div", "ahead");
  const av = el("img"); av.src = "/jesus.svg"; av.alt = "";
  head.append(av, el("span", null, "Jesus"));
  card.append(head, el("div", "answer", d.answer), el("p", "aifoot", "AI-written in the voice of Jesus, based on Scripture"));
  out.append(card);
  for (const v of d.verses) {
    const box = el("div", "verse");
    box.append(el("div", "ref", v.reference + " (" + d.translation + ")"), el("p", "vt", v.text), el("div", "why", v.why));
    out.append(box);
  }
  const meta = el("div", "meta");
  meta.append(el("span", null, d.premium ? "★ Premium" : d.remaining > 0 ? `${d.remaining} free question${d.remaining === 1 ? "" : "s"} left today` : "That was your last free question for today"));
  const share = el("button", "ghost", "Copy answer");
  share.type = "button";
  share.onclick = async () => {
    const text = `${question}\n\n${d.answer}\n\n${d.verses.map(v => `${v.reference} (KJV): ${v.text}`).join("\n\n")}\n\n${location.origin}`;
    try { await navigator.clipboard.writeText(text); share.textContent = "Copied"; } catch { share.textContent = "Couldn't copy"; }
  };
  meta.append(share);
  out.append(meta);
  if (d.premium) {
    const fu = el("p", "followup why", "Want to go deeper? Type a follow-up question above and it will build on this answer. ");
    const fresh = el("button", "ghost", "Start a new question");
    fresh.type = "button";
    fresh.onclick = () => { thread = []; q.value = ""; out.replaceChildren(); q.focus(); };
    fu.append(fresh);
    out.append(fu);
  }
  upsell.hidden = d.premium || !me.available || d.remaining > 0;
}

f.onsubmit = async e => {
  e.preventDefault();
  b.disabled = true;
  document.body.classList.add("thinking");
  const question = q.value.trim();
  out.replaceChildren(el("p", "dots", "Searching the Scriptures"));
  try {
    const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history: thread }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      out.replaceChildren(el("p", "err", d.error || "Something went wrong. Please try again."));
      upsell.hidden = !(d.limit && d.premium);
      return;
    }
    render(d, question);
    if (d.premium) {
      thread = [...thread, { q: question, a: d.answer }].slice(-3);
      q.value = "";
      q.placeholder = "Ask a follow-up…";
      const items = store.get("wwjd_history", []);
      store.set("wwjd_history", [{ question, data: d, at: Date.now() }, ...items].slice(0, 50));
      showHistory();
    }
  } catch {
    out.replaceChildren(el("p", "err", "Couldn't reach the server. Please check your connection and try again."));
  } finally {
    b.disabled = false;
    document.body.classList.remove("thinking");
  }
};
