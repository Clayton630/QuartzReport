(() => {
  try {
    const migrationKey = "quartzreport-public-repo-auth-v1";
    if (window.localStorage.getItem(migrationKey) === "done") return;

    window.localStorage.removeItem("decap-cms-user");
    window.sessionStorage.removeItem("decap-cms-auth");
    window.localStorage.setItem(migrationKey, "done");
  } catch {
    // The CMS can still handle login when browser storage is unavailable.
  }
})();
