// Exact verse lookup against the King James Version (public domain).
// The model only names references; the text shown to users always comes from here,
// so quotes can never be misremembered or invented.
const fs = require("fs");
const path = require("path");

const BOOKS = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "kjv.json"), "utf8"));

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const index = new Map();
BOOKS.forEach((b, i) => index.set(norm(b.name), i));

const ALIASES = {
  psalm: "Psalms", ps: "Psalms", psa: "Psalms",
  songofsongs: "Song of Solomon", song: "Song of Solomon", canticles: "Song of Solomon",
  revelations: "Revelation", rev: "Revelation", revelationofjohn: "Revelation",
  gen: "Genesis", ex: "Exodus", exod: "Exodus", deut: "Deuteronomy", prov: "Proverbs",
  eccl: "Ecclesiastes", isa: "Isaiah", jer: "Jeremiah", matt: "Matthew", mt: "Matthew",
  mk: "Mark", lk: "Luke", jn: "John", rom: "Romans", gal: "Galatians", eph: "Ephesians",
  phil: "Philippians", col: "Colossians", heb: "Hebrews", jas: "James",
};
for (const [a, name] of Object.entries(ALIASES)) index.set(a, index.get(norm(name)));
// "First Corinthians", "I John", "1st Peter", "1 Cor" style names
const ORD = { first: "1", second: "2", third: "3", i: "1", ii: "2", iii: "3", "1st": "1", "2nd": "2", "3rd": "3" };

function findBook(name) {
  let n = String(name).trim().toLowerCase();
  const m = n.match(/^(first|second|third|iii|ii|i|1st|2nd|3rd)\s+(.*)$/);
  if (m) n = ORD[m[1]] + " " + m[2];
  const key = norm(n);
  if (index.has(key)) return index.get(key);
  // prefix match, e.g. "1cor" -> "1corinthians", "thess" -> unique match only
  const hits = BOOKS.map((b, i) => [norm(b.name), i]).filter(([k]) => k.startsWith(key));
  return hits.length === 1 ? hits[0][1] : undefined;
}

/** Returns {reference, text, verses:[{n,text}]} or null if the reference does not exist. */
function lookup({ book, chapter, verse_start, verse_end }) {
  const bi = findBook(book);
  if (bi === undefined) return null;
  const b = BOOKS[bi];
  const ch = b.chapters[Number(chapter) - 1];
  if (!ch) return null;
  const start = Number(verse_start);
  let end = Number(verse_end || verse_start);
  if (!Number.isInteger(start) || start < 1 || start > ch.length) return null;
  if (!Number.isInteger(end) || end < start) end = start;
  end = Math.min(end, ch.length, start + 2); // keep passages short (max 3 verses)
  const verses = [];
  for (let v = start; v <= end; v++) verses.push({ n: v, text: ch[v - 1] });
  const reference = `${b.name} ${chapter}:${start}${end > start ? "–" + end : ""}`;
  return { reference, text: verses.map((v) => v.text).join(" "), verses };
}

module.exports = { lookup, findBook, BOOKS };
