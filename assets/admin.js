const $ = (s)=>document.querySelector(s);

const LS = {
  owner:"sv_gh_owner",
  repo:"sv_gh_repo",
  branch:"sv_gh_branch",
  token:"sv_gh_token",
};

const state = {
  loaded:false,
  productsDoc:{ updatedAt:null, categories:[], products:[] },
  sales:[],
  ui:{
    tab:"products",
    prodCat:"all",
    prodSearch:"",
    saleCat:"all",
    saleSearch:"",
    chartCat:"all",
  }
};

function setBusy(on, text){
  const dot = $("#saveDot");
  const label = $("#saveText");
  dot.classList.remove("ok","busy","bad");
  dot.classList.add(on ? "busy" : "ok");
  label.textContent = text || (on ? "Dolgozom..." : "Kész");
}

function setError(text){
  const dot = $("#saveDot");
  const label = $("#saveText");
  dot.classList.remove("ok","busy");
  dot.classList.add("bad");
  label.textContent = text || "Hiba";
}

function todayISO(){
  const d = new Date();
  const yyyy=d.getFullYear();
  const mm=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function uid(prefix){
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function norm(s){
  return (s||"").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function fmtFt(n){
  return Number(n||0).toLocaleString("hu-HU") + " Ft";
}

function cfg(){
  return {
    owner: $("#ghOwner").value.trim(),
    repo: $("#ghRepo").value.trim(),
    branch: ($("#ghBranch").value.trim()||"main"),
    token: $("#ghToken").value.trim(),
  };
}

function loadCfg(){
  $("#ghOwner").value = localStorage.getItem(LS.owner)||"";
  $("#ghRepo").value  = localStorage.getItem(LS.repo)||"";
  $("#ghBranch").value= localStorage.getItem(LS.branch)||"main";
  $("#ghToken").value = localStorage.getItem(LS.token)||"";
}
function saveCfg(){
  const c = cfg();
  localStorage.setItem(LS.owner,c.owner);
  localStorage.setItem(LS.repo,c.repo);
  localStorage.setItem(LS.branch,c.branch);
  localStorage.setItem(LS.token,c.token);
}

function getCat(id){
  return state.productsDoc.categories.find(c=>String(c.id)===String(id))||null;
}
function catLabel(c){
  return (c?.label_hu||c?.id||"");
}
function calcPrice(product){
  const override = (product.price!==undefined ? product.price : product.priceOverride);
  if(override !== null && override !== "" && override !== undefined){
    const v = Number(override);
    if(Number.isFinite(v)) return v;
  }
  const c = getCat(product.categoryId);
  const dv = c ? Number(c.defaultPrice||0) : 0;
  return Number.isFinite(dv) ? dv : 0;
}

function normalizeDocs(){
  if(!state.productsDoc || typeof state.productsDoc!=="object") state.productsDoc={categories:[],products:[]};
  if(Array.isArray(state.productsDoc)){
    state.productsDoc = { updatedAt:null, categories:[], products:state.productsDoc };
  }
  if(!Array.isArray(state.productsDoc.categories)) state.productsDoc.categories=[];
  if(!Array.isArray(state.productsDoc.products)) state.productsDoc.products=[];
  if(!Array.isArray(state.sales)) state.sales=[];

  state.productsDoc.categories = state.productsDoc.categories
    .filter(c=>c && c.id && c.id!=="all" && c.id!=="soon")
    .map(c=>({
      id:String(c.id),
      label_hu:c.label_hu||c.id,
      label_en:c.label_en||c.label_hu||c.id,
      defaultPrice: Number(c.defaultPrice||0)
    }));

  state.productsDoc.products = state.productsDoc.products.map(p=>({
    ...p,
    id: String(p.id||uid("p")),
    categoryId: String(p.categoryId||""),
    status: (p.status==="ok"||p.status==="out"||p.status==="soon") ? p.status : "ok",
    stock: Math.max(0, Number(p.stock||0)),
    // price lehet null => kategória ár
    price: (p.price===null || p.price===undefined || p.price==="") ? null : Math.max(0, Number(p.price||0)),
  }));

  state.sales = state.sales.map(s=>({
    ...s,
    id: String(s.id||uid("s")),
    date: (s.date||"").slice(0,10),
    name: s.name || "",
    payment: s.payment || "",
    items: Array.isArray(s.items) ? s.items.map(it=>({
      productId: String(it.productId||""),
      qty: Math.max(1, Number(it.qty||1)),
      unitPrice: Math.max(0, Number(it.unitPrice||0))
    })) : []
  }));
}

async function loadData(){
  saveCfg();
  setBusy(true,"Betöltés...");
  try{
    const c = cfg();
    if(c.token && c.owner && c.repo){
      const p = await ShadowGH.getFile({ token:c.token, owner:c.owner, repo:c.repo, branch:c.branch, path:"data/products.json" });
      const s = await ShadowGH.getFile({ token:c.token, owner:c.owner, repo:c.repo, branch:c.branch, path:"data/sales.json" });
      state.productsDoc = JSON.parse(p.content);
      state.sales = JSON.parse(s.content);
    }else{
      const v = Date.now();
      state.productsDoc = await (await fetch(`data/products.json?v=${v}`, { cache:"no-store" })).json();
      state.sales = await (await fetch(`data/sales.json?v=${v}`, { cache:"no-store" })).json();
    }
    normalizeDocs();
    state.loaded=true;

    hydrateFilters();
    renderAll();
    setBusy(false,"Kész");
  }catch(e){
    console.error(e);
    setError("Betöltés hiba: " + e.message);
  }
}

async function saveToGitHub(){
  if(!state.loaded){ setError("Előbb Betöltés"); return; }
  saveCfg();
  normalizeDocs();

  // updateAt → csak jelzés
  state.productsDoc.updatedAt = new Date().toISOString();

  const c = cfg();
  if(!(c.token && c.owner && c.repo)){
    setError("Nincs GH config");
    return;
  }

  setBusy(true,"Mentés...");
  try{
    const productsText = JSON.stringify(state.productsDoc, null, 2);
    const salesText = JSON.stringify(state.sales, null, 2);

    const pOld = await ShadowGH.getFile({ token:c.token, owner:c.owner, repo:c.repo, branch:c.branch, path:"data/products.json" });
    const sOld = await ShadowGH.getFile({ token:c.token, owner:c.owner, repo:c.repo, branch:c.branch, path:"data/sales.json" });

    await ShadowGH.putFile({
      token:c.token, owner:c.owner, repo:c.repo, branch:c.branch,
      path:"data/products.json",
      message:"Update products.json",
      content: productsText,
      sha: pOld.sha
    });

    await ShadowGH.putFile({
      token:c.token, owner:c.owner, repo:c.repo, branch:c.branch,
      path:"data/sales.json",
      message:"Update sales.json",
      content: salesText,
      sha: sOld.sha
    });

    // mentés után auto reload + friss betöltés
    setBusy(false,"Mentve ✅ Reload...");
    await loadData(); // azonnal visszahúzza és renderel
  }catch(e){
    console.error(e);
    setError("Mentés hiba: " + e.message);
  }
}

function switchTab(tab){
  state.ui.tab = tab;
  const tabs = ["products","categories","sales","chart","settings"];
  for(const t of tabs){
    $(`#tabBtn_${t}`).classList.toggle("active", t===tab);
    $(`#tab_${t}`).style.display = (t===tab) ? "" : "none";
  }
  if(tab==="chart") drawChart();
}

function hydrateFilters(){
  const cats = state.productsDoc.categories;

  const makeOptions = (includeAll=true)=>{
    const opts = [];
    if(includeAll) opts.push(`<option value="all">Összes</option>`);
    for(const c of cats){
      opts.push(`<option value="${escapeAttr(c.id)}">${escapeHtml(catLabel(c))}</option>`);
    }
    return opts.join("");
  };

  $("#prodCatFilter").innerHTML = makeOptions(true);
  $("#saleCatFilter").innerHTML = makeOptions(true);
  $("#chartCatFilter").innerHTML = makeOptions(true);

  $("#prodCatFilter").value = state.ui.prodCat;
  $("#saleCatFilter").value = state.ui.saleCat;
  $("#chartCatFilter").value = state.ui.chartCat;
}

function productName(p){
  return (p.name_hu||p.name_en||"");
}
function productFlavor(p){
  return (p.flavor_hu||p.flavor_en||"");
}

function renderProducts(){
  const tbody = $("#productsTable tbody");
  tbody.innerHTML = "";

  const catFilter = $("#prodCatFilter").value;
  const q = norm($("#prodSearch").value);

  // list: out mindig hátul + name group együtt
  let list = [...state.productsDoc.products];

  if(catFilter!=="all"){
    list = list.filter(p=>String(p.categoryId)===String(catFilter));
  }
  if(q){
    list = list.filter(p=>{
      const hay = norm(productName(p))+" "+norm(productFlavor(p));
      return hay.includes(q);
    });
  }

  // group + out last
  const groups = new Map();
  for(const p of list){
    const key = norm(productName(p));
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const groupArr = [...groups.entries()].map(([k, items])=>{
    const hasAvail = items.some(x=>{
      const st=(x.status||"ok");
      const stock=Math.max(0,Number(x.stock||0));
      return st!=="soon" && st!=="out" && stock>0;
    });
    return { key:k, items, hasAvail };
  });

  groupArr.sort((a,b)=>{
    if(a.hasAvail!==b.hasAvail) return a.hasAvail?-1:1;
    return a.key.localeCompare(b.key,"hu");
  });

  const sorted = [];
  for(const g of groupArr){
    g.items.sort((a,b)=>{
      const ra=((a.status||"ok")==="out" || Number(a.stock||0)<=0) ? 1 : 0;
      const rb=((b.status||"ok")==="out" || Number(b.stock||0)<=0) ? 1 : 0;
      if(ra!==rb) return ra-rb;
      return norm(productFlavor(a)).localeCompare(norm(productFlavor(b)));
    });
    sorted.push(...g.items);
  }

  for(const p of sorted){
    const c = getCat(p.categoryId);
    const price = calcPrice(p);
    const priceLabel = (p.price===null) ? `${fmtFt(price)} (kategória)` : fmtFt(price);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(productName(p))}</td>
      <td>${escapeHtml(productFlavor(p))}</td>
      <td>${escapeHtml(c ? catLabel(c) : "—")}</td>
      <td>${escapeHtml(priceLabel)}</td>
      <td>${p.status==="soon" ? "—" : String(Math.max(0,Number(p.stock||0)))}</td>
      <td>${escapeHtml(p.status||"ok")}</td>
      <td style="text-align:right;"></td>
    `;

    const btnBox = document.createElement("div");
    btnBox.style.display="flex";
    btnBox.style.gap="8px";
    btnBox.style.justifyContent="flex-end";

    const edit = document.createElement("button");
    edit.className="ghost";
    edit.type="button";
    edit.textContent="Szerkeszt";
    edit.onclick=()=> openProductEditor(p.id);

    const del = document.createElement("button");
    del.className="danger";
    del.type="button";
    del.textContent="Töröl";
    del.onclick=()=>{
      // ne törölj, ha eladásban benne van
      const used = state.sales.some(s => (s.items||[]).some(it=>it.productId===p.id));
      if(used){ alert("Ez szerepel eladásokban. Előbb töröld az eladást."); return; }
      state.productsDoc.products = state.productsDoc.products.filter(x=>x.id!==p.id);
      renderProducts();
      renderSales();
      drawChart();
    };

    btnBox.appendChild(edit);
    btnBox.appendChild(del);
    tr.lastElementChild.appendChild(btnBox);

    tbody.appendChild(tr);
  }
}

function renderCategories(){
  const tbody = $("#categoriesTable tbody");
  tbody.innerHTML = "";
  const cats = [...state.productsDoc.categories].sort((a,b)=>catLabel(a).localeCompare(catLabel(b),"hu"));

  for(const c of cats){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.id)}</td>
      <td><input data-id="${escapeAttr(c.id)}" data-k="label_hu" value="${escapeAttr(c.label_hu||"")}" /></td>
      <td><input data-id="${escapeAttr(c.id)}" data-k="label_en" value="${escapeAttr(c.label_en||"")}" /></td>
      <td><input data-id="${escapeAttr(c.id)}" data-k="defaultPrice" type="number" min="0" value="${escapeAttr(String(Number(c.defaultPrice||0)))}" /></td>
      <td style="text-align:right;"><button class="danger" type="button" data-del="${escapeAttr(c.id)}">Töröl</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("input").forEach(inp=>{
    inp.addEventListener("input", ()=>{
      const id = inp.getAttribute("data-id");
      const k = inp.getAttribute("data-k");
      const c = getCat(id);
      if(!c) return;
      if(k==="defaultPrice") c.defaultPrice = Math.max(0, Number(inp.value||0));
      else c[k] = inp.value;
    });
  });

  tbody.querySelectorAll("button[data-del]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-del");
      const used = state.productsDoc.products.some(p=>String(p.categoryId)===String(id));
      if(used){ alert("Ezt használják termékek. Előbb állítsd át őket."); return; }
      state.productsDoc.categories = state.productsDoc.categories.filter(c=>c.id!==id);
      hydrateFilters();
      renderCategories();
      renderProducts();
      renderSales();
      drawChart();
    };
  });
}

function saleTotal(s, catId="all"){
  if(catId==="all"){
    return (s.items||[]).reduce((a,it)=>a + it.qty*it.unitPrice, 0);
  }
  const prodMap = new Map(state.productsDoc.products.map(p=>[p.id,p]));
  return (s.items||[]).reduce((a,it)=>{
    const p = prodMap.get(it.productId);
    if(!p) return a;
    if(String(p.categoryId)!==String(catId)) return a;
    return a + it.qty*it.unitPrice;
  }, 0);
}

function saleQty(s, catId="all"){
  const prodMap = new Map(state.productsDoc.products.map(p=>[p.id,p]));
  return (s.items||[]).reduce((a,it)=>{
    if(catId==="all") return a + it.qty;
    const p = prodMap.get(it.productId);
    if(!p) return a;
    if(String(p.categoryId)!==String(catId)) return a;
    return a + it.qty;
  }, 0);
}

function salesFiltered(){
  const catFilter = $("#saleCatFilter").value;
  const q = norm($("#saleSearch").value);
  const prodMap = new Map(state.productsDoc.products.map(p=>[p.id,p]));

  let list = [...state.sales];

  if(catFilter!=="all"){
    list = list.filter(s=>{
      return (s.items||[]).some(it=>{
        const p = prodMap.get(it.productId);
        return p && String(p.categoryId)===String(catFilter);
      });
    });
  }

  if(q){
    list = list.filter(s=>{
      const hay = norm(s.name)+" "+norm(s.payment);
      return hay.includes(q);
    });
  }

  list.sort((a,b)=> String(b.date||"").localeCompare(String(a.date||"")));
  return list;
}

function renderSales(){
  const tbody = $("#salesTable tbody");
  tbody.innerHTML = "";

  const catFilter = $("#saleCatFilter").value;
  const prodMap = new Map(state.productsDoc.products.map(p=>[p.id,p]));

  const list = salesFiltered();
  for(const s of list){
    const itemsTxt = (s.items||[]).map(it=>{
      const p = prodMap.get(it.productId);
      const nm = p ? (productName(p) + (productFlavor(p) ? ` (${productFlavor(p)})` : "")) : "??";
      return `${nm} ×${it.qty}`;
    }).join(" • ");

    const total = saleTotal(s, catFilter);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.date||"")}</td>
      <td>${escapeHtml(s.name||"")}</td>
      <td>${escapeHtml(s.payment||"")}</td>
      <td>${escapeHtml(itemsTxt||"—")}</td>
      <td>${escapeHtml(fmtFt(total))}</td>
      <td style="text-align:right;"></td>
    `;

    const btnBox = document.createElement("div");
    btnBox.style.display="flex";
    btnBox.style.gap="8px";
    btnBox.style.justifyContent="flex-end";

    const del = document.createElement("button");
    del.className="danger";
    del.type="button";
    del.textContent="Töröl (rollback)";
    del.onclick=()=> deleteSaleWithRollback(s.id);

    btnBox.appendChild(del);
    tr.lastElementChild.appendChild(btnBox);
    tbody.appendChild(tr);
  }

  // KPI
  const cat = $("#saleCatFilter").value;
  const totalRev = list.reduce((a,s)=>a + saleTotal(s, cat), 0);
  const totalQty = list.reduce((a,s)=>a + saleQty(s, cat), 0);
  const salesCount = (cat==="all") ? list.length : list.filter(s=>saleQty(s, cat)>0).length;

  $("#kpiRev").textContent = fmtFt(totalRev);
  $("#kpiQty").textContent = String(totalQty);
  $("#kpiSales").textContent = String(salesCount);

  drawChart();
}

function deleteSaleWithRollback(id){
  const idx = state.sales.findIndex(s=>s.id===id);
  if(idx<0) return;

  const sale = state.sales[idx];
  const prodMap = new Map(state.productsDoc.products.map(p=>[p.id,p]));

  // rollback stock
  for(const it of (sale.items||[])){
    const p = prodMap.get(it.productId);
    if(!p) continue;
    if((p.status||"ok")==="soon") continue; // soon-t úgyse árultuk
    p.stock = Math.max(0, Number(p.stock||0) + Number(it.qty||0));
    // ha visszakap stockot és out volt, menjen vissza ok-ra
    if(p.stock>0 && p.status==="out") p.status="ok";
  }

  state.sales.splice(idx,1);

  // azonnali UI frissítés (ne “lassan”)
  renderProducts();
  renderSales();
  drawChart();
}

function openProductEditor(productId){
  const p = state.productsDoc.products.find(x=>x.id===productId);
  if(!p) return;

  const cats = [...state.productsDoc.categories].sort((a,b)=>catLabel(a).localeCompare(catLabel(b),"hu"));
  const catOptions = cats.map(c=>`<option value="${escapeAttr(c.id)}"${String(p.categoryId)===String(c.id)?" selected":""}>${escapeHtml(catLabel(c))}</option>`).join("");

  const html = `
    <div class="panel" style="margin-top:0;">
      <div class="form-grid">
        <div class="field">
          <label>Név (HU)</label>
          <input id="e_name_hu" value="${escapeAttr(p.name_hu||"")}" />
        </div>
        <div class="field">
          <label>Név (EN)</label>
          <input id="e_name_en" value="${escapeAttr(p.name_en||"")}" />
        </div>
        <div class="field">
          <label>Íz (HU)</label>
          <input id="e_flavor_hu" value="${escapeAttr(p.flavor_hu||"")}" />
        </div>
        <div class="field">
          <label>Íz (EN)</label>
          <input id="e_flavor_en" value="${escapeAttr(p.flavor_en||"")}" />
        </div>
        <div class="field">
          <label>Kategória</label>
          <select id="e_cat">${catOptions}</select>
        </div>
        <div class="field">
          <label>Status</label>
          <select id="e_status">
            <option value="ok"${p.status==="ok"?" selected":""}>ok</option>
            <option value="out"${p.status==="out"?" selected":""}>out</option>
            <option value="soon"${p.status==="soon"?" selected":""}>soon</option>
          </select>
        </div>
        <div class="field">
          <label>Készlet</label>
          <input id="e_stock" type="number" min="0" value="${escapeAttr(String(Math.max(0,Number(p.stock||0))))}" />
        </div>
        <div class="field">
          <label>Ár (Ft) — hagyd üresen: kategória ár</label>
          <input id="e_price" type="number" min="0" value="${p.price===null ? "" : escapeAttr(String(Number(p.price||0)))}" placeholder="(kategória ár)" />
        </div>
        <div class="field full">
          <label>Kép URL (1000×1000 oké)</label>
          <input id="e_image" value="${escapeAttr(p.image||"")}" placeholder="https://..." />
        </div>
      </div>
      <div class="actions">
        <button class="primary" id="e_save" type="button">Mentés</button>
        <button class="danger" id="e_close" type="button">Bezár</button>
      </div>
      <div class="small-muted">Out → mindenhol hátul lesz • Soon → csak Hamarosan tabban</div>
    </div>
  `;

  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.style.display="flex";
  modal.innerHTML = `<div class="modal fade-in"></div>`;
  modal.querySelector(".modal").appendChild(wrap);
  document.body.appendChild(modal);

  const close = ()=> modal.remove();

  wrap.querySelector("#e_close").onclick = close;

  wrap.querySelector("#e_save").onclick = ()=>{
    p.name_hu = wrap.querySelector("#e_name_hu").value.trim();
    p.name_en = wrap.querySelector("#e_name_en").value.trim();
    p.flavor_hu = wrap.querySelector("#e_flavor_hu").value.trim();
    p.flavor_en = wrap.querySelector("#e_flavor_en").value.trim();
    p.categoryId = wrap.querySelector("#e_cat").value;
    p.status = wrap.querySelector("#e_status").value; // BUGFIX: ez eddig sokszor nem ment át
    p.stock = Math.max(0, Number(wrap.querySelector("#e_stock").value||0));
    const priceVal = wrap.querySelector("#e_price").value;
    p.price = (priceVal===null || priceVal===undefined || String(priceVal).trim()==="") ? null : Math.max(0, Number(priceVal||0));
    p.image = wrap.querySelector("#e_image").value.trim();

    // ha stock=0 és ok volt, engedjük out-ra automatikusan (de ha te kézzel ok-on hagyod, akkor marad)
    if(p.status==="ok" && p.stock<=0) p.status="out";

    renderProducts();
    renderSales();
    drawChart();
    close();
  };
}

function addProduct(){
  const cats = [...state.productsDoc.categories];
  const firstCat = cats[0]?.id || "";
  state.productsDoc.products.push({
    id: uid("p"),
    categoryId: String(firstCat),
    status: "ok",
    stock: 0,
    price: null, // kategória ár
    image: "",
    name_hu: "",
    name_en: "",
    flavor_hu: "",
    flavor_en: "",
  });
  renderProducts();
  openProductEditor(state.productsDoc.products[state.productsDoc.products.length-1].id);
}

function addCategory(){
  const id = prompt("Kategória ID (pl. elf, solo) ?");
  if(!id) return;
  if(state.productsDoc.categories.some(c=>c.id===id)){ alert("Már van ilyen ID"); return; }
  state.productsDoc.categories.push({
    id:String(id),
    label_hu:String(id),
    label_en:String(id),
    defaultPrice: 0
  });
  hydrateFilters();
  renderCategories();
  renderProducts();
  renderSales();
  drawChart();
}

function openSaleEditor(){
  const prodMap = new Map(state.productsDoc.products.map(p=>[p.id,p]));
  const productsSellable = state.productsDoc.products.filter(p=>(p.status||"ok")!=="soon");

  if(!productsSellable.length){
    alert("Nincs eladható termék (soon nem eladható).");
    return;
  }

  const modal = document.createElement("div");
  modal.className="modal-backdrop";
  modal.style.display="flex";
  modal.innerHTML = `<div class="modal fade-in"></div>`;
  document.body.appendChild(modal);

  const body = document.createElement("div");
  body.innerHTML = `
    <h2>Új eladás</h2>
    <p>Adj meg több tételt is. Mentéskor azonnal levonja a stockot.</p>

    <div class="form-grid">
      <div class="field">
        <label>Név (pl. vevő / megjegyzés)</label>
        <input id="s_name" placeholder="pl. Zoli" />
      </div>
      <div class="field">
        <label>Vásárlás módja (bármi)</label>
        <input id="s_pay" placeholder="KP / Revolut / FOXPOST..." />
      </div>
      <div class="field">
        <label>Dátum (YYYY-MM-DD)</label>
        <input id="s_date" value="${todayISO()}" />
      </div>
      <div class="field">
        <label>Szűrés tételhez (kategória)</label>
        <select id="s_cat"></select>
      </div>
      <div class="field full">
        <label>Tételek</label>
        <div id="items"></div>
      </div>
    </div>

    <div class="actions">
      <button class="ghost" id="addItemBtn" type="button">+ Tétel</button>
      <button class="primary" id="saveSaleBtn" type="button">Mentés</button>
      <button class="danger" id="closeSaleBtn" type="button">Bezár</button>
    </div>
  `;
  modal.querySelector(".modal").appendChild(body);

  const catSel = body.querySelector("#s_cat");
  catSel.innerHTML = `<option value="all">Összes</option>` + state.productsDoc.categories
    .map(c=>`<option value="${escapeAttr(c.id)}">${escapeHtml(catLabel(c))}</option>`).join("");

  const itemsRoot = body.querySelector("#items");

  function productOptions(filterCat="all"){
    const list = (filterCat==="all")
      ? productsSellable
      : productsSellable.filter(p=>String(p.categoryId)===String(filterCat));
    return `<option value="">Válassz…</option>` + list.map(p=>{
      const name = productName(p);
      const flav = productFlavor(p);
      const stock = Math.max(0, Number(p.stock||0));
      const price = calcPrice(p);
      return `<option value="${escapeAttr(p.id)}">${escapeHtml(name)}${flav?` • ${escapeHtml(flav)}`:""} (stock:${stock}) (${price}Ft)</option>`;
    }).join("");
  }

  function addItemRow(){
    const row = document.createElement("div");
    row.className="rowline";
    row.innerHTML = `
      <div class="left" style="flex:1;">
        <div class="small-muted">Termék</div>
        <select class="it_prod"></select>
      </div>
      <div class="left" style="width:110px;">
        <div class="small-muted">Db</div>
        <input class="it_qty" type="number" min="1" value="1" />
      </div>
      <div class="left" style="width:150px;">
        <div class="small-muted">Ár (Ft)</div>
        <input class="it_price" type="number" min="0" value="0" />
      </div>
      <div style="display:flex; align-items:flex-end;">
        <button class="danger it_del" type="button">X</button>
      </div>
    `;

    const sel = row.querySelector(".it_prod");
    const qty = row.querySelector(".it_qty");
    const pr  = row.querySelector(".it_price");

    sel.innerHTML = productOptions(catSel.value);

    sel.onchange = ()=>{
      const p = prodMap.get(sel.value);
      pr.value = String(p ? calcPrice(p) : 0);
    };

    row.querySelector(".it_del").onclick = ()=> row.remove();
    itemsRoot.appendChild(row);
  }

  catSel.onchange = ()=>{
    itemsRoot.querySelectorAll(".it_prod").forEach(sel=>{
      const cur = sel.value;
      sel.innerHTML = productOptions(catSel.value);
      // ha a régi termék nem látszik szűrésben, üres lesz
      if(cur && [...sel.options].some(o=>o.value===cur)) sel.value=cur;
    });
  };

  addItemRow();

  const close = ()=> modal.remove();

  body.querySelector("#closeSaleBtn").onclick = close;
  body.querySelector("#addItemBtn").onclick = addItemRow;

  body.querySelector("#saveSaleBtn").onclick = ()=>{
    const name = body.querySelector("#s_name").value.trim();
    const payment = body.querySelector("#s_pay").value.trim();
    const date = body.querySelector("#s_date").value.trim();

    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){
      alert("Dátum formátum: YYYY-MM-DD");
      return;
    }

    const rows = [...itemsRoot.children];
    const items = [];
    for(const r of rows){
      const pid = r.querySelector(".it_prod").value;
      const qty = Math.max(1, Number(r.querySelector(".it_qty").value||1));
      const unitPrice = Math.max(0, Number(r.querySelector(".it_price").value||0));
      if(!pid) continue;
      items.push({ productId: pid, qty, unitPrice });
    }
    if(!items.length){ alert("Adj hozzá legalább 1 tételt"); return; }

    // stock check
    for(const it of items){
      const p = prodMap.get(it.productId);
      if(!p){ alert("Ismeretlen termék"); return; }
      if((p.status||"ok")==="soon"){ alert("Soon terméket nem lehet eladni"); return; }
      const stock = Math.max(0, Number(p.stock||0));
      if(stock < it.qty){
        alert(`Nincs elég készlet: ${productName(p)} (stock: ${stock})`);
        return;
      }
    }

    // apply stock immediately (NE legyen lassú)
    for(const it of items){
      const p = prodMap.get(it.productId);
      p.stock = Math.max(0, Number(p.stock||0) - it.qty);
      if(p.stock<=0 && p.status==="ok") p.status="out";
    }

    state.sales.push({ id: uid("s"), date, name, payment, items });

    renderProducts();
    renderSales();
    drawChart();
    close();
  };
}

function revenueByDay(catId="all"){
  const prodMap = new Map(state.productsDoc.products.map(p=>[p.id,p]));
  const map = new Map(); // date -> {rev, cnt, qty}
  for(const s of state.sales){
    const date = (s.date||"");
    if(!map.has(date)) map.set(date, { rev:0, cnt:0, qty:0 });
    const row = map.get(date);

    if(catId==="all"){
      row.rev += saleTotal(s,"all");
      row.qty += saleQty(s,"all");
      row.cnt += 1;
    }else{
      const has = (s.items||[]).some(it=>{
        const p = prodMap.get(it.productId);
        return p && String(p.categoryId)===String(catId);
      });
      if(!has) continue;
      row.rev += saleTotal(s,catId);
      row.qty += saleQty(s,catId);
      row.cnt += 1; // kategóriás eladás count = sale contains that cat
    }
  }
  const arr = [...map.entries()]
    .filter(([d])=>d)
    .sort((a,b)=> String(a[0]).localeCompare(String(b[0])));
  return arr; // [date, {rev,cnt,qty}]
}

function drawChart(){
  const canvas = $("#revChart");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;

  ctx.clearRect(0,0,w,h);

  const cat = $("#chartCatFilter").value;
  const data = revenueByDay(cat);

  if(!data.length){
    $("#chartHint").textContent = "Nincs elég adat a diagramhoz.";
    return;
  }

  const dates = data.map(x=>x[0]);
  const revs  = data.map(x=>x[1].rev);
  const counts= data.map(x=>x[1].cnt);

  const maxRev = Math.max(...revs, 1);
  const maxCnt = Math.max(...counts, 1);

  const padL = 52, padR = 18, padT = 18, padB = 48;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  // axes
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT+chartH);
  ctx.lineTo(padL+chartW, padT+chartH);
  ctx.stroke();

  // bars revenue
  const n = data.length;
  const step = chartW / n;
  const barW = Math.max(6, step * 0.55);

  for(let i=0;i<n;i++){
    const x = padL + i*step + (step-barW)/2;
    const barH = (revs[i]/maxRev) * chartH;
    const y = padT + chartH - barH;

    // bar gradient-ish using alpha (no hard colors)
    ctx.fillStyle = "rgba(124,92,255,.42)";
    ctx.fillRect(x,y,barW,barH);

    ctx.strokeStyle = "rgba(40,215,255,.35)";
    ctx.strokeRect(x,y,barW,barH);
  }

  // line sales count
  ctx.strokeStyle = "rgba(40,215,255,.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for(let i=0;i<n;i++){
    const x = padL + i*step + step/2;
    const y = padT + chartH - ((counts[i]/maxCnt) * chartH);
    if(i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  }
  ctx.stroke();

  // dots
  ctx.fillStyle = "rgba(40,215,255,.95)";
  for(let i=0;i<n;i++){
    const x = padL + i*step + step/2;
    const y = padT + chartH - ((counts[i]/maxCnt) * chartH);
    ctx.beginPath();
    ctx.arc(x,y,3.2,0,Math.PI*2);
    ctx.fill();
  }

  // labels (simple)
  ctx.fillStyle = "rgba(232,238,252,.85)";
  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.fillText("Ft", 14, padT+12);
  ctx.fillText("#", 14, padT+26);

  // x labels (every ~3)
  ctx.fillStyle = "rgba(146,160,191,.9)";
  for(let i=0;i<n;i++){
    if(n>10 && i%3!==0) continue;
    const x = padL + i*step + step/2;
    const d = dates[i].slice(5); // MM-DD
    ctx.save();
    ctx.translate(x, padT+chartH+18);
    ctx.rotate(-0.35);
    ctx.fillText(d, -14, 0);
    ctx.restore();
  }

  const totalRev = revs.reduce((a,b)=>a+b,0);
  const totalCnt = counts.reduce((a,b)=>a+b,0);
  $("#chartHint").textContent =
    `Szűrő: ${cat==="all"?"Összes":catLabel(getCat(cat))} • Napok: ${n} • Bevétel: ${fmtFt(totalRev)} • Eladások: ${totalCnt}`;
}

function renderAll(){
  if(!state.loaded) return;
  hydrateFilters();
  renderProducts();
  renderCategories();
  renderSales();
  drawChart();
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}
function escapeAttr(s){
  return escapeHtml(s).replace(/"/g,"&quot;");
}

/* --------- EVENTS --------- */
function bind(){
  $("#tabBtn_products").onclick = ()=> switchTab("products");
  $("#tabBtn_categories").onclick = ()=> switchTab("categories");
  $("#tabBtn_sales").onclick = ()=> switchTab("sales");
  $("#tabBtn_chart").onclick = ()=> switchTab("chart");
  $("#tabBtn_settings").onclick = ()=> switchTab("settings");

  $("#loadBtn").onclick = loadData;
  $("#saveBtn").onclick = saveToGitHub;

  $("#saveBtnTop").onclick = saveToGitHub;
  $("#saveBtnCats").onclick = saveToGitHub;
  $("#saveBtnSales").onclick = saveToGitHub;

  $("#addProductBtn").onclick = ()=> { if(!state.loaded) return alert("Előbb Betöltés"); addProduct(); };
  $("#addCategoryBtn").onclick = ()=> { if(!state.loaded) return alert("Előbb Betöltés"); addCategory(); };
  $("#addSaleBtn").onclick = ()=> { if(!state.loaded) return alert("Előbb Betöltés"); openSaleEditor(); };

  $("#prodCatFilter").onchange = ()=> renderProducts();
  $("#prodSearch").addEventListener("input", ()=> renderProducts());

  $("#saleCatFilter").onchange = ()=> renderSales();
  $("#saleSearch").addEventListener("input", ()=> renderSales());

  $("#chartCatFilter").onchange = ()=> drawChart();

  // autosave cfg
  ["#ghOwner","#ghRepo","#ghBranch","#ghToken"].forEach(id=>{
    $(id).addEventListener("input", saveCfg);
  });
}

loadCfg();
bind();
// ajánlott: admin nyitáskor auto betöltés (hogy ne “semmit se csinál” érzés legyen)
loadData();
