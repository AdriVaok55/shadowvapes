const $ = (q) => document.querySelector(q);

const gate = $("#gate");
const panel = $("#panel");
const gateMsg = $("#gateMsg");

const adminPass = $("#adminPass");
const ghOwner = $("#ghOwner");
const ghRepo = $("#ghRepo");
const ghToken = $("#ghToken");
const enterBtn = $("#enterBtn");

const btnProducts = $("#btnProducts");
const btnCategories = $("#btnCategories");
const productsCard = $("#productsCard");
const categoriesCard = $("#categoriesCard");

const reloadBtn = $("#reloadBtn");
const saveBtn = $("#saveBtn");
const statusLine = $("#statusLine");

const filterCat = $("#filterCat");
const addProductBtn = $("#addProductBtn");
const productsList = $("#productsList");

const newCatName = $("#newCatName");
const addCatBtn = $("#addCatBtn");
const catList = $("#catList");

let categories = [];
let products = [];

const LS = {
  pass: "sv_admin_pass",
  owner: "sv_owner",
  repo: "sv_repo",
  token: "sv_token",
};

function setStatus(msg){ statusLine.textContent = msg; }

function slugify(str){
  return String(str || "")
    .trim().toLowerCase()
    .replaceAll("á","a").replaceAll("é","e").replaceAll("í","i").replaceAll("ó","o").replaceAll("ö","o").replaceAll("ő","o")
    .replaceAll("ú","u").replaceAll("ü","u").replaceAll("ű","u")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || ("cat_" + Math.random().toString(16).slice(2,8));
}

function uid(prefix="p"){
  return prefix + "_" + Math.random().toString(16).slice(2,10);
}

function loadLocalCreds(){
  adminPass.value = localStorage.getItem(LS.pass) || "";
  ghOwner.value = localStorage.getItem(LS.owner) || "";
  ghRepo.value = localStorage.getItem(LS.repo) || "";
  ghToken.value = localStorage.getItem(LS.token) || "";
}

function saveLocalCreds(){
  localStorage.setItem(LS.pass, adminPass.value);
  localStorage.setItem(LS.owner, ghOwner.value);
  localStorage.setItem(LS.repo, ghRepo.value);
  localStorage.setItem(LS.token, ghToken.value);
}

function gateOpen(){
  gate.hidden = true;
  panel.hidden = false;
}

function gateClose(){
  gate.hidden = false;
  panel.hidden = true;
}

enterBtn.addEventListener("click", async () => {
  gateMsg.textContent = "";
  if (!adminPass.value.trim()) return gateMsg.textContent = "Adj meg admin jelszót.";
  if (!ghOwner.value.trim() || !ghRepo.value.trim() || !ghToken.value.trim())
    return gateMsg.textContent = "Owner + Repo + Token kell a mentéshez.";

  saveLocalCreds();
  gateOpen();
  await reloadData();
});

btnProducts.addEventListener("click", () => {
  btnProducts.classList.add("is-active");
  btnCategories.classList.remove("is-active");
  productsCard.hidden = false;
  categoriesCard.hidden = true;
});

btnCategories.addEventListener("click", () => {
  btnCategories.classList.add("is-active");
  btnProducts.classList.remove("is-active");
  categoriesCard.hidden = false;
  productsCard.hidden = true;
  renderCategories();
});

reloadBtn.addEventListener("click", reloadData);
saveBtn.addEventListener("click", saveAllToGitHub);

filterCat.addEventListener("change", renderProducts);

addCatBtn.addEventListener("click", () => {
  const name = newCatName.value.trim();
  if (!name) return;
  const id = slugify(name);

  if (categories.some(c => c.id === id)) {
    setStatus("Van már ilyen kategória ID-val. Próbálj más nevet.");
    return;
  }

  categories.push({ id, name });
  newCatName.value = "";
  renderCategoryFilter();
  renderCategories();
  setStatus("Kategória hozzáadva (még nincs mentve).");
});

addProductBtn.addEventListener("click", () => {
  const name = prompt("Termék neve?");
  if (!name) return;

  const description = prompt("Leírás? (oké ha üres)") || "";
  const image = prompt("Kép link (URL)?") || "";
  const catId = prompt("Kategória ID? (pl gamer_eger) — ha nem tudod, hagyd üresen") || "";
  const stockStr = prompt("Készlet db? (szám)") || "0";
  const stock = Number(stockStr);
  const product = {
    id: uid("p"),
    name,
    description,
    image,
    categoryId: catId || (categories[0]?.id ?? ""),
    stock: Number.isFinite(stock) ? stock : 0,
    soldOut: false
  };

  products.unshift(product);
  renderProducts();
  setStatus("Termék hozzáadva (még nincs mentve).");
});

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderCategoryFilter(){
  const current = filterCat.value;
  filterCat.innerHTML = `<option value="all">Összes kategória</option>`;
  categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.id})`;
    filterCat.appendChild(opt);
  });
  // visszaállítás
  if ([...filterCat.options].some(o => o.value === current)) filterCat.value = current;
}

function renderCategories(){
  catList.innerHTML = "";
  categories.forEach((c) => {
    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <div class="card__body" style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
        <div>
          <div class="card__name" style="margin:0;">${escapeHtml(c.name)}</div>
          <div class="card__desc" style="margin:6px 0 0;">ID: <code>${escapeHtml(c.id)}</code></div>
        </div>
        <button class="nav__btn" style="width:auto;" data-del="${escapeHtml(c.id)}">Törlés</button>
      </div>
    `;
    row.querySelector("[data-del]").addEventListener("click", () => {
      const id = c.id;
      if (!confirm(`Törlöd? ${c.name} (${id})`)) return;
      categories = categories.filter(x => x.id !== id);
      // termékekből is kiszedjük a kategóriát
      products = products.map(p => p.categoryId === id ? { ...p, categoryId: "" } : p);
      renderCategoryFilter();
      renderCategories();
      renderProducts();
      setStatus("Kategória törölve (még nincs mentve).");
    });
    catList.appendChild(row);
  });
}

function renderProducts(){
  const cat = filterCat.value;
  const list = cat === "all" ? products : products.filter(p => p.categoryId === cat);

  productsList.innerHTML = "";
  list.forEach((p) => {
    const cName = categories.find(c => c.id === p.categoryId)?.name || "(nincs kategória)";
    const row = document.createElement("div");
    row.className = "card" + (p.soldOut ? " is-soldout" : "");
    row.innerHTML = `
      <div class="card__body" style="display:grid; gap:10px;">
        <div style="display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
          <div>
            <div class="card__name" style="margin:0;">${escapeHtml(p.name)}</div>
            <div class="card__desc" style="margin:6px 0 0;">
              Kategória: <b>${escapeHtml(cName)}</b> • ID: <code>${escapeHtml(p.categoryId || "")}</code>
            </div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="nav__btn" style="width:auto;" data-edit="${escapeHtml(p.id)}">Szerkesztés</button>
            <button class="nav__btn" style="width:auto;" data-sold="${escapeHtml(p.id)}">${p.soldOut ? "Vissza elérhetőre" : "Elfogyott"}</button>
            <button class="nav__btn" style="width:auto;" data-del="${escapeHtml(p.id)}">Törlés</button>
          </div>
        </div>

        <div class="card__desc" style="margin:0;">
          Készlet: <b>${Number(p.stock ?? 0)}</b> db
        </div>
      </div>
    `;

    row.querySelector("[data-edit]").addEventListener("click", () => editProduct(p.id));
    row.querySelector("[data-sold]").addEventListener("click", () => toggleSoldOut(p.id));
    row.querySelector("[data-del]").addEventListener("click", () => deleteProduct(p.id));

    productsList.appendChild(row);
  });

  setStatus(`Betöltve: ${products.length} termék, ${categories.length} kategória. (Szűrés: ${cat})`);
}

function editProduct(id){
  const idx = products.findIndex(p => p.id === id);
  if (idx < 0) return;

  const p = products[idx];

  const name = prompt("Név:", p.name) ?? p.name;
  const description = prompt("Leírás:", p.description || "") ?? (p.description || "");
  const image = prompt("Kép URL:", p.image || "") ?? (p.image || "");
  const categoryId = prompt("Kategória ID:", p.categoryId || "") ?? (p.categoryId || "");
  const stockStr = prompt("Készlet:", String(p.stock ?? 0)) ?? String(p.stock ?? 0);
  const stock = Number(stockStr);

  products[idx] = {
    ...p,
    name: name.trim() || p.name,
    description,
    image,
    categoryId: categoryId.trim(),
    stock: Number.isFinite(stock) ? stock : (p.stock ?? 0),
  };

  renderProducts();
  setStatus("Termék szerkesztve (még nincs mentve).");
}

function toggleSoldOut(id){
  const idx = products.findIndex(p => p.id === id);
  if (idx < 0) return;
  const p = products[idx];
  products[idx] = { ...p, soldOut: !p.soldOut };
  renderProducts();
  setStatus("Elfogyott állapot váltva (még nincs mentve).");
}

function deleteProduct(id){
  if (!confirm("Törlöd a terméket?")) return;
  products = products.filter(p => p.id !== id);
  renderProducts();
  setStatus("Termék törölve (még nincs mentve).");
}

async function reloadData(){
  setStatus("Betöltés...");
  const [catsRes, prodRes] = await Promise.all([
    fetch("./data/categories.json", { cache: "no-store" }),
    fetch("./data/products.json", { cache: "no-store" }),
  ]);
  categories = await catsRes.json();
  products = await prodRes.json();
  renderCategoryFilter();
  renderProducts();
  renderCategories();
  setStatus("Kész. Most tudsz szerkeszteni, majd Mentés GitHubra.");
}

/**
 * GitHub Contents API mentés
 * - Token: classic, "repo" scope (vagy fine-grained, de akkor pontos jog kell)
 * - Mentés: data/products.json + data/categories.json
 */
async function saveAllToGitHub(){
  const owner = ghOwner.value.trim();
  const repo = ghRepo.value.trim();
  const token = ghToken.value.trim();
  if (!owner || !repo || !token) return setStatus("Hiányzik owner/repo/token.");

  setStatus("Mentés GitHubra...");

  try{
    await putFileToGitHub({ owner, repo, token, path: "data/categories.json", contentObj: categories, message: "Update categories" });
    await putFileToGitHub({ owner, repo, token, path: "data/products.json", contentObj: products, message: "Update products" });
    setStatus("Mentve ✅ (Pár mp és a főoldalon is friss lesz).");
  }catch(e){
    console.error(e);
    setStatus("Mentés hiba: " + (e?.message || String(e)));
  }
}

async function putFileToGitHub({ owner, repo, token, path, contentObj, message }){
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  // 1) lekérjük a jelenlegi sha-t (ha nincs fájl, akkor null)
  const current = await fetch(api, {
    headers: { Authorization: `token ${token}`, "Accept": "application/vnd.github+json" }
  });

  let sha = undefined;
  if (current.status === 200){
    const data = await current.json();
    sha = data.sha;
  } else if (current.status !== 404){
    const t = await current.text();
    throw new Error(`GitHub read fail (${current.status}): ${t}`);
  }

  // 2) feltöltjük az új tartalmat base64-ben
  const pretty = JSON.stringify(contentObj, null, 2);
  const contentB64 = btoa(unescape(encodeURIComponent(pretty)));

  const res = await fetch(api, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      content: contentB64,
      sha
    })
  });

  if (!res.ok){
    const t = await res.text();
    throw new Error(`GitHub write fail (${res.status}): ${t}`);
  }
}

loadLocalCreds();
gateClose();
