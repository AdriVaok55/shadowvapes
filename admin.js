import { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, DATA_PATH, ADMIN_PASSWORD } from "./config.js";

const lockPanel = document.getElementById("lockPanel");
const adminPanel = document.getElementById("adminPanel");
const adminPass = document.getElementById("adminPass");
const ghToken = document.getElementById("ghToken");
const unlockBtn = document.getElementById("unlockBtn");
const saveTokenBtn = document.getElementById("saveTokenBtn");
const lockStatus = document.getElementById("lockStatus");

const newCat = document.getElementById("newCat");
const addCatBtn = document.getElementById("addCatBtn");
const adminCatFilter = document.getElementById("adminCatFilter");
const reloadBtn = document.getElementById("reloadBtn");

const pName = document.getElementById("pName");
const pCat = document.getElementById("pCat");
const pImg = document.getElementById("pImg");
const pQty = document.getElementById("pQty");
const pDesc = document.getElementById("pDesc");

const addProductBtn = document.getElementById("addProductBtn");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const tbody = document.getElementById("tbody");

let state = null;
let fileSha = null;

function escapeHtml(s=""){
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function uid(){
  return "p_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}
function setStatus(msg){
  statusEl.textContent = msg || "";
}
function setLockStatus(msg){
  lockStatus.textContent = msg || "";
}

function getToken(){
  return ghToken.value?.trim() || localStorage.getItem("SV_GH_TOKEN") || "";
}

async function loadFromGitHub(){
  setStatus("Betöltés GitHub-ról...");
  const api = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_PATH}?ref=${GITHUB_BRANCH}`;

  const res = await fetch(api, {
    headers: {
      "Accept":"application/vnd.github+json",
      ...(getToken() ? { "Authorization": `Bearer ${getToken()}` } : {})
    }
  });

  if(!res.ok){
    const t = await res.text();
    throw new Error(`GitHub read fail (${res.status}): ${t}`);
  }

  const json = await res.json();
  fileSha = json.sha;
  const decoded = JSON.parse(atob(json.content.replace(/\n/g,"")));
  return decoded;
}

async function saveToGitHub(nextState){
  const token = getToken();
  if(!token) throw new Error("Nincs token megadva.");

  setStatus("Mentés... (commit a repóba)");
  const api = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_PATH}`;

  const body = {
    message: `Update inventory ${new Date().toISOString()}`,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(nextState, null, 2)))),
    branch: GITHUB_BRANCH,
    sha: fileSha
  };

  const res = await fetch(api, {
    method: "PUT",
    headers: {
      "Accept":"application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify(body)
  });

  if(!res.ok){
    const t = await res.text();
    throw new Error(`GitHub write fail (${res.status}): ${t}`);
  }

  const out = await res.json();
  fileSha = out.content?.sha || fileSha;

  setStatus("✅ Mentve GitHub-ra. (Pages-nél 10-60 mp is lehet mire frissül)");
}

function normalizeState(s){
  if(!s || typeof s !== "object") s = {};
  if(!Array.isArray(s.categories)) s.categories = ["Összes termék"];
  if(!s.categories.includes("Összes termék")) s.categories.unshift("Összes termék");
  if(!Array.isArray(s.products)) s.products = [];
  return s;
}

function rebuildSelects(){
  const cats = Array.from(new Set(state.categories));
  pCat.innerHTML = cats.filter(c=>c!=="Összes termék").map(c => `<option>${escapeHtml(c)}</option>`).join("");

  adminCatFilter.innerHTML = cats.map(c => `<option>${escapeHtml(c)}</option>`).join("");
  if(!adminCatFilter.value) adminCatFilter.value = "Összes termék";
}

function getFilteredProducts(){
  const c = adminCatFilter.value || "Összes termék";
  if(c === "Összes termék") return state.products;
  return state.products.filter(p => p.category === c);
}

function renderTable(){
  const items = getFilteredProducts();
  tbody.innerHTML = items.map(p => {
    const sold = !!p.soldOut || (Number(p.quantity) <= 0);
    return `
      <tr>
        <td>${escapeHtml(p.name || "")}</td>
        <td><span class="pill">${escapeHtml(p.category || "—")}</span></td>
        <td>
          <input data-id="${escapeHtml(p.id)}" class="qty" type="number" min="0" value="${Number(p.quantity)||0}" />
        </td>
        <td>
          <input data-id="${escapeHtml(p.id)}" class="sold" type="checkbox" ${sold ? "checked":""} />
        </td>
        <td>
          <button class="btn ghost" data-del="${escapeHtml(p.id)}">Törlés</button>
        </td>
      </tr>
    `;
  }).join("");

  // listeners
  tbody.querySelectorAll(".qty").forEach(inp=>{
    inp.addEventListener("input", (e)=>{
      const id = e.target.dataset.id;
      const v = Math.max(0, Number(e.target.value||0));
      const p = state.products.find(x=>x.id===id);
      if(p){ p.quantity = v; p.updatedAt = new Date().toISOString(); }
    });
  });

  tbody.querySelectorAll(".sold").forEach(ch=>{
    ch.addEventListener("change",(e)=>{
      const id = e.target.dataset.id;
      const p = state.products.find(x=>x.id===id);
      if(p){
        p.soldOut = !!e.target.checked;
        p.updatedAt = new Date().toISOString();
      }
    });
  });

  tbody.querySelectorAll("button[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-del");
      state.products = state.products.filter(x=>x.id!==id);
      renderTable();
      setStatus("Törölve (még nincs mentve) — nyomj Mentést.");
    });
  });
}

async function boot(){
  state = normalizeState(await loadFromGitHub());
  rebuildSelects();
  renderTable();
  setStatus("✅ Betöltve. Szerkessz, majd Mentés GitHub-ra.");
}

unlockBtn.onclick = async ()=>{
  setLockStatus("");
  if(adminPass.value !== ADMIN_PASSWORD){
    setLockStatus("❌ Rossz admin jelszó.");
    return;
  }
  // auto token betöltés
  const saved = localStorage.getItem("SV_GH_TOKEN");
  if(saved && !ghToken.value) ghToken.value = saved;

  try{
    await boot();
    lockPanel.style.display = "none";
    adminPanel.style.display = "block";
  }catch(err){
    setLockStatus("❌ " + String(err.message || err));
  }
};

saveTokenBtn.onclick = ()=>{
  const t = ghToken.value.trim();
  if(!t){ setLockStatus("Adj meg tokent."); return; }
  localStorage.setItem("SV_GH_TOKEN", t);
  setLockStatus("✅ Token mentve ebbe a böngészőbe.");
};

reloadBtn.onclick = async ()=>{
  try{
    await boot();
  }catch(err){
    setStatus("❌ " + String(err.message || err));
  }
};

adminCatFilter.onchange = ()=> renderTable();

addCatBtn.onclick = ()=>{
  const c = (newCat.value || "").trim();
  if(!c) return;
  if(!state.categories.includes(c)){
    state.categories.push(c);
    rebuildSelects();
    renderTable();
    setStatus("✅ Kategória hozzáadva (még nincs mentve).");
  }else{
    setStatus("Ez a kategória már van.");
  }
  newCat.value = "";
};

addProductBtn.onclick = ()=>{
  const name = (pName.value||"").trim();
  const cat = (pCat.value||"").trim();
  if(!name || !cat){
    setStatus("Add meg a termék nevét + kategóriát.");
    return;
  }
  state.products.unshift({
    id: uid(),
    name,
    category: cat,
    image: (pImg.value||"").trim(),
    description: (pDesc.value||"").trim(),
    quantity: Math.max(0, Number(pQty.value||0)),
    soldOut: false,
    updatedAt: new Date().toISOString()
  });

  pName.value=""; pImg.value=""; pDesc.value=""; pQty.value="1";
  renderTable();
  setStatus("✅ Termék hozzáadva (még nincs mentve).");
};

saveBtn.onclick = async ()=>{
  try{
    state = normalizeState(state);
    await saveToGitHub(state);
  }catch(err){
    setStatus("❌ " + String(err.message || err));
  }
};
