(() => {
  const API = "https://api.github.com";

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

  async function ghRequest(token, method, url, body){
    const headers = {
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Authorization": `token ${token}`
    };
    
    const res = await fetch(url, {
      method,
      headers,
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined
    });

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

  async function putFileSafe({token, owner, repo, path, branch, message, content, sha, retries=3}){
    let curSha = sha;
    let lastErr = null;

    for(let i=0;i<=retries;i++){
      try{
        return await putFile({token, owner, repo, path, branch, message, content, sha: curSha});
      }catch(e){
        lastErr = e;
        const msg = String(e?.message || "");
        const status = Number(e?.status || 0);

        const retryable = status === 409 || msg.includes("does not match") || msg.includes("expected");

        if(i < retries && retryable){
          await new Promise(r => setTimeout(r, 200 + Math.random()*200));
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