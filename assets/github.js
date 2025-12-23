(() => {
  const API = "https://api.github.com";

  function toBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  function fromBase64Utf8(b64) {
    const bin = atob((b64 || "").replace(/\n/g, ""));
    const bytes = new Uint8Array([...bin].map(ch => ch.charCodeAt(0)));
    return new TextDecoder().decode(bytes);
  }

  async function req({ token, method, url, body }) {
    const headers = {
      "Accept": "application/vnd.github+json"
    };
    if (token) {
      // Bearer works for fine-grained + classic tokens
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (body) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

    if (!res.ok) {
      const msg = (data && data.message) ? data.message : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function getFile({ owner, repo, branch, path, token }) {
    const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    const data = await req({ token, method: "GET", url });
    const content = fromBase64Utf8(data.content || "");
    return { sha: data.sha, content };
  }

  async function putFile({ owner, repo, branch, path, token, message, content, sha }) {
    const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const body = {
      message,
      branch,
      content: toBase64Utf8(content)
    };
    if (sha) body.sha = sha;
    return await req({ token, method: "PUT", url, body });
  }

  window.ShadowGH = { getFile, putFile };
})();
