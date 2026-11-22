const f = document.getElementById("f"), q = document.getElementById("q"), b = document.getElementById("b"), out = document.getElementById("out");
const upsell = document.getElementById("upsell"), histBox = document.getElementById("hist"), histList = document.getElementById("histList");
const newChat = document.getElementById("newchat");
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

let me = { premium: false, available: false };
let thread = [];      // [{q, a}] sent as context for follow-ups
let turns = [];       // [{question, data}] for display and saving
let chatId = null;
let remindersOn = false;
const invite = document.getElementById("invite");
document.getElementById("inviteNo").onclick = () => { invite.hidden = true; store.set("wwjd_invite_seen", true); };

fetch("/api/config").then(r => r.json()).then(cfg => {
  remindersOn = Boolean(cfg.reminders);
  if (remindersOn) document.getElementById("remind").hidden = false;
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
    if (d.url) location.href = d.url; else out.append(el("p", "err", d.error || "Couldn't start checkout."));
  } finally { btn.disabled = false; }
}

document.querySelectorAll(".chip").forEach(c => c.onclick = () => { q.value = c.textContent; f.requestSubmit(); });
q.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer:coarse)").matches) { e.preventDefault(); f.requestSubmit(); } });
newChat.onclick = () => reset();

function reset() {
  thread = []; turns = []; chatId = null;
  out.replaceChildren(); upsell.hidden = true; invite.hidden = true; newChat.hidden = true;
  document.body.classList.remove("chatting");
  q.placeholder = "Ask Jesus anything…"; q.value = ""; q.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHistory() {
  const chats = store.get("wwjd_chats", []);
  if (!me.premium || !chats.length) { histBox.hidden = true; return; }
  histBox.hidden = false;
  histList.replaceChildren(...chats.slice(0, 20).map(c => {
    const li = el("li", null, c.turns[0].question);
    li.append(el("small", null, `${new Date(c.at).toLocaleDateString()} · ${c.turns.length} message${c.turns.length === 1 ? "" : "s"}`));
    li.onclick = () => {
      reset(); chatId = c.id; turns = c.turns.slice();
      thread = turns.map(t => ({ q: t.question, a: t.data.answer })).slice(-6);
      document.body.classList.add("chatting"); newChat.hidden = false;
      turns.forEach(t => { out.append(el("div", "me", t.question)); out.append(answerEl(t.data, t.question)); });
      q.placeholder = "Reply…";
    };
    return li;
  }));
}

function answerEl(d, question) {
  const wrap = el("div", "turn");
  if (d.crisis) wrap.append(el("div", "crisis", "You matter, and you don't have to face this alone. If you might hurt yourself or are in danger, please call or text 988 (US), call your local emergency number, or reach out to someone you trust right now."));
  const card = el("div", "answer-card");
  const head = el("div", "ahead");
  const av = el("img"); av.src = "/jesus.svg"; av.alt = "";
  head.append(av, el("span", null, "Jesus"));
  card.append(head, el("div", "answer", d.answer), el("p", "aifoot", "AI-written in the voice of Jesus, based on Scripture"));
  wrap.append(card);
  for (const v of d.verses) {
    const box = el("div", "verse");
    box.append(el("div", "ref", v.reference + " (" + d.translation + ")"), el("p", "vt", v.text), el("div", "why", v.why));
    wrap.append(box);
  }
  const meta = el("div", "meta");
  meta.append(el("span", null, d.premium ? "★ Premium" : d.remaining > 0 ? `${d.remaining} free message${d.remaining === 1 ? "" : "s"} left today` : d.remaining === 0 ? "That was your last free message for today" : ""));
  const share = el("button", "ghost", "Copy");
  share.type = "button";
  share.onclick = async () => {
    const text = `${question}\n\n${d.answer}\n\n${d.verses.map(v => `${v.reference} (KJV): ${v.text}`).join("\n\n")}\n\n${location.origin}`;
    try { await navigator.clipboard.writeText(text); share.textContent = "Copied"; } catch { share.textContent = "Couldn't copy"; }
  };
  meta.append(share);
  wrap.append(meta);
  return wrap;
}

f.onsubmit = async e => {
  e.preventDefault();
  const question = q.value.trim();
  if (!question || b.disabled) return;
  b.disabled = true;
  document.body.classList.add("thinking", "chatting");
  newChat.hidden = false;
  out.append(el("div", "me", question));
  const wait = el("div", "mini");
  const av = el("img"); av.src = "/jesus.svg"; av.alt = "";
  wait.append(av, el("span", "dots", "Jesus is replying"));
  out.append(wait);
  wait.scrollIntoView({ behavior: "smooth", block: "center" });
  q.value = "";
  try {
    const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history: thread }) });
    const d = await r.json().catch(() => ({}));
    wait.remove();
    if (!r.ok) {
      out.append(el("p", "err", d.error || "Something went wrong. Please try again."));
      q.value = question;
      upsell.hidden = !(d.limit && d.premium);
      return;
    }
    const node = answerEl(d, question);
    out.append(node);
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    thread = [...thread, { q: question, a: d.answer }].slice(-6);
    turns.push({ question, data: d });
    q.placeholder = "Reply…";
    upsell.hidden = d.premium || !me.available || d.remaining > 0;
    // After their first answer, offer check-ins once (never again after "Not now" or signing up).
    if (remindersOn && upsell.hidden && !store.get("wwjd_invite_seen", false) && !store.get("wwjd_reminder_token", null)) { invite.hidden = false; store.set("wwjd_invite_seen", true); }
    if (d.premium) {
      const chats = store.get("wwjd_chats", []).filter(c => c.id !== chatId);
      chatId = chatId || String(Date.now());
      store.set("wwjd_chats", [{ id: chatId, turns, at: Date.now() }, ...chats].slice(0, 30));
      showHistory();
    }
  } catch {
    wait.remove();
    out.append(el("p", "err", "Couldn't reach the server. Please check your connection and try again."));
    q.value = question;
  } finally {
    b.disabled = false;
    document.body.classList.remove("thinking");
  }
};
