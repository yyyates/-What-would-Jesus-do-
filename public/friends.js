// Tap an animal friend and it does a happy little bounce.
document.addEventListener("click", (e) => {
  const c = e.target.closest(".critter");
  if (!c || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  c.classList.remove("boing");
  void c.offsetWidth;
  c.classList.add("boing");
  setTimeout(() => c.classList.remove("boing"), 650);
});
