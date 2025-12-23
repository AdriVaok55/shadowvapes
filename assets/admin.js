(() => {
  const $ = (s) => document.querySelector(s);

  const LS = {
    owner: "sv_gh_owner",
    repo: "sv_gh_repo",
    branch: "sv_gh_branch",
    token: "sv_gh_token",
    useRaw: "sv_use_raw" // public gyorsítás
  };

  const ui = {
    statusDot: () => document.querySelector(".dot"),
    statusText: () => document.querySelector(".save-ind span") || document.querySelector(".save-ind") // ha van
  };

  const state = {
    productsDoc: { categories: [], products: [] },
    sales: [],
    loaded: false,
    saving: false,
    dirty: false,

    tab: "products",
    productCatFilter: "all",
    salesCatFilter: "all",
    chartCatFilter: "all",
  };

  // ---------- modal (nem prompt) ----------
  const modal = {
    backdrop: () => $("#svModalBackdrop"),
    title: () => $("#svModalTitle"),
    sub: () => $("#svModalSub"),
    body: () => $("#svModalBody"),
    ok: () => $("#svModalOk"),
    cancel: () => $("#svModalCancel"),
    open({title, sub, bodyEl, okText="OK", cancelText="Mégse", onOk, onCancel}){
      const bd = modal.backdrop();
      if(!bd) return alert(title || "Modal missing");
      modal.title().textContent = title || "";
      modal.sub().textContent = sub || "";
      const body = modal.body();
      body.innerHTML = "";
      if(bodyEl) body.appendChild(bodyEl);

      modal.ok().textContent = okText;
      modal.cancel().textContent = cancelText;

      bd.classList.add("show");

      const close = () => bd.classList.remove("show");
      modal.cancel().onclick = () => { close(); onCancel && onCancel(); };
      modal.ok().onclick = () => { onOk && onOk(close); };
      bd.onclick = (e) => { if(e.target === bd) { close(); onCancel && onCancel(); } };
    }
  };

  // ---------- helpers ----------
  function clean(s){ return (s||"").toString().trim(); }
  function todayISO(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }
  function uid(prefix){
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }
  function fmt(n){
    const v = Number(n||0);
    return (Number.isFinite(v) ? v : 0).toLocaleString("hu-HU");
  }
  function norm(s){
    return (s||"").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  }

  function setStatus(kind, text){
    const dot = ui.statusDot();
    if(dot){
      dot.classList.remove("ok","busy");
      if(kind === "ok") dot.classList.add("ok");
      if(kind === "busy") dot.classList.add("busy");
    }
    const t = ui.statusText();
    if(t) t.textContent = text || "";
  }

  function cfg(){
    // a te admin UI-dban valahogy vannak inputok (owner/repo/branch/token)
    // ha nálad más id-k vannak, át kell írni IDE.
    const owner = clean($("#ghOwner")?.value || localStorage.getItem(LS.owner) || "");
    const repo = clean($("#ghRepo")?.value || localStorage.getItem(LS.repo) || "");
    const branch = clean($("#ghBranch")?.value || localStorage.getItem(LS.branch) || "main") || "main";
    const token = clean($("#ghToken")?.value || localStorage.getItem(LS.token) || "");
    return { owner, repo, branch, token };
  }

  function saveCfgToLS(){
    const c = cfg();
    localStorage.setItem(LS.owner, c.owner);
    localStorage.setItem(LS.repo, c.repo);
    localStorage.setItem(LS.branch, c.branch);
    localStorage.setItem(LS.token, c.token);

    // public gyorsítás default: bekapcs
    if(!localStorage.getItem(LS.useRaw)) localStorage.setItem(LS.useRaw, "1");
  }

  function ensureDoc(){
    if(Array.isArray(state.productsDoc)){
      state.productsDoc = { categories: [], products: state.productsDoc };
    }
    if(!state.productsDoc.categories) state.productsDoc.categories = [];
    if(!state.productsDoc.products) state.productsDoc.products = [];
    if(!Array.isArray(state.sales)) state.sales = [];
  }

  function catById(id){
    return state.productsDoc.categories.find(c => String(c.id) === String(id));
  }
  function catsOrdered(){
    const cats = [...(state.productsDoc.categories || [])].filter(c=>c && c.id);
    cats.sort((a,b)=> (a.label_hu||a.id).localeCompare((b.label_hu||b.id), "hu"));
    return cats;
  }
  function resolvedPrice(p){
    const pv = Number(p.price);
    if(Number.isFinite(pv) && pv > 0) return pv;
    const c = catById(p.categoryId);
    const cv = c ? Number(c.basePrice) : 0;
    return Number.isFinite(cv) ? cv : 0;
  }
  function isOut(p){
    const st = (p.status || "ok");
    const stock = Number(p.stock||0);
    return st === "out" || (Number.isFinite(stock) && stock <= 0);
  }

  // ---------- load/save ----------
  async function loadData(){
    try{
      saveCfgToLS();
      const { owner, repo, branch, token } = cfg();

      // ha nincs token, akkor local fetch (dev)
      if(token && owner && repo){
        setStatus("busy","Betöltés...");
        const p = await ShadowGH.getFile({ token, owner, repo, branch, path: "data/products.json" });
        const s = await ShadowGH.getFile({ token, owner, repo, branch, path: "data/sales.json" });
        state.productsDoc = JSON.parse(p.content);
        state.sales = JSON.parse(s.content);
      }else{
        const v = Date.now();
        state.productsDoc = await (await fetch(`data/products.json?v=${v}`, { cache:"no-store" })).json();
        state.sales = await (await fetch(`data/sales.json?v=${v}`, { cache:"no-store" })).json();
      }

      ensureDoc();
      // sanitize categories
      state.productsDoc.categories = state.productsDoc.categories.map(c => ({
        id: String(c.id),
        label_hu: c.label_hu || c.id,
        label_en: c.label_en || c.label_hu || c.id,
        basePrice: Number(c.basePrice||0)
      }));

      // sanitize products
      state.productsDoc.products = state.productsDoc.products.map(p => ({
        ...p,
        id: String(p.id),
        categoryId: String(p.categoryId||""),
        status: (p.status==="soon"||p.status==="out"||p.status==="ok") ? p.status : "ok",
        stock: Math.max(0, Number(p.stock||0)),
        price: (p.price==="" || p.price==null) ? null : Number(p.price||0),
      }));

      // sanitize sales
      state.sales = (state.sales || []).map(s => ({
        id: String(s.id || uid("s")),
        date: String(s.date || todayISO()).slice(0,10),
        name: s.name || "",
        method: s.method || "",
        items: Array.isArray(s.items) ? s.items.map(it => ({
          productId: String(it.productId),
          qty: Math.max(1, Number(it.qty||1)),
          unitPrice: Math.max(0, Number(it.unitPrice||0))
        })) : []
      }));

      state.loaded = true;
      state.dirty = false;
      setStatus("ok","Kész");
      renderAll();
    }catch(e){
      console.error(e);
      setStatus("", "Hiba");
      alert("Betöltés hiba: " + e.message + "\n\nTipp: branch = main (ne legyen szóköz/enter).");
    }
  }

  async function saveData(){
    if(!state.loaded) return;
    if(state.saving) return;

    saveCfgToLS();
    const { owner, repo, branch, token } = cfg();

    const productsText = JSON.stringify(state.productsDoc, null, 2);
    const salesText = JSON.stringify(state.sales, null, 2);

    try{
      state.saving = true;
      setStatus("busy","Mentés...");

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
      }else{
        // offline fallback: letöltés
        download("products.json", productsText);
        download("sales.json", salesText);
      }

      state.dirty = false;
      setStatus("ok","Mentve ✅");

      // mentés után automatikus újratöltés (AHOGY KÉRTED)
      await loadData();

    }catch(e){
      console.error(e);
      setStatus("", "Mentés hiba");
      alert("Mentés hiba: " + e.message);
    }finally{
      state.saving = false;
    }
  }

  function download(name, content){
    const blob = new Blob([content], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }

  // autosave debounce
  let saveTimer = null;
  function markDirty(){
    state.dirty = true;
    setStatus("busy","Módosítva… mentés...");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(()=>saveData(), 900);
  }

  // ---------- render switches (a te adminodban tab gombok vannak) ----------
  function setTab(tab){
    state.tab = tab;
    // itt a te UI-dtól függ: melyik panel látszik. Nálad vannak tab gombok.
    // A legegyszerűbb: minden panel kap data-tab attributumot.
    document.querySelectorAll("[data-tab]").forEach(el=>{
      el.style.display = (el.getAttribute("data-tab") === tab) ? "" : "none";
    });
    document.querySelectorAll("[data-tabbtn]").forEach(btn=>{
      btn.classList.toggle("active", btn.getAttribute("data-tabbtn") === tab);
    });
  }

  // ---------- UI blocks ----------
  function renderAll(){
    renderCategoryTable();
    renderProductsTable();
    renderSalesTable();
    renderChart();
    renderFilters();
  }

  function renderFilters(){
    // product filter select
    const pSel = $("#productCatFilter");
    const sSel = $("#salesCatFilter");
    const cSel = $("#chartCatFilter");

    const opts = [`<option value="all">Összes</option>`]
      .concat(catsOrdered().map(c => `<option value="${c.id}">${escape(c.label_hu||c.id)}</option>`))
      .join("");

    if(pSel){ pSel.innerHTML = opts; pSel.value = state.productCatFilter; }
    if(sSel){ sSel.innerHTML = opts; sSel.value = state.salesCatFilter; }
    if(cSel){ cSel.innerHTML = opts; cSel.value = state.chartCatFilter; }
  }

  function escape(s){
    return String(s||"").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
  }

  // ---------- Categories (with basePrice) ----------
  function renderCategoryTable(){
    const root = $("#categoriesTable");
    if(!root) return;

    // elvárt oszlopok: ID / HU / EN / Alap ár / törlés
    const rows = catsOrdered().map(c => `
      <tr>
        <td><b>${escape(c.id)}</b></td>
        <td><input data-cat="${escape(c.id)}" data-k="label_hu" value="${escape(c.label_hu||"")}" /></td>
        <td><input data-cat="${escape(c.id)}" data-k="label_en" value="${escape(c.label_en||"")}" /></td>
        <td><input type="number" min="0" data-cat="${escape(c.id)}" data-k="basePrice" value="${Number(c.basePrice||0)}" /></td>
        <td><button class="danger" data-delcat="${escape(c.id)}">Töröl</button></td>
      </tr>
    `).join("");

    root.innerHTML = `
      <div class="small-muted">Tipp: ha a terméknél az ár üres / null → a kategória alap ára megy.</div>
      <table class="table">
        <thead>
          <tr><th>ID</th><th>HU</th><th>EN</th><th>Alap ár (Ft)</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="actions">
        <button class="ghost" id="addCategoryBtn">+ Kategória</button>
      </div>
    `;

    // bind inputs autosave
    root.querySelectorAll("input[data-cat]").forEach(inp=>{
      inp.addEventListener("input", ()=>{
        const id = inp.getAttribute("data-cat");
        const k = inp.getAttribute("data-k");
        const c = catById(id);
        if(!c) return;
        if(k === "basePrice") c.basePrice = Math.max(0, Number(inp.value||0));
        else c[k] = inp.value;
        markDirty();
      });
    });

    root.querySelectorAll("button[data-delcat]").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.getAttribute("data-delcat");
        const used = state.productsDoc.products.some(p=>String(p.categoryId)===String(id));
        if(used) return alert("Ezt használják termékek. Előbb állítsd át őket.");
        state.productsDoc.categories = state.productsDoc.categories.filter(c=>String(c.id)!==String(id));
        markDirty();
        renderAll();
      };
    });

    $("#addCategoryBtn").onclick = () => {
      const body = document.createElement("div");
      body.innerHTML = `
        <div class="field full">
          <label>Kategória ID (pl. elf, solo)</label>
          <input id="newCatId" placeholder="elf" />
        </div>
        <div class="field third">
          <label>HU</label>
          <input id="newCatHu" placeholder="ELF" />
        </div>
        <div class="field third">
          <label>EN</label>
          <input id="newCatEn" placeholder="ELF" />
        </div>
        <div class="field third">
          <label>Alap ár (Ft)</label>
          <input id="newCatPrice" type="number" min="0" value="0" />
        </div>
      `;
      modal.open({
        title: "Új kategória",
        sub: "Szép modál, nem prompt 😄",
        bodyEl: body,
        okText: "Létrehozás",
        onOk: (close)=>{
          const id = clean(body.querySelector("#newCatId").value);
          if(!id) return alert("ID kell");
          if(state.productsDoc.categories.some(c=>String(c.id)===id)) return alert("Már létezik");
          state.productsDoc.categories.push({
            id,
            label_hu: clean(body.querySelector("#newCatHu").value) || id,
            label_en: clean(body.querySelector("#newCatEn").value) || clean(body.querySelector("#newCatHu").value) || id,
            basePrice: Math.max(0, Number(body.querySelector("#newCatPrice").value||0))
          });
          close();
          markDirty();
          renderAll();
        }
      });
    };
  }

  // ---------- Products ----------
  function renderProductsTable(){
    const root = $("#productsTable");
    if(!root) return;

    const cats = catsOrdered();
    const catOpts = cats.map(c=>`<option value="${c.id}">${escape(c.label_hu||c.id)}</option>`).join("");

    let list = [...state.productsDoc.products];

    // category filter
    if(state.productCatFilter !== "all"){
      list = list.filter(p=>String(p.categoryId)===String(state.productCatFilter));
    }

    // sort: group by name; sold out last globally
    const groups = new Map();
    for(const p of list){
      const key = norm(p.name_hu || p.name_en || "");
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }

    const gArr = [];
    for(const [k, items] of groups.entries()){
      items.sort((a,b)=>{
        const ra = isOut(a) ? 1 : 0;
        const rb = isOut(b) ? 1 : 0;
        if(ra !== rb) return ra - rb;
        return norm(a.flavor_hu||a.flavor_en||"").localeCompare(norm(b.flavor_hu||b.flavor_en||""), "hu");
      });
      const rank = items.some(x=>!isOut(x)) ? 0 : 1;
      gArr.push({ k, items, rank, name: items[0].name_hu || items[0].name_en || "" });
    }
    gArr.sort((a,b)=>{
      if(a.rank!==b.rank) return a.rank-b.rank;
      return norm(a.name).localeCompare(norm(b.name), "hu");
    });

    const sorted = gArr.flatMap(g=>g.items);

    const rows = sorted.map(p=>{
      const priceShow = (p.price==null || Number(p.price)<=0) ? `<span class="small-muted">kategória ár</span>` : `${fmt(p.price)} Ft`;
      return `
        <tr>
          <td><b>${escape(p.id)}</b></td>
          <td><input data-p="${escape(p.id)}" data-k="name_hu" value="${escape(p.name_hu||"")}" /></td>
          <td><input data-p="${escape(p.id)}" data-k="flavor_hu" value="${escape(p.flavor_hu||"")}" /></td>
          <td>
            <select data-p="${escape(p.id)}" data-k="categoryId">
              ${cats.map(c=>`<option value="${c.id}" ${String(p.categoryId)===String(c.id)?"selected":""}>${escape(c.label_hu||c.id)}</option>`).join("")}
            </select>
          </td>
          <td>
            <select data-p="${escape(p.id)}" data-k="status">
              <option value="ok" ${p.status==="ok"?"selected":""}>ok</option>
              <option value="out" ${p.status==="out"?"selected":""}>out</option>
              <option value="soon" ${p.status==="soon"?"selected":""}>soon</option>
            </select>
          </td>
          <td><input type="number" min="0" data-p="${escape(p.id)}" data-k="stock" value="${Number(p.stock||0)}" /></td>
          <td><input type="number" min="0" data-p="${escape(p.id)}" data-k="price" value="${p.price==null? "" : Number(p.price||0)}" placeholder="(üres = kategória ár)" /></td>
          <td><input data-p="${escape(p.id)}" data-k="image" value="${escape(p.image||"")}" placeholder="https://..." /></td>
          <td><button class="danger" data-delp="${escape(p.id)}">Töröl</button></td>
        </tr>
      `;
    }).join("");

    root.innerHTML = `
      <div class="rowline">
        <div class="left">
          <b>Termékek</b>
          <span class="small-muted">Szűrő + gyors szerkesztés. Elfogyott mindig leghátul.</span>
        </div>
        <div class="kpi">
          <div class="box">
            <div class="t">Termékek száma</div>
            <div class="v">${state.productsDoc.products.length}</div>
          </div>
        </div>
      </div>

      <div class="actions" style="align-items:center;">
        <label class="small-muted">Kategória szűrő:</label>
        <select id="productCatFilter" class="ghost" style="padding:10px 14px;">
          <option value="all">Összes</option>
          ${cats.map(c=>`<option value="${c.id}" ${state.productCatFilter===c.id?"selected":""}>${escape(c.label_hu||c.id)}</option>`).join("")}
        </select>
        <button class="ghost" id="addProductBtn">+ Termék</button>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>ID</th><th>Név (HU)</th><th>Íz (HU)</th><th>Kategória</th><th>Status</th><th>Készlet</th><th>Ár (Ft)</th><th>Kép</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    $("#productCatFilter").onchange = (e)=>{
      state.productCatFilter = e.target.value;
      renderProductsTable();
    };

    root.querySelectorAll("input[data-p], select[data-p]").forEach(el=>{
      el.addEventListener("input", ()=>{
        const id = el.getAttribute("data-p");
        const k = el.getAttribute("data-k");
        const p = state.productsDoc.products.find(x=>String(x.id)===String(id));
        if(!p) return;

        if(k === "stock") p.stock = Math.max(0, Number(el.value||0));
        else if(k === "price"){
          const v = clean(el.value);
          p.price = v === "" ? null : Math.max(0, Number(v||0));
        }
        else if(k === "status") p.status = el.value;
        else if(k === "categoryId") p.categoryId = el.value;
        else p[k] = el.value;

        // ha stock 0, legyen out (ha nem soon)
        if(p.status !== "soon" && Number(p.stock||0) <= 0) p.status = "out";

        markDirty();
        // instant refresh counts
        renderProductsTable();
      });
    });

    root.querySelectorAll("button[data-delp]").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.getAttribute("data-delp");
        const used = state.sales.some(s => (s.items||[]).some(it => String(it.productId)===String(id)));
        if(used) return alert("Ez szerepel eladásban. Előbb töröld az eladást.");
        state.productsDoc.products = state.productsDoc.products.filter(p=>String(p.id)!==String(id));
        markDirty();
        renderAll();
      };
    });

    $("#addProductBtn").onclick = ()=>{
      const body = document.createElement("div");
      body.innerHTML = `
        <div class="field full"><label>Név (HU)</label><input id="pName" /></div>
        <div class="field full"><label>Íz (HU)</label><input id="pFlavor" /></div>
        <div class="field third"><label>Kategória</label><select id="pCat">${catOpts}</select></div>
        <div class="field third"><label>Status</label>
          <select id="pStatus"><option value="ok">ok</option><option value="out">out</option><option value="soon">soon</option></select>
        </div>
        <div class="field third"><label>Készlet</label><input id="pStock" type="number" min="0" value="0" /></div>
        <div class="field third"><label>Ár (Ft) (üres = kategória)</label><input id="pPrice" type="number" min="0" placeholder="(üres)" /></div>
        <div class="field full"><label>Kép URL (1000×1000)</label><input id="pImg" placeholder="https://..." /></div>
      `;
      modal.open({
        title: "Új termék",
        sub: "Gyors felvitel (a többit utána is tudod editelni).",
        bodyEl: body,
        okText: "Létrehozás",
        onOk: (close)=>{
          const name_hu = clean(body.querySelector("#pName").value);
          if(!name_hu) return alert("Név kell");
          const p = {
            id: uid("p"),
            name_hu,
            flavor_hu: clean(body.querySelector("#pFlavor").value),
            name_en: "",
            flavor_en: "",
            categoryId: body.querySelector("#pCat").value,
            status: body.querySelector("#pStatus").value,
            stock: Math.max(0, Number(body.querySelector("#pStock").value||0)),
            price: clean(body.querySelector("#pPrice").value)==="" ? null : Math.max(0, Number(body.querySelector("#pPrice").value||0)),
            image: clean(body.querySelector("#pImg").value),
          };
          if(p.status !== "soon" && p.stock <= 0) p.status = "out";
          state.productsDoc.products.push(p);
          close();
          markDirty();
          renderAll();
        }
      });
    };
  }

  // ---------- Sales (name/date/method + multiple items + rollback) ----------
  function renderSalesTable(){
    const root = $("#salesTable");
    if(!root) return;

    const cats = catsOrdered();
    const prodById = new Map(state.productsDoc.products.map(p=>[String(p.id), p]));

    // filter sales by category (only show sales where at least one item in that category)
    let sales = [...state.sales].sort((a,b)=> String(b.date).localeCompare(String(a.date)));
    if(state.salesCatFilter !== "all"){
      sales = sales.filter(s => (s.items||[]).some(it => {
        const p = prodById.get(String(it.productId));
        return p && String(p.categoryId) === String(state.salesCatFilter);
      }));
    }

    const rows = sales.map(s=>{
      const itemsTxt = (s.items||[]).map(it=>{
        const p = prodById.get(String(it.productId));
        const nm = p ? (p.name_hu||p.name_en||"??") : "??";
        const fl = p ? (p.flavor_hu||p.flavor_en||"") : "";
        return `${nm}${fl?` (${fl})`:""} ×${it.qty}`;
      }).join(" • ");

      const totals = saleTotals(s, state.salesCatFilter);
      return `
        <tr>
          <td><b>${escape(s.date)}</b></td>
          <td>${escape(s.name||"")}</td>
          <td>${escape(s.method||"")}</td>
          <td>${escape(itemsTxt)}</td>
          <td><b>${fmt(totals.revenue)} Ft</b></td>
          <td><b>${totals.qty}</b></td>
          <td><button class="ghost" data-views="${escape(s.id)}">Megnéz</button></td>
          <td><button class="danger" data-dels="${escape(s.id)}">Töröl (rollback)</button></td>
        </tr>
      `;
    }).join("");

    // KPI
    const totalsAll = aggregateByDay(state.sales, "all");
    const totalsFiltered = aggregateByDay(state.sales, state.salesCatFilter);

    root.innerHTML = `
      <div class="rowline">
        <div class="left">
          <b>Eladások</b>
          <span class="small-muted">Törlés = rollback készlet + bevétel vissza. (Dátum csak YYYY-MM-DD)</span>
        </div>
        <div class="kpi">
          <div class="box">
            <div class="t">Eladások száma (szűrve)</div>
            <div class="v">${sales.length}</div>
          </div>
          <div class="box">
            <div class="t">Bevétel (szűrve)</div>
            <div class="v">${fmt(sumRevenue(state.sales, state.salesCatFilter))} Ft</div>
          </div>
        </div>
      </div>

      <div class="actions" style="align-items:center;">
        <label class="small-muted">Kategória szűrő:</label>
        <select id="salesCatFilter" class="ghost" style="padding:10px 14px;">
          <option value="all">Összes</option>
          ${cats.map(c=>`<option value="${c.id}" ${state.salesCatFilter===c.id?"selected":""}>${escape(c.label_hu||c.id)}</option>`).join("")}
        </select>
        <button class="ghost" id="addSaleBtn">+ Eladás</button>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Dátum</th><th>Név</th><th>Mód</th><th>Tételek</th><th>Bevétel</th><th>Db</th><th></th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    $("#salesCatFilter").onchange = (e)=>{
      state.salesCatFilter = e.target.value;
      renderSalesTable();
      renderChart();
    };

    $("#addSaleBtn").onclick = ()=> openAddSaleModal();

    root.querySelectorAll("button[data-dels]").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.getAttribute("data-dels");
        deleteSale(id);
      };
    });

    root.querySelectorAll("button[data-views]").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.getAttribute("data-views");
        viewSale(id);
      };
    });
  }

  function saleTotals(s, filterCatId){
    const prodById = new Map(state.productsDoc.products.map(p=>[String(p.id), p]));
    let revenue = 0;
    let qty = 0;

    for(const it of (s.items||[])){
      const p = prodById.get(String(it.productId));
      if(!p) continue;

      if(filterCatId !== "all" && String(p.categoryId) !== String(filterCatId)) continue;

      revenue += Number(it.unitPrice||0) * Number(it.qty||0);
      qty += Number(it.qty||0);
    }
    return { revenue, qty };
  }

  function sumRevenue(sales, filterCatId){
    return (sales||[]).reduce((acc,s)=> acc + saleTotals(s, filterCatId).revenue, 0);
  }

  function openAddSaleModal(){
    const cats = catsOrdered();
    const products = state.productsDoc.products.filter(p => p.status !== "soon");

    if(products.length === 0) return alert("Nincs eladható termék (soon nem eladható).");

    const prodOpts = products.map(p=>{
      return `<option value="${escape(p.id)}">${escape(p.name_hu||p.name_en||"??")} • ${escape(p.flavor_hu||p.flavor_en||"")} (stock:${Number(p.stock||0)})</option>`;
    }).join("");

    const body = document.createElement("div");
    body.innerHTML = `
      <div class="field full">
        <label>Eladás neve</label>
        <input id="sName" placeholder="pl. Tesó vásárlás" />
      </div>
      <div class="field third">
        <label>Dátum (YYYY-MM-DD)</label>
        <input id="sDate" value="${todayISO()}" />
      </div>
      <div class="field third">
        <label>Vásárlás módja</label>
        <input id="sMethod" placeholder="kp / utalás / bármi" />
      </div>
      <div class="field third">
        <label>Kategória szűrő (tétel felvitelhez)</label>
        <select id="sCat">
          <option value="all">Összes</option>
          ${cats.map(c=>`<option value="${escape(c.id)}">${escape(c.label_hu||c.id)}</option>`).join("")}
        </select>
      </div>

      <div class="field full">
        <label>Tételek</label>
        <div id="items"></div>
        <div class="actions">
          <button class="ghost" id="addItemBtn" type="button">+ Tétel</button>
        </div>
      </div>
    `;

    const itemsRoot = body.querySelector("#items");

    const addRow = (preset) => {
      const row = document.createElement("div");
      row.className = "rowline";
      row.innerHTML = `
        <div style="flex:1; display:flex; gap:10px; flex-wrap:wrap;">
          <select class="ghost" style="padding:10px 14px; min-width:320px;">
            ${prodOpts}
          </select>
          <input class="ghost qty" type="number" min="1" value="1" style="padding:10px 14px; width:110px;" />
          <input class="ghost price" type="number" min="0" value="0" style="padding:10px 14px; width:140px;" />
          <span class="small-muted unit"></span>
        </div>
        <button class="danger" type="button">Töröl</button>
      `;
      const sel = row.querySelector("select");
      const qty = row.querySelector(".qty");
      const price = row.querySelector(".price");
      const unit = row.querySelector(".unit");

      const syncPrice = ()=>{
        const p = state.productsDoc.products.find(x=>String(x.id)===String(sel.value));
        const v = p ? resolvedPrice(p) : 0;
        if(!preset) price.value = String(v);
        unit.textContent = `Egységár: ${fmt(Number(price.value||0))} Ft`;
      };

      sel.onchange = ()=> syncPrice();
      price.oninput = ()=> unit.textContent = `Egységár: ${fmt(Number(price.value||0))} Ft`;

      row.querySelector("button").onclick = ()=> row.remove();

      if(preset){
        sel.value = preset.productId;
        qty.value = String(preset.qty);
        price.value = String(preset.unitPrice);
      }
      syncPrice();

      itemsRoot.appendChild(row);
    };

    addRow();

    body.querySelector("#addItemBtn").onclick = ()=> addRow();

    // category filter for selecting items
    body.querySelector("#sCat").onchange = (e)=>{
      const catId = e.target.value;
      const filtered = (catId==="all")
        ? products
        : products.filter(p=>String(p.categoryId)===String(catId));

      const opts = filtered.map(p=>{
        return `<option value="${escape(p.id)}">${escape(p.name_hu||p.name_en||"??")} • ${escape(p.flavor_hu||p.flavor_en||"")} (stock:${Number(p.stock||0)})</option>`;
      }).join("");

      itemsRoot.querySelectorAll("select").forEach(sel=>{
        sel.innerHTML = opts || `<option value="">(nincs termék)</option>`;
      });
    };

    modal.open({
      title: "Új eladás",
      sub: "Név + dátum + mód + több tétel.",
      bodyEl: body,
      okText: "Mentés",
      onOk: (close)=>{
        const name = clean(body.querySelector("#sName").value);
        const date = clean(body.querySelector("#sDate").value).slice(0,10);
        const method = clean(body.querySelector("#sMethod").value);

        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return alert("Dátum formátum: YYYY-MM-DD");

        const rows = [...itemsRoot.children];
        const items = [];
        for(const r of rows){
          const pid = r.querySelector("select").value;
          if(!pid) continue;
          const qty = Math.max(1, Number(r.querySelector(".qty").value||1));
          const unitPrice = Math.max(0, Number(r.querySelector(".price").value||0));
          items.push({ productId: pid, qty, unitPrice });
        }
        if(items.length===0) return alert("Adj hozzá tételt");

        // stock check + apply
        for(const it of items){
          const p = state.productsDoc.products.find(x=>String(x.id)===String(it.productId));
          if(!p) return alert("Ismeretlen termék");
          const s = Number(p.stock||0);
          if(s < it.qty) return alert(`Nincs elég stock: ${p.name_hu||p.name_en} (van: ${s})`);
        }

        for(const it of items){
          const p = state.productsDoc.products.find(x=>String(x.id)===String(it.productId));
          p.stock = Math.max(0, Number(p.stock||0) - it.qty);
          if(p.stock <= 0 && p.status !== "soon") p.status = "out";
        }

        state.sales.push({ id: uid("s"), date, name, method, items });
        close();
        markDirty();

        // instant render (ne legyen “lassú frissülés”)
        renderAll();
      }
    });
  }

  function viewSale(id){
    const s = state.sales.find(x=>String(x.id)===String(id));
    if(!s) return;

    const prodById = new Map(state.productsDoc.products.map(p=>[String(p.id), p]));
    const body = document.createElement("div");
    const lines = (s.items||[]).map(it=>{
      const p = prodById.get(String(it.productId));
      const nm = p ? (p.name_hu||p.name_en||"??") : "??";
      const fl = p ? (p.flavor_hu||p.flavor_en||"") : "";
      return `<div class="rowline">
        <div class="left">
          <b>${escape(nm)}</b>
          <span class="small-muted">${escape(fl)}</span>
        </div>
        <div><b>${it.qty} db</b></div>
        <div><b>${fmt(it.unitPrice)} Ft</b></div>
        <div><b>${fmt(it.unitPrice*it.qty)} Ft</b></div>
      </div>`;
    }).join("");

    body.innerHTML = `
      <div class="rowline">
        <div class="left">
          <b>${escape(s.name||"")}</b>
          <span class="small-muted">${escape(s.date)} • ${escape(s.method||"")}</span>
        </div>
        <div><b>Össz: ${fmt(s.items.reduce((a,it)=>a+it.unitPrice*it.qty,0))} Ft</b></div>
      </div>
      ${lines}
    `;

    modal.open({
      title: "Eladás részlete",
      sub: "",
      bodyEl: body,
      okText: "Bezár",
      cancelText: "",
      onOk: (close)=> close()
    });

    // ha nincs cancel gomb UI-dban, oké, marad
  }

  function deleteSale(id){
    const idx = state.sales.findIndex(x=>String(x.id)===String(id));
    if(idx<0) return;
    const s = state.sales[idx];

    // rollback stock
    for(const it of (s.items||[])){
      const p = state.productsDoc.products.find(x=>String(x.id)===String(it.productId));
      if(!p) continue;
      p.stock = Math.max(0, Number(p.stock||0) + Number(it.qty||0));
      if(p.stock > 0 && p.status === "out") p.status = "ok";
    }

    state.sales.splice(idx, 1);
    markDirty();
    renderAll();
  }

  // ---------- Chart tab ----------
  function renderChart(){
    const root = $("#revenueChart");
    if(!root) return;

    const cats = catsOrdered();

    root.innerHTML = `
      <div class="rowline">
        <div class="left">
          <b>Bevétel diagram</b>
          <span class="small-muted">Napra bontva (bevétel + db). Kategória szűrő működik.</span>
        </div>
        <div class="actions" style="margin:0;">
          <select id="chartCatFilter" class="ghost" style="padding:10px 14px;">
            <option value="all">Összes</option>
            ${cats.map(c=>`<option value="${c.id}" ${state.chartCatFilter===c.id?"selected":""}>${escape(c.label_hu||c.id)}</option>`).join("")}
          </select>
        </div>
      </div>
      <canvas id="chartCanvas" width="1100" height="420" style="width:100%; max-width:1100px;"></canvas>
      <div class="small-muted" style="margin-top:10px;" id="chartStats"></div>
    `;

    $("#chartCatFilter").onchange = (e)=>{
      state.chartCatFilter = e.target.value;
      renderChart();
    };

    const data = aggregateByDay(state.sales, state.chartCatFilter);
    drawChart($("#chartCanvas"), data);

    const totalRev = data.reduce((a,x)=>a+x.revenue,0);
    const totalQty = data.reduce((a,x)=>a+x.qty,0);
    $("#chartStats").textContent = `Összesen: ${fmt(totalRev)} Ft • ${totalQty} db`;
  }

  function aggregateByDay(sales, catId){
    const prodById = new Map(state.productsDoc.products.map(p=>[String(p.id), p]));
    const map = new Map();

    for(const s of (sales||[])){
      const d = (s.date||"").slice(0,10);
      if(!map.has(d)) map.set(d, { date:d, revenue:0, qty:0, salesCount:0 });
      const row = map.get(d);
      row.salesCount += 1;

      for(const it of (s.items||[])){
        const p = prodById.get(String(it.productId));
        if(!p) continue;
        if(catId !== "all" && String(p.categoryId) !== String(catId)) continue;
        row.revenue += Number(it.unitPrice||0) * Number(it.qty||0);
        row.qty += Number(it.qty||0);
      }
    }

    return [...map.values()].sort((a,b)=> String(a.date).localeCompare(String(b.date)));
  }

  function drawChart(canvas, data){
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;

    ctx.clearRect(0,0,w,h);

    // background
    ctx.fillStyle = "rgba(11,15,23,.35)";
    ctx.fillRect(0,0,w,h);

    // padding
    const padL = 60, padR = 20, padT = 20, padB = 50;
    const iw = w - padL - padR;
    const ih = h - padT - padB;

    const maxRev = Math.max(1, ...data.map(x=>x.revenue));
    const maxQty = Math.max(1, ...data.map(x=>x.qty));

    // axes
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT+ih);
    ctx.lineTo(padL+iw, padT+ih);
    ctx.stroke();

    // x labels
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.font = "12px ui-sans-serif, system-ui";
    const n = data.length;
    const step = n>10 ? Math.ceil(n/10) : 1;

    for(let i=0;i<n;i+=step){
      const x = padL + (iw * (i/(Math.max(1,n-1))));
      ctx.fillText(data[i].date, x-28, padT+ih+20);
    }

    // revenue line
    ctx.strokeStyle = "rgba(124,92,255,.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    data.forEach((p,i)=>{
      const x = padL + (iw * (i/(Math.max(1,n-1))));
      const y = padT + ih - (ih * (p.revenue/maxRev));
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // qty line (second)
    ctx.strokeStyle = "rgba(40,215,255,.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((p,i)=>{
      const x = padL + (iw * (i/(Math.max(1,n-1))));
      const y = padT + ih - (ih * (p.qty/maxQty));
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // legend
    ctx.fillStyle = "rgba(124,92,255,.9)";
    ctx.fillRect(padL, padT, 12, 12);
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.fillText("Bevétel", padL+18, padT+11);

    ctx.fillStyle = "rgba(40,215,255,.9)";
    ctx.fillRect(padL+110, padT, 12, 12);
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.fillText("Darab", padL+128, padT+11);
  }

  // ---------- bindings ----------
  function bindTabs(){
    // a te adminodban vannak tab gombok (Termékek/Kategóriák/Eladások/Beállítások/Diagram)
    // add a gombokra data-tabbtn attribútumot, a panelekre data-tab attribútumot.
    document.querySelectorAll("[data-tabbtn]").forEach(btn=>{
      btn.onclick = ()=>{
        setTab(btn.getAttribute("data-tabbtn"));
      };
    });
  }

  function bindSettingsButtons(){
    // ha van load/save gombod:
    const loadBtn = $("#loadBtn");
    const saveBtn = $("#saveBtn");

    if(loadBtn) loadBtn.onclick = loadData;
    if(saveBtn) saveBtn.onclick = saveData;

    // ha vannak settings inputok:
    ["#ghOwner","#ghRepo","#ghBranch","#ghToken"].forEach(id=>{
      const el = $(id);
      if(el) el.addEventListener("input", ()=>{
        saveCfgToLS();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    bindTabs();
    bindSettingsButtons();

    // ha elsőre üres volt a képernyő: ez megoldja – automatikusan betölt
    loadData();

    // default tab
    setTab(state.tab);
  });

})();
