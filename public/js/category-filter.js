document.querySelectorAll(".category-filter").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const selected = link.dataset.category;

    document.querySelectorAll(".category-filter").forEach((item) => {
      item.classList.toggle("active", item === link);
    });

    document.querySelectorAll("[data-category]").forEach((item) => {
      if (item.classList.contains("category-filter")) return;
      item.hidden = selected !== "Tous" && item.dataset.category !== selected;
    });
  });
});
