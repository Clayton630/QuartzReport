(() => {
  function useFallback(image) {
    const fallback = image.dataset.imageFallback;
    if (!fallback || image.dataset.imageFallbackUsed === "true") return;
    image.dataset.imageFallbackUsed = "true";
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
    image.src = fallback;
  }

  document.querySelectorAll("img[data-image-fallback]").forEach((image) => {
    image.addEventListener("error", () => useFallback(image));
  });

  document.querySelectorAll("[data-image-background][data-image-source][data-image-fallback]").forEach((element) => {
    const probe = new Image();
    probe.onerror = () => {
      if (element.dataset.imageFallbackUsed === "true") return;
      element.dataset.imageFallbackUsed = "true";
      element.style.backgroundImage = `url("${element.dataset.imageFallback}")`;
    };
    probe.src = element.dataset.imageSource;
  });
})();
