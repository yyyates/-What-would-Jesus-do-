// A little lamb friend who wanders along the bottom of the page and cheers you on.
(() => {
  const MESSAGES = [
    "You are so loved! 💛",
    "Ewe can do this! 🐑",
    "Fear not, friend!",
    "God's got you 🙏",
    "You're doing great!",
    "Take a deep breath 🌿",
    "Don't worry, be lamb-py!",
    "You matter so much ✨",
    "Today is a gift 🎁",
    "Baa-lieve in yourself!",
    "Be kind to yourself 💕",
    "You're never alone 🤍",
  ];
  const WAITING = ["Jesus is thinking… 💭", "Hang tight, friend!", "Good things take a moment ✨"];

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const W = 76;

  const pal = document.createElement("button");
  pal.type = "button";
  pal.className = "lambpal";
  pal.setAttribute("aria-label", "Lamb friend: tap for an encouraging message");
  pal.innerHTML = `
    <svg viewBox="0 0 100 84" aria-hidden="true">
      <g class="legs" fill="#6b5a4e">
        <rect class="leg a" x="30" y="58" width="7" height="20" rx="3.5"/>
        <rect class="leg b" x="44" y="60" width="7" height="18" rx="3.5"/>
        <rect class="leg a" x="60" y="60" width="7" height="18" rx="3.5"/>
        <rect class="leg b" x="72" y="58" width="7" height="20" rx="3.5"/>
      </g>
      <g class="body">
        <g fill="#fffdf9" stroke="#e6ddd0" stroke-width="2">
          <circle cx="36" cy="46" r="15"/><circle cx="52" cy="38" r="16"/><circle cx="68" cy="42" r="15"/><circle cx="78" cy="52" r="12"/>
          <circle cx="62" cy="58" r="13"/><circle cx="44" cy="58" r="13"/><circle cx="30" cy="56" r="11"/>
        </g>
        <ellipse cx="55" cy="50" rx="24" ry="13" fill="#fffdf9"/>
        <circle class="tail" cx="88" cy="44" r="6" fill="#fffdf9" stroke="#e6ddd0" stroke-width="2"/>
        <g class="head">
          <ellipse cx="9" cy="38" rx="7" ry="4" transform="rotate(-25 9 38)" fill="#7a685b"/>
          <ellipse cx="41" cy="34" rx="7" ry="4" transform="rotate(25 41 34)" fill="#7a685b"/>
          <ellipse cx="25" cy="40" rx="14" ry="15" fill="#7a685b"/>
          <g fill="#fffdf9" stroke="#e6ddd0" stroke-width="2"><circle cx="18" cy="26" r="6"/><circle cx="25" cy="23" r="7"/><circle cx="32" cy="26" r="6"/></g>
          <ellipse cx="19.5" cy="40" rx="3" ry="3.6" fill="#2b1d14"/><ellipse cx="30.5" cy="40" rx="3" ry="3.6" fill="#2b1d14"/>
          <circle cx="20.6" cy="38.6" r="1.2" fill="#fff"/><circle cx="31.6" cy="38.6" r="1.2" fill="#fff"/>
          <ellipse cx="15" cy="46" rx="3.2" ry="2" fill="#f3958a" opacity=".7"/><ellipse cx="35" cy="46" rx="3.2" ry="2" fill="#f3958a" opacity=".7"/>
          <path class="mouth" d="M22 48 Q25 51 28 48" fill="none" stroke="#2b1d14" stroke-width="1.6" stroke-linecap="round"/>
        </g>
      </g>
    </svg>`;
  const say = document.createElement("div");
  say.className = "lambsay";
  say.setAttribute("role", "status");
  say.setAttribute("aria-live", "polite");
  document.body.append(pal, say);

  let x = 12, facingRight = true, sayTimer = 0, nextTimer = 0, last = -1;
  const maxX = () => Math.max(12, innerWidth - W - 12);

  function place() {
    pal.style.transform = `translateX(${x}px)`;
    pal.classList.toggle("right", facingRight);
    positionBubble();
  }
  function positionBubble() {
    const bw = say.offsetWidth || 180;
    let left = x + W / 2 - bw / 2;
    left = Math.min(Math.max(8, left), innerWidth - bw - 8);
    say.style.left = left + "px";
    say.style.setProperty("--tail", Math.min(Math.max(16, x + W / 2 - left), bw - 16) + "px");
  }

  function pick(list) {
    let i;
    do { i = Math.floor(Math.random() * list.length); } while (list.length > 1 && i === last);
    last = i;
    return list[i];
  }

  function speak(text, ms = 3600) {
    say.textContent = text;
    say.classList.add("show");
    positionBubble();
    pal.classList.remove("happy"); void pal.offsetWidth; pal.classList.add("happy");
    hearts();
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => say.classList.remove("show"), ms);
  }

  function hearts() {
    if (reduce) return;
    for (let i = 0; i < 3; i++) {
      const h = document.createElement("span");
      h.className = "lambheart";
      h.textContent = ["💛", "💕", "✨"][i];
      h.style.left = (x + 18 + i * 16) + "px";
      h.style.animationDelay = (i * 0.15) + "s";
      document.body.append(h);
      setTimeout(() => h.remove(), 1800);
    }
  }

  function wander() {
    clearTimeout(nextTimer);
    if (reduce || document.hidden) { nextTimer = setTimeout(wander, 4000); return; }
    const target = 12 + Math.random() * (maxX() - 12);
    const dist = Math.abs(target - x);
    if (dist < 40) { rest(); return; }
    facingRight = target > x;
    const secs = dist / 55;
    pal.classList.add("walking");
    pal.style.transitionDuration = secs + "s";
    x = target;
    place();
    nextTimer = setTimeout(() => {
      pal.classList.remove("walking");
      pal.style.transitionDuration = "0s";
      if (Math.random() < 0.6) speak(pick(MESSAGES));
      rest();
    }, secs * 1000);
  }
  function rest() { nextTimer = setTimeout(wander, 2500 + Math.random() * 3500); }

  pal.addEventListener("click", () => speak(pick(MESSAGES)));

  // Cheer while an answer is loading.
  new MutationObserver(() => {
    if (document.body.classList.contains("thinking")) speak(pick(WAITING), 3000);
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  // Step aside while someone is typing on a small screen.
  const q = document.getElementById("q");
  if (q) {
    q.addEventListener("focus", () => document.body.classList.add("typing"));
    q.addEventListener("blur", () => document.body.classList.remove("typing"));
  }

  addEventListener("resize", () => { x = Math.min(x, maxX()); pal.style.transitionDuration = "0s"; place(); });

  place();
  setTimeout(() => speak("Hi friend! You are loved 💛", 4200), 1200);
  if (reduce) setInterval(() => speak(pick(MESSAGES)), 15000);
  else nextTimer = setTimeout(wander, 3000);
})();
