// Fills in the words from text.js (anything with data-edit="name").
for (const el of document.querySelectorAll("[data-edit]")) {
  const v = (window.SITE_TEXT || {})[el.dataset.edit];
  if (typeof v === "string") el.textContent = v;
}
