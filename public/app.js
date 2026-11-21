const f = document.getElementById("f"), q = document.getElementById("q"), b = document.getElementById("b"), out = document.getElementById("out");
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

fetch("/api/config").then(r => r.json()).then(cfg => {
  if (cfg.donateUrl) { document.getElementById("donateLink").href = cfg.donateUrl; document.getElementById("donate").style.display = "block"; }
}).catch(() => {});

document.querySelectorAll(".chip").forEach(c => c.onclick = () => { q.value = c.textContent; q.focus(); });
q.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) f.requestSubmit(); });

function render(d) {
  out.replaceChildren();
  if (d.crisis) out.append(el("div", "crisis", "You matter, and you don't have to face this alone. If you might hurt yourself or are in danger, please call or text 988 (US), call your local emergency number, or reach out to someone you trust right now."));
  out.append(el("div", "answer", d.answer));
  for (const v of d.verses) {
    const box = el("div", "verse");
    box.append(el("div", "ref", v.reference + " (" + d.translation + ")"), el("p", "vt", v.text), el("div", "why", v.why));
    out.append(box);
  }
  const meta = el("div", "meta");
  meta.append(el("span", null, d.remaining > 0 ? `${d.remaining} free question${d.remaining === 1 ? "" : "s"} left today` : "That was your last free question for today"));
  const share = el("button", "ghost", "Copy answer");
  share.type = "button";
  share.onclick = async () => {
    const text = `${q.value}\n\n${d.answer}\n\n${d.verses.map(v => `${v.reference} (KJV): ${v.text}`).join("\n\n")}\n\n${location.origin}`;
    try { await navigator.clipboard.writeText(text); share.textContent = "Copied"; } catch { share.textContent = "Couldn't copy"; }
  };
  meta.append(share);
  out.append(meta);
}

f.onsubmit = async e => {
  e.preventDefault();
  b.disabled = true;
  out.replaceChildren(el("p", "dots", "Searching the Scriptures"));
  try {
    const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q.value }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { out.replaceChildren(el("p", "err", d.error || "Something went wrong. Please try again.")); return; }
    render(d);
  } catch {
    out.replaceChildren(el("p", "err", "Couldn't reach the server. Please check your connection and try again."));
  } finally {
    b.disabled = false;
  }
};
