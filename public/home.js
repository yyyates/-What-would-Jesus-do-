// Exact KJV text, copied from data/kjv.json.
const VERSES = [
  ["Psalm 23:1","The LORD is my shepherd; I shall not want."],
  ["John 14:27","Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid."],
  ["Philippians 4:6","Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God."],
  ["Isaiah 41:10","Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness."],
  ["Matthew 6:34","Take therefore no thought for the morrow: for the morrow shall take thought for the things of itself. Sufficient unto the day is the evil thereof."],
  ["John 8:12","Then spake Jesus again unto them, saying, I am the light of the world: he that followeth me shall not walk in darkness, but shall have the light of life."],
  ["Proverbs 3:5","Trust in the LORD with all thine heart; and lean not unto thine own understanding."],
  ["Romans 8:28","And we know that all things work together for good to them that love God, to them who are the called according to his purpose."],
  ["Psalm 46:1","God is our refuge and strength, a very present help in trouble."],
  ["Lamentations 3:23","They are new every morning: great is thy faithfulness."],
  ["Joshua 1:9","Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest."],
  ["Matthew 5:9","Blessed are the peacemakers: for they shall be called the children of God."],
  ["John 15:12","This is my commandment, That ye love one another, as I have loved you."],
  ["Psalm 34:18","The LORD is nigh unto them that are of a broken heart; and saveth such as be of a contrite spirit."],
  ["Micah 6:8","He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?"],
  ["2 Corinthians 12:9","And he said unto me, My grace is sufficient for thee: for my strength is made perfect in weakness. Most gladly therefore will I rather glory in my infirmities, that the power of Christ may rest upon me."],
  ["Psalm 118:24","This is the day which the LORD hath made; we will rejoice and be glad in it."],
  ["1 John 4:18","There is no fear in love; but perfect love casteth out fear: because fear hath torment. He that feareth is not made perfect in love."],
  ["Isaiah 40:31","But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint."],
  ["Luke 6:31","And as ye would that men should do to you, do ye also to them likewise."],
  ["Ephesians 4:32","And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ’s sake hath forgiven you."],
  ["John 16:33","These things I have spoken unto you, that in me ye might have peace. In the world ye shall have tribulation: but be of good cheer; I have overcome the world."],
  ["Matthew 5:14","Ye are the light of the world. A city that is set on an hill cannot be hid."],
  ["Zephaniah 3:17","The LORD thy God in the midst of thee is mighty; he will save, he will rejoice over thee with joy; he will rest in his love, he will joy over thee with singing."],
  ["Matthew 11:28","Come unto me, all ye that labour and are heavy laden, and I will give you rest."]
];

// Front page: verse of the day, topic cards, fresh starter questions, a gentle
// "welcome back" note, and a Premium teaser. All of it hides once a chat starts.
(() => {
  const $ = (id) => document.getElementById(id);
  const q = $("q"), f = $("f");
  const ask = (text) => { q.value = text; f.requestSubmit(); };

  // Verse of the day: same verse for everyone on a given local date.
  const now = new Date();
  const dayNum = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5) + now.getFullYear() * 366;
  const [ref, text] = VERSES[dayNum % VERSES.length];
  $("votdText").textContent = "“" + text + "”";
  $("votdRef").textContent = ref + " (KJV)";
  $("votdAsk").onclick = () => ask(`What does ${ref} mean for my life today?`);

  // Fresh starter questions on every visit.
  const STARTERS = [
    "I'm anxious about money", "Is it ever OK to lie?", "I feel far from God", "How do I forgive someone who hurt me?",
    "I can't stop worrying about the future", "How should I treat a difficult coworker?", "Am I loved just as I am?",
    "How do I find my purpose?", "I feel lonely lately", "How can I be more patient with my family?",
    "Is it wrong to feel angry?", "How do I pray when I don't know what to say?",
  ];
  const pick = STARTERS.map((s) => [Math.random(), s]).sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]);
  document.querySelectorAll("#f .chip").forEach((c, i) => { if (pick[i]) c.textContent = pick[i]; });

  // Topic cards ask a real question when tapped.
  document.querySelectorAll(".topic").forEach((t) => (t.onclick = () => { ask(t.dataset.q); }));

  // Welcome back note for returning visitors (stored only on this device).
  try {
    const today = now.toDateString(), yest = new Date(now - 864e5).toDateString();
    const s = JSON.parse(localStorage.getItem("wwjd_visits") || "null") || { last: null, streak: 0 };
    if (s.last !== today) { s.streak = s.last === yest ? s.streak + 1 : 1; s.last = today; localStorage.setItem("wwjd_visits", JSON.stringify(s)); }
    if (s.streak >= 2) { $("streak").textContent = `🌱 Welcome back. That's ${s.streak} days in a row you've spent time here.`; $("streak").hidden = false; }
  } catch {}

  // Premium teaser, priced from the live Stripe plan.
  fetch("/api/me").then((r) => r.json()).then((m) => {
    if (m.premium || !m.available) return;
    const label = m.plans?.monthly?.label;
    if (label) $("promoPrice").textContent = label.replace(" / ", "/").replace("month", "mo");
    $("promo").hidden = false;
  }).catch(() => {});
})();
