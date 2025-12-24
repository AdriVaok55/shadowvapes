(() => {
  const API = "https://api.github.com";

  // GitHub Contents API: a "/" maradjon "/" (különben data%2Fproducts.json lesz)
  function encodePath(path){
    return String(path || "")
      .split("/")
      .map(seg => encodeURIComponent(seg))
      .join("/");
  }

  function toBase64Unicode(str){
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  function fromBase64Unicode(b64){
    const bin = atob((b64 || "").replace(/\n/g,""));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function doFetch({token, method, url, body, authScheme}){
    const headers = {
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Authorization": `${authScheme} ${token}`
    };
    return await fetch(url, {
      method,
      headers,
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined
    });
  }

  async function ghRequest(token, method, url, body){
    // klasszikus PAT: "token", fine-grained: "Bearer" – itt mindkettőt próbáljuk 401-nél
    let res = await doFetch({ token, method, url, body, authScheme: "token" });

    if(res.status === 401){
      // fallback
      res = await doFetch({ token, method, url, body, authScheme: "Bearer" });
    }

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if(!res.ok){
      const msg = (data && data.message) ? data.message : `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      err.url = url;
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

  // Biztonságos mentés: SHA mismatch esetén friss SHA-val újrapróbálja (jitter + több retry)
  async function putFileSafe({token, owner, repo, path, branch, message, content, sha, retries=6}){
    let curSha = sha;
    let lastErr = null;

    for(let i=0;i<=retries;i++){
      try{
        return await putFile({token, owner, repo, path, branch, message, content, sha: curSha});
      }catch(e){
        lastErr = e;
        const msg = String(e?.message || "");
        const status = Number(e?.status || 0);

        const retryable =
          status === 409 || status === 422 ||
          msg.includes("does not match") ||
          msg.includes("expected") ||
          msg.includes("is at") ||
          msg.toLowerCase().includes("sha");

        if(i < retries && retryable){
          // kis jitter, hogy ne üssük egymást ha 2 admin nyitva van
          await new Promise(r => setTimeout(r, 140 + Math.random()*260));
          try{
            const latest = await getFile({token, owner, repo, path, branch});
            curSha = latest.sha;
            continue;
          }catch{
            throw e;
          }
        }
        throw e;
      }
    }
    throw lastErr || new Error("Mentés hiba");
  }

  window.ShadowGH = { getFile, putFile, putFileSafe };
})();