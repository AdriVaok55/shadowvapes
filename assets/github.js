(() => {
  const API = "https://api.github.com";

  // GitHub Contents API útvonal: a "/" maradjon "/" (különben data%2Fproducts.json lesz)
  function encodePath(path){
    return String(path || "")
      .split("/")
      .map(seg => encodeURIComponent(seg))
      .join("/");
  }

  function toBase64Unicode(str){
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }
  function fromBase64Unicode(b64){
    const bin = atob((b64 || "").replace(/\n/g,""));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function ghRequest(token, method, url, body){
    const res = await fetch(url, {
      method,
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if(!res.ok){
      const msg = (data && data.message) ? data.message : `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function getFile({token, owner, repo, path, branch}){
    const url = `${API}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
    const data = await ghRequest(token, "GET", url);
    const content = fromBase64Unicode(data.content || "");
    return { sha: data.sha, content };
  }

  async function putFile({token, owner, repo, path, branch, message, content, sha}){
    const url = `${API}/repos/${owner}/${repo}/contents/${encodePath(path)}`;
    const body = {
      message,
      branch,
      content: toBase64Unicode(content),
    };
    if(sha) body.sha = sha;
    return await ghRequest(token, "PUT", url, body);
  }

  // Biztonságos mentés: SHA mismatch esetén friss SHA-val újrapróbálja
  async function putFileSafe({token, owner, repo, path, branch, message, content, sha, retries=2}){
    let curSha = sha;
    for(let i=0;i<=retries;i++){
      try{
        return await putFile({token, owner, repo, path, branch, message, content, sha: curSha});
      }catch(e){
        const msg = String(e?.message || "");
        const retryable = e?.status === 409 || msg.includes("does not match") || msg.includes("expected") || msg.includes("is at");
        if(i < retries && retryable){
          const latest = await getFile({token, owner, repo, path, branch});
          curSha = latest.sha;
          continue;
        }
        throw e;
      }
    }
  }

  window.ShadowGH = { getFile, putFile, putFileSafe };
})();
