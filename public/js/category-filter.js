document.querySelectorAll(".category-filter").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const selected = link.dataset.category;

    document.querySelectorAll(".category-filter").forEach((item) => {
      item.classList.toggle("active", item === link);
    });

    // À la une ne change pas : comme sur le site d'origine, seules les listes
    // d'articles sont filtrées.
    document.querySelectorAll(".day-article[data-category]").forEach((item) => {
      item.hidden = selected !== "Tous" && item.dataset.category !== selected;
    });
  });
});
