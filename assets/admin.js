const $ = (s) => document.querySelector(s);

const LS = {
  owner: "sv_owner",
  repo: "sv_repo",
  branch: "sv_branch",
  token: "sv_token"
};

const state = {
  doc: { categories: [], products: [] },
  sales: [],
  loaded: false
};

function setSaveState(kind, text){
  const dot = $("#saveDot");
  const t = $("#saveText");
  dot.className = "dot " + (kind || "");
  t.textContent = text || "";
}

function todayISO(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmt(n){
  const v = Number(n || 0);
  return v.toLocaleString("hu-HU");
}

function esc(s){
  return String(s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function cfg(){
  const owner = $("#ghOwner").value.trim();
  const repo = $("#ghRepo").value.trim();
  const branch = ($("#ghBranch").value.trim() || "main");
  const token = $("#ghToken").value.trim();
  return { owner, repo, branch, token };
}

function saveCfg(){
  const c = cfg();
  localStorage.setItem(LS.owner, c.owner);
  localStorage.setItem(LS.repo, c.repo);
  localStorage.setItem(LS.branch, c.branch);
  localStorage.setItem(LS.token, c.token);
}

function loadCfg(){
  $("#ghOwner").value = localStorage.getItem(LS.owner) || "";
  $("#ghRepo").value = localStorage.getItem(LS.repo) || "";
  $("#ghBranch").value = localStorage.getItem(LS.branch) || "main";
  $("#ghToken").value = localStorage.getItem(LS.token) || "";
}

function ensureDoc(){
  if(Array.isArray(state.doc)){
    state.doc = { categories: [], products: state.doc };
  }
  if(!Array.isArray(state.doc.categories)) state.doc.categories = [];
  if(!Array.isArray(state.doc.products)) state.doc.products = [];
  if(!Array.isArray(state.sales)) state.sales = [];
}

function uniqueId(prefix){
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

/* ---------- Tabs ---------- */
function initTabs(){
  document.querySelectorAll(".tabs button").forEach(btn=>{
    btn.onclick = () => {
      document.querySelectorAll(".tabs button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      ["settings","categories","products","sales"].forEach(k=>{
        $("#tab-"+k).style.display = (k===tab) ? "" : "none";
      });
    };
  });
}

/* ---------- Load/Save ---------- */
async function loadData(){
  saveCfg();
  setSaveState("busy", "Betöltés…");

  const { owner, repo, branch, token } = cfg();

  try{
    if(token && owner && repo){
      const p = await ShadowGH.getFile({ token, owner, repo, branch, path: "data/products.json" });
      const s = await ShadowGH.getFile({ token, owner, repo, branch, path: "data/sales.json" });
      state.doc = JSON.parse(p.content);
      state.sales = JSON.parse(s.content);
    }else{
      const pr = await fetch("data/products.json", { cache: "no-store" });
      const sr = await fetch("data/sales.json", { cache: "no-store" });
      state.doc = await pr.json();
      state.sales = await sr.json();
    }

    ensureDoc();
    state.loaded = true;

    // sanitize
    state.doc.categories = state.doc.categories
      .filter(c => c && c.id && c.id !== "all" && c.id !== "soon")
      .map(c => ({
        id: String(c.id),
        label_hu: c.label_hu || c.id,
        label_en: c.label_en || c.label_hu || c.id
      }));

    state.doc.products = state.doc.products.map(p => ({
      id: String(p.id || uniqueId("p")),
      categoryId: String(p.categoryId || ""),
      status: (p.status === "ok" || p.status === "out" || p.status === "soon") ? p.status : "ok",
      stock: Math.max(0, Number(p.stock || 0)),
      price: Math.max(0, Number(p.price || 0)),
      image: p.image || "",
      name_hu: p.name_hu || "",
      name_en: p.name_en || "",
      flavor_hu: p.flavor_hu || "",
      flavor_en: p.flavor_en || ""
    }));

    if(!Array.isArray(state.sales)) state.sales = [];
    state.sales = state.sales.map(s => ({
      id: String(s.id || uniqueId("s")),
      date: (s.date || "").slice(0,10),
      items: Array.isArray(s.items) ? s.items.map(it => ({
        productId: String(it.productId || ""),
        qty: Math.max(1, Number(it.qty || 1)),
        unitPrice: Math.max(0, Number(it.unitPrice || 0))
      })) : []
    }));

    renderAll();
    setSaveState("ok", "Betöltve");
  }catch(e){
    console.error(e);
    setSaveState("", "Hiba: " + e.message);
    alert("Betöltési hiba: " + e.message);
  }
}

async function saveData(){
  if(!state.loaded){
    alert("Előbb tölts be adatot.");
    return;
  }

  saveCfg();
  setSaveState("busy", "Mentés…");

  const { owner, repo, branch, token } = cfg();

  try{
    ensureDoc();

    const productsText = JSON.stringify(state.doc, null, 2);
    const salesText = JSON.stringify(state.sales, null, 2);

    if(token && owner && repo){
      const pOld = await ShadowGH.getFile({ token, owner, repo, branch, path: "data/products.json" });
      const sOld = await ShadowGH.getFile({ token, owner, repo, branch, path: "data/sales.json" });

      await ShadowGH.putFile({
        token, owner, repo, branch,
        path: "data/products.json",
        message: "Update products.json",
        content: productsText,
        sha: pOld.sha
      });
      await ShadowGH.putFile({
        token, owner, repo, branch,
        path: "data/sales.json",
        message: "Update sales.json",
        content: salesText,
        sha: sOld.sha
      });

      setSaveState("ok", "Mentve ✅ újratölt…");

      // ✅ kérés: mentés után töltsön be
      await loadData();
    }else{
      setSaveState("ok", "Nincs GH config (token/owner/repo) — nem tudok repóba menteni.");
      alert("Add meg a GitHub owner/repo/branch/token-t a mentéshez.");
    }
  }catch(e){
    console.error(e);
    setSaveState("", "Mentési hiba: " + e.message);
    alert("Mentési hiba: " + e.message);
  }
}

/* ---------- Render ---------- */
function catNameHU(id){
  const c = state.doc.categories.find(x => x.id === id);
  return c ? (c.label_hu || c.id) : "—";
}

function renderAll(){
  renderCategories();
  renderProducts();
  renderSales();
  renderRevenue();
}

function renderCategories(){
  const t = $("#catTable");
  t.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Név (HU)</th>
        <th>Név (EN)</th>
        <th></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tb = t.querySelector("tbody");

  for(const c of state.doc.categories){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${esc(c.id)}</b></td>
      <td><input data-k="label_hu" data-id="${esc(c.id)}" value="${esc(c.label_hu||"")}" /></td>
      <td><input data-k="label_en" data-id="${esc(c.id)}" value="${esc(c.label_en||"")}" /></td>
      <td><button class="danger" data-delcat="${esc(c.id)}">Töröl</button></td>
    `;
    tb.appendChild(tr);
  }

  tb.oninput = (e) => {
    const el = e.target;
    if(!el.dataset || !el.dataset.id) return;
    const c = state.doc.categories.find(x => x.id === el.dataset.id);
    if(!c) return;
    c[el.dataset.k] = el.value;
  };

  tb.onclick = (e) => {
    const btn = e.target;
    if(btn.dataset && btn.dataset.delcat){
      const id = btn.dataset.delcat;
      const used = state.doc.products.some(p => p.categoryId === id);
      if(used) return alert("Ezt használja termék. Előbb állítsd át.");
      state.doc.categories = state.doc.categories.filter(c => c.id !== id);
      renderCategories();
    }
  };
}

function renderProducts(){
  const q = ($("#pSearch").value || "").trim().toLowerCase();
  const t = $("#prodTable");

  let list = [...state.doc.products];
  if(q){
    list = list.filter(p => {
      const hay = `${p.name_hu} ${p.name_en} ${p.flavor_hu} ${p.flavor_en}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // ✅ ugyan olyan nevűek egymás mellett (adminban is)
  list.sort((a,b) => {
    const an = (a.name_hu || a.name_en || "").toLowerCase();
    const bn = (b.name_hu || b.name_en || "").toLowerCase();
    if(an !== bn) return an.localeCompare(bn, "hu");
    const af = (a.flavor_hu || a.flavor_en || "").toLowerCase();
    const bf = (b.flavor_hu || b.flavor_en || "").toLowerCase();
    return af.localeCompare(bf, "hu");
  });

  t.innerHTML = `
    <thead>
      <tr>
        <th>Név (HU)</th>
        <th>Név (EN)</th>
        <th>Íz (HU)</th>
        <th>Íz (EN)</th>
        <th>Kategória</th>
        <th>Ár</th>
        <th>Készlet</th>
        <th>Status</th>
        <th>Kép</th>
        <th></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tb = t.querySelector("tbody");

  for(const p of list){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input data-p="${esc(p.id)}" data-k="name_hu" value="${esc(p.name_hu)}" /></td>
      <td><input data-p="${esc(p.id)}" data-k="name_en" value="${esc(p.name_en)}" /></td>
      <td><input data-p="${esc(p.id)}" data-k="flavor_hu" value="${esc(p.flavor_hu)}" /></td>
      <td><input data-p="${esc(p.id)}" data-k="flavor_en" value="${esc(p.flavor_en)}" /></td>
      <td>
        <select data-p="${esc(p.id)}" data-k="categoryId">
          ${state.doc.categories.map(c => `<option value="${esc(c.id)}"${p.categoryId===c.id?" selected":""}>${esc(c.label_hu||c.id)}</option>`).join("")}
        </select>
      </td>
      <td><input type="number" min="0" data-p="${esc(p.id)}" data-k="price" value="${esc(p.price)}" style="width:90px;" /></td>
      <td><input type="number" min="0" data-p="${esc(p.id)}" data-k="stock" value="${esc(p.stock)}" style="width:80px;" /></td>
      <td>
        <select data-p="${esc(p.id)}" data-k="status">
          <option value="ok"${p.status==="ok"?" selected":""}>ok</option>
          <option value="out"${p.status==="out"?" selected":""}>out</option>
          <option value="soon"${p.status==="soon"?" selected":""}>soon</option>
        </select>
      </td>
      <td><input data-p="${esc(p.id)}" data-k="image" value="${esc(p.image)}" /></td>
      <td><button class="danger" data-delprod="${esc(p.id)}">Töröl</button></td>
    `;
    tb.appendChild(tr);
  }

  tb.oninput = (e) => {
    const el = e.target;
    if(!el.dataset || !el.dataset.p) return;
    const p = state.doc.products.find(x => x.id === el.dataset.p);
    if(!p) return;

    const k = el.dataset.k;
    if(k === "price" || k === "stock") p[k] = Math.max(0, Number(el.value || 0));
    else p[k] = el.value;

    // ✅ kézi status állítás működik (nem írja felül semmi)
    // (csak eladás levonásnál állítunk auto-outot)
  };

  tb.onclick = (e) => {
    const btn = e.target;
    if(btn.dataset && btn.dataset.delprod){
      const id = btn.dataset.delprod;
      const used = state.sales.some(s => (s.items||[]).some(it => it.productId === id));
      if(used) return alert("Eladásban szerepel. Töröld az eladást előbb.");
      state.doc.products = state.doc.products.filter(p => p.id !== id);
      renderProducts();
    }
  };
}

function saleTotal(s){
  return (s.items || []).reduce((a,it)=> a + (Number(it.unitPrice||0)*Number(it.qty||0)), 0);
}

function renderSales(){
  const t = $("#salesTable");
  t.innerHTML = `
    <thead>
      <tr>
        <th>Dátum</th>
        <th>Tételek</th>
        <th>Összeg</th>
        <th></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tb = t.querySelector("tbody");

  const prodMap = new Map(state.doc.products.map(p => [p.id, p]));

  const sorted = [...state.sales].sort((a,b)=> String(b.date).localeCompare(String(a.date)));
  for(const s of sorted){
    const items = (s.items||[]).map(it=>{
      const p = prodMap.get(it.productId);
      const n = p ? (p.name_hu || p.name_en || "??") : "??";
      const f = p ? (p.flavor_hu || p.flavor_en || "") : "";
      return `${n}${f?` (${f})`:""} ×${it.qty}`;
    }).join(" • ");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${esc(s.date)}</b></td>
      <td>${esc(items)}</td>
      <td><b>${fmt(saleTotal(s))} Ft</b></td>
      <td><button class="danger" data-delsale="${esc(s.id)}">Töröl + rollback</button></td>
    `;
    tb.appendChild(tr);
  }

  tb.onclick = (e) => {
    const btn = e.target;
    if(btn.dataset && btn.dataset.delsale){
      deleteSale(btn.dataset.delsale);
    }
  };
}

function renderRevenue(){
  const all = state.sales.reduce((a,s)=> a + saleTotal(s), 0);
  $("#revAll").textContent = fmt(all) + " Ft";

  const t = todayISO();
  const today = state.sales.filter(s => s.date === t).reduce((a,s)=> a + saleTotal(s), 0);
  $("#revToday").textContent = fmt(today) + " Ft";

  // bevétel dátum szerint
  const map = new Map();
  for(const s of state.sales){
    map.set(s.date, (map.get(s.date)||0) + saleTotal(s));
  }
  const rows = [...map.entries()].sort((a,b)=> String(b[0]).localeCompare(String(a[0])));

  const rt = $("#revTable");
  rt.innerHTML = `
    <thead>
      <tr><th>Dátum</th><th>Bevétel</th></tr>
    </thead>
    <tbody>
      ${rows.map(([d,v]) => `<tr><td>${esc(d)}</td><td><b>${fmt(v)} Ft</b></td></tr>`).join("")}
    </tbody>
  `;
}

/* ---------- Actions ---------- */
function addCategory(){
  const id = prompt("Kategória ID (pl. elfbar):");
  if(!id) return;
  if(id === "all" || id === "soon") return alert("Foglalts ID.");
  if(state.doc.categories.some(c => c.id === id)) return alert("Már létezik.");

  const hu = prompt("Név HU:", id) || id;
  const en = prompt("Név EN:", hu) || hu;

  state.doc.categories.push({ id: String(id), label_hu: hu, label_en: en });
  renderCategories();
  renderProducts();
}

function addProduct(){
  if(state.doc.categories.length === 0) return alert("Előbb kategóriát adj hozzá.");

  const p = {
    id: uniqueId("p"),
    categoryId: state.doc.categories[0].id,
    status: "ok",
    stock: 0,
    price: 0,
    image: "",
    name_hu: "",
    name_en: "",
    flavor_hu: "",
    flavor_en: ""
  };
  state.doc.products.push(p);
  renderProducts();
}

function deleteSale(id){
  const idx = state.sales.findIndex(s => s.id === id);
  if(idx < 0) return;
  const s = state.sales[idx];

  // ✅ rollback készlet
  for(const it of (s.items||[])){
    const p = state.doc.products.find(x => x.id === it.productId);
    if(!p) continue;
    p.stock = Math.max(0, Number(p.stock||0) + Number(it.qty||0));
    // ha visszajött stock és out volt, vissza ok-ra (de ha user direkt out-ra állította később, az úgyis az ő dolga)
    if(p.stock > 0 && p.status === "out") p.status = "ok";
  }

  state.sales.splice(idx, 1);

  // ✅ azonnali frissítés (nem laggol)
  renderProducts();
  renderSales();
  renderRevenue();
}

function addSale(){
  // ✅ több tétel / egy eladás
  // prompt alap (gyors), de fixen gyors render és rollback kompatibilis
  const date = (prompt("Dátum (YYYY-MM-DD):", todayISO()) || "").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return alert("Dátum formátum: YYYY-MM-DD");

  const items = [];
  while(true){
    const pick = prompt(
      "Termék ID (kilépés: üres)\nTip: admin termék listában a törlés gomb mellett látod a sorokat.",
      ""
    );
    if(!pick) break;

    const p = state.doc.products.find(x => x.id === pick);
    if(!p) { alert("Nincs ilyen ID."); continue; }
    if(p.status === "soon") { alert("soon termék nem eladható."); continue; }

    const qty = Math.max(1, Number(prompt("Darab:", "1") || 1));
    if(p.stock < qty) { alert(`Nincs elég stock (${p.stock}).`); continue; }

    const unitPrice = Math.max(0, Number(prompt("Egységár (Ft):", String(p.price||0)) || 0));
    items.push({ productId: p.id, qty, unitPrice });
  }

  if(items.length === 0) return;

  // ✅ stock levonás azonnal
  for(const it of items){
    const p = state.doc.products.find(x => x.id === it.productId);
    p.stock = Math.max(0, Number(p.stock||0) - it.qty);
    if(p.stock <= 0 && p.status === "ok") p.status = "out"; // auto out ha elfogyott
  }

  state.sales.push({ id: uniqueId("s"), date, items });

  // ✅ azonnali UI refresh
  renderProducts();
  renderSales();
  renderRevenue();
}

function wire(){
  $("#loadBtn").onclick = loadData;
  $("#saveBtn").onclick = saveData;

  $("#addCatBtn").onclick = () => {
    if(!state.loaded) return alert("Előbb betöltés.");
    addCategory();
  };

  $("#addProdBtn").onclick = () => {
    if(!state.loaded) return alert("Előbb betöltés.");
    addProduct();
  };

  $("#addSaleBtn").onclick = () => {
    if(!state.loaded) return alert("Előbb betöltés.");
    addSale();
  };

  $("#pSearch").addEventListener("input", () => renderProducts());

  ["#ghOwner","#ghRepo","#ghBranch","#ghToken"].forEach(id=>{
    $(id).addEventListener("input", () => saveCfg());
  });
}

/* ---------- Start ---------- */
loadCfg();
initTabs();
wire();
setSaveState("", "Készen áll");
