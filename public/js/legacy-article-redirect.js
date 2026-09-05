const file = new URLSearchParams(window.location.search).get("file");

if (file && /^[^/\\]+\.md$/i.test(file)) {
  window.location.replace(`/articles/${encodeURIComponent(file.replace(/\.md$/i, ""))}/`);
} else {
  window.location.replace("/");
}
