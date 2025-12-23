// GitHub Contents API helper (works on GitHub Pages)
// Stores token in localStorage. You paste token once in Admin.

const GH = {
  getCfg() {
    return {
      owner: localStorage.getItem("gh_owner") || "",
      repo: localStorage.getItem("gh_repo") || "",
      branch: localStorage.getItem("gh_branch") || "main",
      token: localStorage.getItem("gh_token") || ""
    };
  },

  setCfg({ owner, repo, branch, token }) {
    if (owner != null) localStorage.setItem("gh_owner", owner);
    if (repo != null) localStorage.setItem("gh_repo", repo);
    if (branch != null) localStorage.setItem("gh_branch", branch);
    if (token != null) localStorage.setItem("gh_token", token);
  },

  async api(path, { method="GET", body=null } = {}) {
    const { token } = GH.getCfg();
    const headers = {
      "Accept": "application/vnd.github+json"
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";

    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw:text }; }

    if (!res.ok) {
      const msg = json?.message || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = json;
      throw err;
    }
    return json;
  },

  // Reads a repo file (returns {contentText, sha})
  async readFile(filePath) {
    const { owner, repo, branch } = GH.getCfg();
    const data = await GH.api(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`);
    const content = atob((data.content || "").replace(/\n/g, ""));
    return { contentText: content, sha: data.sha };
  },

  // Writes a repo file using sha
  async writeFile(filePath, contentText, message) {
    const { owner, repo, branch } = GH.getCfg();
    const { sha } = await GH.readFile(filePath);
    const content = btoa(unescape(encodeURIComponent(contentText)));
    return GH.api(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`, {
      method: "PUT",
      body: { message, content, sha, branch }
    });
  }
};
