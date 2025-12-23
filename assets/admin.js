let DB = null;
let SALES = null;

const saveDot = document.getElementById("saveDot");
const saveText = document.getElementById("saveText");

function setSaveState(state, text){
  // state: idle | busy | ok
  saveDot.className = "dot" + (state==="busy" ? " busy" : state==="ok" ? " ok" : "");
  saveText.textContent = text;
}

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function qs(sel){ return document.querySelector(sel); }
function el(tag, cls){ const e=document.createElement(tag); if(cls) e.className=cls; return e; }

function loadCfgToInputs(){
  const cfg = GH.getCfg();
  qs("#ghOwner").value = cfg.owner;
  qs("#ghRepo").value = cfg.repo;
  qs("#ghBranch").value = cfg.branch;
  qs("#ghToken").value = cfg.token;
}

function saveCfgFromInputs(){
  GH.setCfg({
    owner: qs("#ghOwner").value.trim(),
    repo: qs("#ghRepo").value.trim(),
    branch: qs("#ghBranch").value.trim() || "main",
    token: qs("#ghToken").value.trim()
  });
  qs("#cfgHint").textContent = "Oké, elmentettem a beállításokat ebbe a böngészőbe.";
}

async function loadAll(){
  setSaveState("busy","Betöltés...");
  try{
    const p = await GH.readFile("data/products.json");
    DB = JSON.parse(p.contentText);

    const s = await GH.readFile("data/sales.json");
    SALES = JSON.parse(s.contentText);

    setSaveState("ok","Betöltve ✅");
    setTimeout(()=>setSaveState("idle","Nincs mentés folyamatban"), 1200);
    renderAll();
  }catch(e){
    console.error(e);
    setSaveState("idle","Betöltés hiba: " + (e.message || "ismeretlen"));
    // Tipikus 401
    if(e.status === 401){
      qs("#cfgHint").textContent = "401 Bad credentials → token rossz / nincs jogosultság / nem jó token típusa.";
    }
  }
}

let saveTimer = null;
async function saveAllDebounced(reason="Mentés..."){
  setSaveState("busy", reason);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async ()=>{
    try{
      // write products first, then sales
      await GH.writeFile("data/products.json", JSON.stringify(DB, null, 2), "Update products");
      await GH.writeFile("data/sales.json", JSON.stringify(SALES, null, 2), "Update sales");
      setSaveState("ok","Mentve ✅");
      setTimeout(()=>setSaveState("idle","Nincs mentés folyamatban"), 1000);
    }catch(e){
      console.error(e);
      setSaveState("idle","Mentés hiba: " + (e.message || "ismeretlen"));
    }
  }, 250); // gyorsabb mentés (debounce)
}

function tabSwitch(tab){
  const tabs = document.querySelectorAll(".tabs button");
  tabs.forEach(b=> b.classList.toggle("active", b.dataset.tab === tab));
  qs("#tabProducts").style.display = (tab==="products") ? "block" : "none";
  qs("#tabCategories").style.display = (tab==="categories") ? "block" : "none";
  qs("#tabSales").style.display = (tab==="sales") ? "block" : "none";
  qs("#tabReports").style.display = (tab==="reports") ? "block" : "none";
  if(tab==="reports") renderReports();
}

function renderAll(){
  renderProducts();
  renderCategories();
  renderSales();
  renderReports(true);
}

function renderProducts(){
  const root = qs("#tabProducts");
  root.innerHTML = "";

  const top = el("div","rowline");
  top.innerHTML = `
    <div class="left">
      <div><b>Termékek</b></div>
      <div class="small-muted">Új termék felvétel + készlet/ár/nyelv + státusz (elfogyott/hamarosan)</div>
    </div>
    <div class="actions" style="margin:0;">
      <button class="primary" id="btnAddProduct">+ Új termék</button>
      <button class="ghost" id="btnSaveNow">Mentés</button>
    </div>
  `;
  root.appendChild(top);

  const list = el("div","");
  const products = (DB.products || []).slice().sort((a,b)=> (a.status==="out") - (b.status==="out"));
  if(products.length === 0){
    const empty = el("div","small-muted");
    empty.style.marginTop="10px";
    empty.textContent = "Még nincs termék. Nyomd a + Új termék-et.";
    list.appendChild(empty);
  }

  products.forEach(p=>{
    const row = el("div","rowline");
    const titleHu = p.nameHu || "—";
    const titleEn = p.nameEn || "—";
    row.innerHTML = `
      <div class="left">
        <div><b>${escapeHtml(titleHu)}</b> <span class="small-muted">/ ${escapeHtml(titleEn)}</span></div>
        <div class="small-muted">Kategória: <b>${escapeHtml(p.category || "—")}</b> • Ár: <b>${escapeHtml(String(p.price ?? ""))}</b> • Készlet: <b>${escapeHtml(String(p.stock ?? 0))}</b> • Státusz: <b>${escapeHtml(p.status || "ok")}</b></div>
      </div>
      <div class="actions" style="margin:0;">
        <button class="ghost" data-edit="${p.id}">Szerkeszt</button>
        <button class="danger" data-del="${p.id}">Töröl</button>
      </div>
    `;
    list.appendChild(row);
  });

  root.appendChild(list);

  qs("#btnAddProduct").onclick = ()=> openProductEditor(null);
  qs("#btnSaveNow").onclick = ()=> saveAllDebounced("Mentés...");

  root.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-edit");
      const prod = DB.products.find(x=> x.id === id);
      openProductEditor(prod);
    };
  });
  root.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-del");
      DB.products = DB.products.filter(x=> x.id !== id);
      saveAllDebounced("Törlés mentése...");
      renderProducts();
    };
  });
}

function openProductEditor(prod){
  const p = prod ? {...prod} : {
    id: uid(),
    category: (DB.categories || []).find(c=> !["Összes termék","Hamarosan"].includes(c)) || "Gamer egér",
    nameHu: "",
    nameEn: "",
    flavorHu: "",
    flavorEn: "",
    image: "",
    price: 0,
    stock: 0,
    status: "ok" // ok | out | soon
  };

  const root = qs("#tabProducts");
  const modal = el("div","panel fade-in");
  modal.style.marginTop="12px";

  const catOptions = (DB.categories || []).filter(c=> !["Összes termék","Hamarosan"].includes(c));
  const opts = catOptions.map(c=> `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");

  modal.innerHTML = `
    <div><b>${prod ? "Termék szerkesztése" : "Új termék"}</b></div>
    <div class="form-grid" style="margin-top:10px;">
      <div class="field third">
        <label>Kategória</label>
        <select id="pCat">${opts || `<option value="">(nincs)</option>`}</select>
      </div>
      <div class="field third">
        <label>Státusz</label>
        <select id="pStatus">
          <option value="ok">Elérhető</option>
          <option value="out">Elfogyott</option>
          <option value="soon">Hamarosan</option>
        </select>
      </div>
      <div class="field third">
        <label>Készlet (db)</label>
        <input id="pStock" type="number" min="0" />
      </div>

      <div class="field third">
        <label>Ár (Ft)</label>
        <input id="pPrice" type="number" min="0" />
      </div>
      <div class="field full">
        <label>Kép URL (ajánlott)</label>
        <input id="pImg" placeholder="https://..." />
      </div>

      <div class="field">
        <label>Név (HU)</label>
        <input id="pNameHu" />
      </div>
      <div class="field">
        <label>Name (EN)</label>
        <input id="pNameEn" />
      </div>

      <div class="field">
        <label>Íz (HU)</label>
        <input id="pFlavorHu" />
      </div>
      <div class="field">
        <label>Flavor (EN)</label>
        <input id="pFlavorEn" />
      </div>
    </div>

    <div class="actions">
      <button class="primary" id="pSave">${prod ? "Mentés" : "Hozzáadás"}</button>
      <button class="ghost" id="pCancel">Mégse</button>
    </div>
  `;

  root.appendChild(modal);

  qs("#pCat").value = p.category || "";
  qs("#pStatus").value = p.status || "ok";
  qs("#pStock").value = Number(p.stock || 0);
  qs("#pPrice").value = Number(p.price || 0);
  qs("#pImg").value = p.image || "";
  qs("#pNameHu").value = p.nameHu || "";
  qs("#pNameEn").value = p.nameEn || "";
  qs("#pFlavorHu").value = p.flavorHu || "";
  qs("#pFlavorEn").value = p.flavorEn || "";

  qs("#pCancel").onclick = ()=> modal.remove();
  qs("#pSave").onclick = ()=>{
    p.category = qs("#pCat").value;
    p.status = qs("#pStatus").value;
    p.stock = Math.max(0, Number(qs("#pStock").value || 0));
    p.price = Math.max(0, Number(qs("#pPrice").value || 0));
    p.image = qs("#pImg").value.trim();
    p.nameHu = qs("#pNameHu").value.trim();
    p.nameEn = qs("#pNameEn").value.trim();
    p.flavorHu = qs("#pFlavorHu").value.trim();
    p.flavorEn = qs("#pFlavorEn").value.trim();

    if(p.stock === 0 && p.status === "ok") p.status = "out"; // auto
    if(p.stock > 0 && p.status === "out") p.status = "ok";

    const idx = DB.products.findIndex(x=> x.id === p.id);
    if(idx >= 0) DB.products[idx] = p;
    else DB.products.push(p);

    saveAllDebounced("Termék mentése...");
    modal.remove();
    renderProducts();
  };
}

function renderCategories(){
  const root = qs("#tabCategories");
  root.innerHTML = "";

  const top = el("div","rowline");
  top.innerHTML = `
    <div class="left">
      <div><b>Kategóriák</b></div>
      <div class="small-muted">Létrehozás + törlés. (Az “Összes termék” és “Hamarosan” fix.)</div>
    </div>
  `;
  root.appendChild(top);

  const catWrap = el("div","panel fade-in");
  catWrap.style.marginTop="12px";
  catWrap.innerHTML = `
    <div class="form-grid">
      <div class="field full">
        <label>Új kategória neve</label>
        <input id="newCat" placeholder="pl. Gamer egér" />
      </div>
    </div>
    <div class="actions">
      <button class="primary" id="btnAddCat">+ Kategória hozzáadása</button>
    </div>
    <div id="catList"></div>
  `;
  root.appendChild(catWrap);

  qs("#btnAddCat").onclick = ()=>{
    const name = qs("#newCat").value.trim();
    if(!name) return;
    DB.categories = DB.categories || ["Összes termék","Hamarosan"];
    if(DB.categories.includes(name)) return;
    DB.categories.push(name);
    qs("#newCat").value = "";
    saveAllDebounced("Kategória mentése...");
    renderCategories();
    renderProducts();
  };

  const catList = qs("#catList");
  const cats = (DB.categories || []).filter(c=> !["Összes termék","Hamarosan"].includes(c));
  if(cats.length === 0){
    const empty = el("div","small-muted");
    empty.style.marginTop="10px";
    empty.textContent = "Még nincs extra kategória. Adj hozzá egyet.";
    catList.appendChild(empty);
    return;
  }

  cats.forEach(c=>{
    const row = el("div","rowline");
    row.innerHTML = `
      <div class="left">
        <div><b>${escapeHtml(c)}</b></div>
        <div class="small-muted">Törlésnél a termékek kategóriája “(üres)” lesz.</div>
      </div>
      <div class="actions" style="margin:0;">
        <button class="danger" data-delcat="${escapeAttr(c)}">Törlés</button>
      </div>
    `;
    catList.appendChild(row);
  });

  catList.querySelectorAll("[data-delcat]").forEach(btn=>{
    btn.onclick = ()=>{
      const c = btn.getAttribute("data-delcat");
      DB.categories = (DB.categories || []).filter(x=> x !== c);
      // products that had this category -> clear
      (DB.products || []).forEach(p=>{
        if(p.category === c) p.category = "";
      });
      saveAllDebounced("Kategória törlése...");
      renderCategories();
      renderProducts();
    };
  });
}

function renderSales(){
  const root = qs("#tabSales");
  root.innerHTML = "";

  const top = el("div","rowline");
  top.innerHTML = `
    <div class="left">
      <div><b>Eladás rögzítése</b></div>
      <div class="small-muted">Terméket választasz → db → egységár → levonja a készletből és naplóz.</div>
    </div>
  `;
  root.appendChild(top);

  const products = (DB.products || []).filter(p=> p.status !== "soon"); // soon cannot be sold
  const options = products.map(p=>{
    const t = (p.nameHu || p.nameEn || "—");
    return `<option value="${escapeAttr(p.id)}">${escapeHtml(t)} (készlet: ${escapeHtml(String(p.stock||0))})</option>`;
  }).join("");

  const panel = el("div","panel fade-in");
  panel.style.marginTop="12px";
  panel.innerHTML = `
    <div class="form-grid">
      <div class="field third">
        <label>Vásárló neve</label>
        <input id="buyer" placeholder="pl. Jani" />
      </div>
      <div class="field third">
        <label>Időpont</label>
        <input id="when" type="datetime-local" />
      </div>
      <div class="field third">
        <label>Fizetés módja</label>
        <input id="pay" placeholder="pl. kp / utalás / kártya" />
      </div>

      <div class="field full">
        <label>Termék</label>
        <select id="prodSel">${options || `<option value="">Nincs termék</option>`}</select>
      </div>
      <div class="field third">
        <label>Darab</label>
        <input id="qty" type="number" min="1" value="1" />
      </div>
      <div class="field third">
        <label>Egységár (Ft)</label>
        <input id="unit" type="number" min="0" value="0" />
      </div>
      <div class="field third">
        <label>Megjegyzés (opcionális)</label>
        <input id="note" placeholder="..." />
      </div>
    </div>

    <div class="actions">
      <button class="primary" id="btnAddSale">Eladás mentése</button>
    </div>

    <div class="small-muted" style="margin-top:10px;">Utolsó 10 eladás:</div>
    <table class="table" id="salesTable">
      <thead><tr>
        <th>Idő</th><th>Vevő</th><th>Termék</th><th>Db</th><th>Egységár</th><th>Összeg</th><th>Fizetés</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  `;
  root.appendChild(panel);

  // set default datetime now (local)
  const now = new Date();
  const pad = n=> String(n).padStart(2,"0");
  const v = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  qs("#when").value = v;

  // autopick unit price from selected product
  qs("#prodSel").onchange = ()=>{
    const id = qs("#prodSel").value;
    const p = DB.products.find(x=> x.id === id);
    if(p) qs("#unit").value = Number(p.price || 0);
  };
  qs("#prodSel").dispatchEvent(new Event("change"));

  qs("#btnAddSale").onclick = ()=>{
    const id = qs("#prodSel").value;
    const p = DB.products.find(x=> x.id === id);
    if(!p) return;

    const qty = Math.max(1, Number(qs("#qty").value || 1));
    const unit = Math.max(0, Number(qs("#unit").value || 0));
    const buyer = qs("#buyer").value.trim() || "—";
    const when = qs("#when").value;
    const pay = qs("#pay").value.trim() || "—";
    const note = qs("#note").value.trim();

    const stock = Number(p.stock || 0);
    if(qty > stock){
      alert(`Nincs ennyi készlet. Készlet: ${stock}`);
      return;
    }

    // Update stock
    p.stock = stock - qty;
    if(p.stock === 0) p.status = "out";

    // Save sale
    SALES.sales = SALES.sales || [];
    SALES.sales.push({
      id: uid(),
      ts: when ? new Date(when).toISOString() : new Date().toISOString(),
      buyer, pay, note,
      item: {
        productId: p.id,
        nameHu: p.nameHu || "",
        nameEn: p.nameEn || "",
        qty, unit
      }
    });

    saveAllDebounced("Eladás mentése...");
    renderProducts(); // reflect stock changes
    renderSales();    // refresh table
  };

  fillSalesTable();
}

function fillSalesTable(){
  const tbody = qs("#salesTable tbody");
  if(!tbody) return;
  tbody.innerHTML = "";
  const sales = (SALES.sales || []).slice().sort((a,b)=> (a.ts < b.ts ? 1 : -1)).slice(0,10);

  sales.forEach(s=>{
    const tr = document.createElement("tr");
    const total = (Number(s.item.qty)||0) * (Number(s.item.unit)||0);
    tr.innerHTML = `
      <td>${escapeHtml(new Date(s.ts).toLocaleString("hu-HU"))}</td>
      <td>${escapeHtml(s.buyer)}</td>
      <td>${escapeHtml(s.item.nameHu || s.item.nameEn || "—")}</td>
      <td>${escapeHtml(String(s.item.qty))}</td>
      <td>${escapeHtml(String(s.item.unit))}</td>
      <td><b>${escapeHtml(String(total))}</b></td>
      <td>${escapeHtml(s.pay)}</td>
    `;
    tbody.appendChild(tr);
  });
}

let chart = null;
function renderReports(silent=false){
  const root = qs("#tabReports");
  if(!root) return;
  root.innerHTML = "";

  const sales = (SALES?.sales || []).slice();
  let sum = 0;
  sales.forEach(s=> sum += (Number(s.item.qty)||0) * (Number(s.item.unit)||0));

  const kpi = el("div","kpi");
  kpi.innerHTML = `
    <div class="box"><div class="t">Össz bevétel</div><div class="v">${sum.toLocaleString("hu-HU")} Ft</div></div>
    <div class="box"><div class="t">Eladások száma</div><div class="v">${sales.length}</div></div>
    <div class="box"><div class="t">Termékek száma</div><div class="v">${(DB?.products || []).length}</div></div>
  `;
  root.appendChild(kpi);

  const canvasWrap = el("div","panel fade-in");
  canvasWrap.style.marginTop="12px";
  canvasWrap.innerHTML = `
    <div><b>Bevétel grafikon (napi)</b></div>
    <canvas id="revChart" style="margin-top:10px;"></canvas>
  `;
  root.appendChild(canvasWrap);

  // daily aggregation
  const map = new Map();
  sales.forEach(s=>{
    const d = new Date(s.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const v = (Number(s.item.qty)||0) * (Number(s.item.unit)||0);
    map.set(key, (map.get(key)||0) + v);
  });

  const labels = Array.from(map.keys()).sort();
  const values = labels.map(k=> map.get(k));

  const ctx = qs("#revChart").getContext("2d");
  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Bevétel (Ft)", data: values, tension: 0.25 }] },
    options: {
      responsive:true,
      plugins:{ legend:{ display:true } },
      scales:{
        y:{ beginAtZero:true }
      }
    }
  });

  const table = el("table","table");
  table.innerHTML = `
    <thead><tr><th>Dátum</th><th>Bevétel</th></tr></thead>
    <tbody>
      ${labels.map(l=> `<tr><td>${escapeHtml(l)}</td><td><b>${escapeHtml(String(map.get(l)))}</b></td></tr>`).join("")}
    </tbody>
  `;
  root.appendChild(table);

  if(!silent) setTimeout(()=>{}, 0);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s){
  return String(s).replace(/"/g,"&quot;");
}

// Tabs
document.querySelectorAll(".tabs button").forEach(btn=>{
  btn.onclick = ()=> tabSwitch(btn.dataset.tab);
});

// Cfg buttons
qs("#btnSaveCfg").onclick = ()=>{
  saveCfgFromInputs();
};

qs("#btnLoad").onclick = ()=> loadAll();

// Boot
loadCfgToInputs();
setSaveState("idle","Nincs mentés folyamatban");
loadAll();
