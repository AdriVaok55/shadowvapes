(() => {
  const $ = (s) => document.querySelector(s);

  const state = {
    lang: localStorage.getItem("sv_lang") || "hu",
    active: "all",
    productsDoc: { categories: [], products: [], popups: [], _meta: null },
    sales: [],
    salesFresh: false,
    search: "",
    etagProducts: "",
    etagSales: "",
    featuredByCat: new Map(), // categoryId -> productId

    // anti-flicker / anti-stale overwrites
    docRev: 0,
    docHash: "",
    salesHash: "",
    lastLiveTs: 0,
  };

  const UI = {
    all: { hu: "Összes termék", en: "All products" },
    soon: { hu: "Hamarosan", en: "Coming soon" },
    stock: { hu: "Készlet", en: "Stock" },
    pcs: { hu: "db", en: "pcs" },
    out: { hu: "Elfogyott", en: "Sold out" },
    hot: { hu: "Felkapott", en: "Trending" },
    newAvail: { hu: "Új termékek elérhetőek", en: "New products available" },
    understood: { hu: "Értettem", en: "Got it" },
    skipAll: { hu: "Összes átugrása", en: "Skip all" },
    dontShow: { hu: "Ne mutasd többször", en: "Don't show again" },
    expected: { hu: "Várható", en: "Expected" }
  };

  const t = (k) => (UI[k] ? UI[k][state.lang] : k);

  const locale = () => (state.lang === "en" ? "en" : "hu");

  const norm = (s) =>
    (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  function catLabel(c) {
    // Mindig magyar címke
    return (c && c.label_hu) || (c && c.label_en) || (c && c.id) || "";
  }

  function getName(p) {
    // Mindig magyar név
    return (p && p.name_hu) || (p && p.name_en) || (p && p.name) || "";
  }

  function getFlavor(p) {
    if (!p) return "";
    // Csak az ízek fordulnak nyelv szerint
    return state.lang === "en"
      ? (p.flavor_en || p.flavor_hu || p.flavor || "")
      : (p.flavor_hu || p.flavor_en || p.flavor || "");
  }

  // Csak hónap formátum: YYYY-MM -> "December"
  function formatMonth(monthStr) {
    if (!monthStr) return "";
    try {
      const [year, month] = monthStr.split("-");
      if (!year || !month) return monthStr;
      
      const monthNum = parseInt(month, 10);
      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) return monthStr;
      
      const monthNames = state.lang === "en" 
        ? ["January", "February", "March", "April", "May", "June", 
           "July", "August", "September", "October", "November", "December"]
        : ["Január", "Február", "Március", "Április", "Május", "Június",
           "Július", "Augusztus", "Szeptember", "Október", "November", "December"];
      
      return monthNames[monthNum - 1]; // Csak a hónap neve
    } catch {
      return monthStr;
    }
  }

  function effectivePrice(p) {
    const price = p && p.price;
    if (price !== null && price !== undefined && price !== "" && Number(price) > 0) return Number(price);
    const c = (state.productsDoc.categories || []).find((x) => String(x.id) === String(p.categoryId));
    const bp = c ? Number(c.basePrice || 0) : 0;
    return Number.isFinite(bp) ? bp : 0;
  }

  function isOut(p) {
    const st = (p && p.status) || "ok";
    const stock = Math.max(0, Number(p && p.stock ? p.stock : 0));
    return st === "out" || stock <= 0;
  }

  function isSoon(p) {
    return ((p && p.status) || "ok") === "soon";
  }

  /* ----------------- Source resolving (csak lokális fájlok) ----------------- */
  let source = null;

  async function validateSource(s){
    try{
      if(!s || !s.owner || !s.repo || !s.branch) return false;
      // Csak a lokális fájlt próbáljuk
      const testUrl = `data/products.json?_=${Date.now()}`;
      const r = await fetch(testUrl, { cache: "no-store" });
      return r.ok;
    }catch{ return false; }
  }

  function getOwnerRepoFromUrl() {
    const host = location.hostname;
    if (!host.endsWith(".github.io")) return null;
    const owner = host.replace(".github.io", "");
    const parts = location.pathname.split("/").filter(Boolean);
    const repo = parts.length ? parts[0] : null;
    if (!repo) return null;
    return { owner, repo };
  }

  function getOwnerRepoCfg() {
    const owner = (localStorage.getItem("sv_owner") || "").trim();
    const repo = (localStorage.getItem("sv_repo") || "").trim();
    const branch = (localStorage.getItem("sv_branch") || "").trim();
    if (!owner || !repo) return null;
    return { owner, repo, branch: branch || null };
  }

  function applySyncParams(){
    try{
      const u = new URL(location.href);
      const o = (u.searchParams.get("sv_owner")||"").trim();
      const r = (u.searchParams.get("sv_repo")||"").trim();
      const b = (u.searchParams.get("sv_branch")||"").trim();
      if(o && r){
        localStorage.setItem("sv_owner", o);
        localStorage.setItem("sv_repo", r);
        if(b) localStorage.setItem("sv_branch", b);
        const src = { owner:o, repo:r, branch: b || "main" };
        localStorage.setItem("sv_source", JSON.stringify(src));
        u.searchParams.delete("sv_owner");
        u.searchParams.delete("sv_repo");
        u.searchParams.delete("sv_branch");
        history.replaceState({}, "", u.pathname + (u.search ? u.search : "") + u.hash);
      }
    }catch{}
  }

  async function resolveSource() {
    if (source) return source;

    try {
      const cached = JSON.parse(localStorage.getItem("sv_source") || "null");
      if (cached && cached.owner && cached.repo && cached.branch) {
        const ok = await validateSource(cached);
        if (ok) {
          source = cached;
          return source;
        }
      }
    } catch {}

    try {
      const r = await fetch(`data/sv_source.json?_=${Date.now()}`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j && j.owner && j.repo) {
          const br = String(j.branch || j.ref || "main").trim();
          source = { owner: String(j.owner).trim(), repo: String(j.repo).trim(), branch: br };
          try { localStorage.setItem("sv_source", JSON.stringify(source)); } catch {}
          return source;
        }
      }
    } catch {}

    const or = getOwnerRepoFromUrl() || getOwnerRepoCfg();
    if (!or) return null;

    source = { owner: or.owner, repo: or.repo, branch: or.branch || "main" };
    try { localStorage.setItem("sv_source", JSON.stringify(source)); } catch {}
    return source;
  }

  async function fetchJson(relPath, { forceBust=false } = {}){
    const mkUrl = (base) => forceBust ? `${base}${base.includes("?") ? "&" : "?"}_=${Date.now()}` : base;
    
    const headers = {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    };

    const url = mkUrl(relPath);
    const r = await fetch(url, { cache: "no-store", headers });
    if (r.status === 304) return null;
    if (!r.ok) throw new Error(`Nem tudtam betölteni: ${relPath} (${r.status})`);
    return await r.json();
  }

  async function fetchProducts({ forceBust=false } = {}){
    return await fetchJson("data/products.json", { forceBust });
  }
  async function fetchSales({ forceBust=false } = {}){
    return await fetchJson("data/sales.json", { forceBust });
  }

  function normalizeDoc(data) {
    if (Array.isArray(data)) return { categories: [], products: data, popups: [], _meta: null };
    const categories = data && Array.isArray(data.categories) ? data.categories : [];
    const products = data && Array.isArray(data.products) ? data.products : [];
    const popups = data && Array.isArray(data.popups) ? data.popups : [];
    const _meta = data && typeof data === "object" ? (data._meta || null) : null;
    return { categories, products, popups, _meta };
  }

  function normalizeSales(data){
    if(!Array.isArray(data)) return [];
    return data.map(s => {
      const legacyPid = s.productId || s.pid || s.product || "";
      const legacyQty = s.qty || s.quantity || 1;
      const legacyPrice = s.unitPrice || s.price || s.amount || 0;

      const items = Array.isArray(s.items)
        ? s.items.map(it => ({
            productId: String(it.productId || it.pid || ""),
            qty: Math.max(1, Number.parseFloat(it.qty || it.quantity || 1) || 1),
            unitPrice: Math.max(0, Number.parseFloat(it.unitPrice || it.price || 0) || 0)
          })).filter(it => it.productId)
        : (legacyPid ? [{
            productId: String(legacyPid),
            qty: Math.max(1, Number.parseFloat(legacyQty) || 1),
            unitPrice: Math.max(0, Number.parseFloat(legacyPrice) || 0)
          }] : []);

      return {
        id: String(s.id || ""),
        date: String(s.date || s.day || s.createdAt || ""),
        name: s.name || "",
        payment: s.payment || s.method || "",
        items
      };
    }).filter(s => s.id);
  }

  /* ----------------- Featured (Felkapott) ----------------- */
  function computeFeaturedByCategory(){
    state.featuredByCat = new Map();
    if(!state.salesFresh) return;
    
    const products = (state.productsDoc.products || []).filter(p => p && p.id && p.visible !== false);
    const cats = (state.productsDoc.categories || []);
    const enabledCats = new Set(cats.filter(c => c && c.id && (c.featuredEnabled === false ? false : true)).map(c => String(c.id)));

    const totals = new Map();
    let any = 0;

    for(const sale of (state.sales || [])){
      for(const it of (sale.items || [])){
        const pid = String(it.productId || "");
        const qty = Number(it.qty || 0) || 0;
        if(!pid || qty <= 0) continue;
        const p = products.find(x => String(x.id) === pid);
        if(!p) continue;
        
        if(p.status === "out" || p.stock <= 0) continue;
        
        const cid = String(p.categoryId || "");
        if(!cid || !enabledCats.has(cid)) continue;
        any += qty;
        if(!totals.has(cid)) totals.set(cid, new Map());
        const m = totals.get(cid);
        m.set(pid, (m.get(pid)||0) + qty);
      }
    }

    if(any <= 0) return;

    for(const [cid, m] of totals.entries()){
      let bestPid = null;
      let bestQty = -1;

      for(const [pid, qty] of m.entries()){
        if(qty > bestQty){
          bestQty = qty; bestPid = pid;
        }else if(qty === bestQty && bestPid){
          const a = products.find(x=>String(x.id)===pid);
          const b = products.find(x=>String(x.id)===bestPid);
          const fa = norm(getFlavor(a));
          const fb = norm(getFlavor(b));
          const cmp = fa.localeCompare(fb, locale());
          if(cmp < 0) bestPid = pid;
        }
      }

      if(bestPid) state.featuredByCat.set(cid, bestPid);
    }
  }

  /* ----------------- Change detection ----------------- */
  function hashStr(str){
    let h = 5381;
    for(let i=0;i<str.length;i++){
      h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return (h >>> 0).toString(16);
  }
  function docRev(doc){
    const r = doc && doc._meta ? Number(doc._meta.rev || doc._meta.updatedAt || 0) : 0;
    return Number.isFinite(r) ? r : 0;
  }
  function docSig(doc){
    try{
      return hashStr(JSON.stringify({
        c: doc.categories || [],
        p: doc.products || [],
        pp: doc.popups || [],
        m: doc._meta || null
      }));
    }catch{ return ""; }
  }
  function salesSig(sales){
    try{ return hashStr(JSON.stringify(sales || [])); }catch{ return ""; }
  }

  function applyDocIfNewer(nextDoc, { source="net" } = {}){
    const next = normalizeDoc(nextDoc);
    const nextSig = docSig(next);
    if(!nextSig) return false;

    const nextRev = docRev(next);
    const now = Date.now();

    if(state.docHash && nextSig === state.docHash) return false;

    if(state.docRev && nextRev && nextRev < state.docRev) return false;

    if(state.docRev && !nextRev && state.lastLiveTs && (now - state.lastLiveTs) < 90_000){
      return false;
    }

    state.productsDoc = next;
    state.docHash = nextSig;
    if(nextRev) state.docRev = nextRev;
    if(source === "live") state.lastLiveTs = now;
    return true;
  }

  function applySalesIfChanged(nextSales, { fresh=false } = {}){
    const arr = Array.isArray(nextSales) ? nextSales : [];
    const sig = salesSig(arr);
    if(sig && sig === state.salesHash){
      if(fresh) state.salesFresh = true;
      return false;
    }
    state.sales = arr;
    state.salesHash = sig;
    state.salesFresh = !!fresh;
    return true;
  }

  /* ----------------- Rendering ----------------- */
  function orderedCategories() {
    const cats = (state.productsDoc.categories || [])
      .filter((c) => c && c.id)
      .map((c) => ({
        id: String(c.id),
        label_hu: c.label_hu || c.id,
        label_en: c.label_en || c.label_hu || c.id,
        basePrice: Number(c.basePrice || 0),
        featuredEnabled: (c.featuredEnabled === false) ? false : true
      }))
      .sort((a, b) => catLabel(a).localeCompare(catLabel(b), locale()));

    return [
      { id: "all", label_hu: t("all"), label_en: t("all"), virtual: true },
      ...cats,
      { id: "soon", label_hu: t("soon"), label_en: t("soon"), virtual: true },
    ];
  }

  function filterList() {
    const q = norm(state.search);

    let list = (state.productsDoc.products || []).map((p) => ({
      ...p,
      id: String(p.id || ""),
      categoryId: String(p.categoryId || ""),
      status: p.status === "soon" || p.status === "out" || p.status === "ok" ? p.status : "ok",
      stock: Math.max(0, Number(p.stock || 0)),
      visible: (p.visible === false) ? false : true
    })).filter(p => p.id && p.visible !== false);

    if (state.active === "soon") {
      list = list.filter((p) => p.status === "soon");
    } else {
      if (state.active !== "all") list = list.filter((p) => String(p.categoryId) === String(state.active));
    }

    if (q) {
      list = list.filter((p) => norm(getName(p) + " " + getFlavor(p)).includes(q));
    }

    const okPart = list.filter((p) => !isOut(p) && !isSoon(p));
    const soonPart = list.filter((p) => !isOut(p) && isSoon(p));
    const outPart = list.filter((p) => isOut(p));

    const groupSort = (arr) => {
      const map = new Map();
      for (const p of arr) {
        const key = norm(getName(p));
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(p);
      }
      const keys = [...map.keys()].sort((a, b) => a.localeCompare(b, locale()));
      const out = [];
      for (const k of keys) {
        const items = map.get(k);
        items.sort((a, b) => norm(getFlavor(a)).localeCompare(norm(getFlavor(b)), locale()));
        out.push(...items);
      }
      return out;
    };

    return [...groupSort(okPart), ...groupSort(soonPart), ...groupSort(outPart)];
  }

  function fmtFt(n) {
    const v = Number(n || 0);
    return v.toLocaleString("hu-HU") + " Ft";
  }

  function renderNav() {
    const nav = $("#nav");
    nav.innerHTML = "";

    const cats = orderedCategories();
    for (const c of cats) {
      const btn = document.createElement("button");
      btn.textContent = c.id === "all" ? t("all") : c.id === "soon" ? t("soon") : catLabel(c);
      if (state.active === c.id) btn.classList.add("active");
      btn.onclick = () => {
        state.active = c.id;
        $("#title").textContent = btn.textContent;
        renderNav();
        renderGrid();
      };
      nav.appendChild(btn);
    }
  }

  function getFeaturedListForAll(){
    const cats = (state.productsDoc.categories || []).filter(c => c && c.id && (c.featuredEnabled === false ? false : true));
    cats.sort((a,b)=>catLabel(a).localeCompare(catLabel(b), locale()));
    const out = [];
    for(const c of cats){
      const pid = state.featuredByCat.get(String(c.id));
      if(!pid) continue;
      const p = (state.productsDoc.products||[]).find(x=>String(x.id)===String(pid));
      if(p && p.visible !== false) out.push(p);
    }
    return out;
  }

  function renderGrid() {
    const grid = $("#grid");
    const empty = $("#empty");
    grid.innerHTML = "";

    let list = filterList();

    const featuredIds = new Set();
    let featuredToPrepend = [];

    if(state.active !== "soon"){
      if(state.active === "all"){
        featuredToPrepend = getFeaturedListForAll();
      }else{
        const pid = state.featuredByCat.get(String(state.active));
        if(pid){
          const p = (state.productsDoc.products||[]).find(x=>String(x.id)===String(pid));
          if(p && p.visible !== false) featuredToPrepend = [p];
        }
      }
    }

    for(const fp of featuredToPrepend){
      featuredIds.add(String(fp.id));
    }

    if(featuredToPrepend.length){
      list = list.filter(p => !featuredIds.has(String(p.id)));
      list = [...featuredToPrepend, ...list];
    }

    $("#count").textContent = String(list.length);
    empty.style.display = list.length ? "none" : "block";

    for (const p of list) {
      const name = getName(p);
      const flavor = getFlavor(p);
      const out = isOut(p);
      const soon = isSoon(p);
      const featured = featuredIds.has(String(p.id));
      const stockShown = out ? 0 : (soon ? Math.max(0, Number(p.stock || 0)) : Math.max(0, Number(p.stock || 0)));
      const price = effectivePrice(p);

      let cardClass = "card fade-in";
      if (out) cardClass += " dim outline-red";
      else if (soon) cardClass += " outline-yellow";
      if (featured) cardClass += " outline-orange";

      const card = document.createElement("div");
      card.className = cardClass;

      const hero = document.createElement("div");
      hero.className = "hero";

      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = (name + (flavor ? " - " + flavor : "")).trim();
      img.src = p.image || "";

      // Kép szűrés
      if (out) {
        img.style.filter = "grayscale(.75) contrast(.95) brightness(.85)";
      } else if (soon) {
        img.style.filter = "grayscale(0.3) contrast(1) brightness(0.95)";
      }

      const badges = document.createElement("div");
      badges.className = "badges";

      if(featured){
        const b = document.createElement("div");
        b.className = "badge hot";
        b.textContent = t("hot");
        badges.appendChild(b);
      }

      if (soon) {
        const b = document.createElement("div");
        b.className = "badge soon";
        b.textContent = t("soon");
        badges.appendChild(b);
        
        if (p.soonEta) {
          const expectedBadge = document.createElement("div");
          expectedBadge.className = "badge calendar";
          expectedBadge.textContent = `📅 ${t("expected")}: ${formatMonth(p.soonEta)}`;
          badges.appendChild(expectedBadge);
        }
      }

      if (out) {
        const b = document.createElement("div");
        b.className = "badge out";
        b.textContent = t("out");
        badges.appendChild(b);
      }

      const overlay = document.createElement("div");
      overlay.className = "overlay-title";
      overlay.innerHTML = `
        <div class="name">${name}</div>
        <div class="flavor">${flavor}</div>
      `;

      hero.appendChild(img);
      hero.appendChild(badges);
      hero.appendChild(overlay);

      const body = document.createElement("div");
      body.className = "card-body";

      const meta = document.createElement("div");
      meta.className = "meta-row";

      const priceEl = document.createElement("div");
      priceEl.className = "price";
      priceEl.textContent = fmtFt(price);

      const stockEl = document.createElement("div");
      stockEl.className = "stock";
      stockEl.innerHTML = `${t("stock")}: <b>${soon ? "—" : stockShown} ${soon ? "" : t("pcs")}</b>`;

      meta.appendChild(priceEl);
      meta.appendChild(stockEl);
      body.appendChild(meta);

      card.appendChild(hero);
      card.appendChild(body);

      grid.appendChild(card);
    }
  }

  /* ----------------- Popups ----------------- */
  function popupHideKey(pp){
    const id = String(pp.id||"");
    const rev = Number(pp.rev || pp.updatedAt || pp.createdAt || 0) || 0;
    return `sv_popup_hide_${id}_${rev}`;
  }

  function buildPopupQueue(){
    const popups = (state.productsDoc.popups || []).filter(pp => pp && pp.id && (pp.enabled === false ? false : true));
    popups.sort((a,b)=>(Number(b.createdAt||0)-Number(a.createdAt||0)));

    const products = (state.productsDoc.products || []).filter(p=>p && p.id && p.visible !== false);
    const cats = (state.productsDoc.categories || []);

    const queue = [];

    for(const pp of popups){
      try{
        if(localStorage.getItem(popupHideKey(pp)) === "1") continue;
      }catch{}

      const ids = new Set();
      for(const cid of (pp.categoryIds||[])){
        for(const p of products){
          if(String(p.categoryId) === String(cid)) ids.add(String(p.id));
        }
      }
      for(const pid of (pp.productIds||[])){
        ids.add(String(pid));
      }

      const picked = [...ids].map(id => products.find(p=>String(p.id)===String(id))).filter(Boolean);

      const byCat = new Map();
      for(const p of picked){
        const cid = String(p.categoryId||"");
        if(!byCat.has(cid)) byCat.set(cid, []);
        byCat.get(cid).push(p);
      }

      const catIds = [...byCat.keys()].sort((a,b)=>{
        const ca = cats.find(x=>String(x.id)===String(a));
        const cb = cats.find(x=>String(x.id)===String(b));
        return catLabel(ca).localeCompare(catLabel(cb), locale());
      });

      if(!catIds.length) continue;

      queue.push({
        popup: pp,
        categories: catIds.map(cid => ({
          id: cid,
          label: catLabel(cats.find(x=>String(x.id)===String(cid)) || {id:cid, label_hu:cid, label_en:cid}),
          products: byCat.get(cid)
            .slice()
            .sort((a,b)=> norm(getFlavor(a)).localeCompare(norm(getFlavor(b)), locale()))
        }))
      });
    }

    return queue;
  }

  function showPopupsIfNeeded(){
    const queue = buildPopupQueue();
    if(!queue.length) return;

    const existing = document.getElementById("popupBg");
    if(existing) existing.remove();

    const bg = document.createElement("div");
    bg.id = "popupBg";
    bg.className = "popup-backdrop";

    const modal = document.createElement("div");
    modal.className = "popup-modal";

    const header = document.createElement("div");
    header.className = "popup-header";

    const content = document.createElement("div");
    content.className = "popup-content";

    const slider = document.createElement("div");
    slider.className = "popup-slider";

    const footer = document.createElement("div");
    footer.className = "popup-footer";

    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(footer);
    bg.appendChild(modal);
    document.body.appendChild(bg);

    let currentPopup = 0;
    let currentSlide = 0;
    let currentProductSlide = 0;
    let slides = [];
    let slideInterval = null;

    function renderPopup() {
        if (currentPopup >= queue.length) {
            bg.remove();
            return;
        }

        const popupData = queue[currentPopup];
        const popup = popupData.popup;
        const categories = popupData.categories;

        if (currentSlide >= categories.length) {
            currentPopup++;
            currentSlide = 0;
            renderPopup();
            return;
        }

        const category = categories[currentSlide];
        const products = category.products;

        if (products.length === 0) {
            currentSlide++;
            renderPopup();
            return;
        }

        slider.innerHTML = "";
        slides = [];

        products.forEach((product, index) => {
            const slide = document.createElement("div");
            slide.className = "popup-slide";
            
            const name = getName(product);
            const flavor = getFlavor(product);
            const price = effectivePrice(product);
            const stock = product.stock;
            const isProductSoon = isSoon(product);
            const isProductOut = isOut(product);
            
            slide.innerHTML = `
                <div class="popup-product-image">
                    <img src="${product.image || ''}" alt="${name} ${flavor}" loading="lazy" style="object-fit: contain;max-height:350px;width:100%;">
                </div>
                <div class="popup-product-info">
                    <div class="popup-product-name">${name}</div>
                    <div class="popup-product-flavor">${flavor}</div>
                    <div class="popup-product-price">${fmtFt(price)}</div>
                    <div class="popup-product-stock">${t("stock")}: <b>${isProductSoon ? "—" : (isProductOut ? 0 : stock)} ${isProductSoon ? "" : t("pcs")}</b></div>
                    ${product.soonEta ? `<div class="popup-product-expected">${t("expected")}: ${formatMonth(product.soonEta)}</div>` : ''}
                </div>
            `;
            
            slider.appendChild(slide);
            slides.push(slide);
        });

        if (slides.length > 1) {
            const firstClone = slides[0].cloneNode(true);
            slider.appendChild(firstClone);
        }

        const totalSlides = slides.length;
        const sliderWidth = totalSlides > 1 ? (totalSlides + 1) * 100 : 100;
        slider.style.width = `${sliderWidth}%`;

        function goToSlide(index, animate = true) {
            if (totalSlides <= 1) return;

            currentProductSlide = index;

            if (animate) {
                slider.style.transition = 'transform 0.5s ease';
            } else {
                slider.style.transition = 'none';
            }

            const offset = -currentProductSlide * 100;
            slider.style.transform = `translateX(${offset}%)`;

            if (currentProductSlide === totalSlides) {
                setTimeout(() => {
                    slider.style.transition = 'none';
                    currentProductSlide = 0;
                    slider.style.transform = `translateX(0%)`;
                }, 500);
            }

            updateDots();
        }

        function nextSlide() {
            if (slides.length <= 1) return;
            goToSlide(currentProductSlide + 1, true);
        }

        function prevSlide() {
            if (slides.length <= 1) return;
            let newIndex = currentProductSlide - 1;
            if (newIndex < 0) {
                newIndex = totalSlides - 1;
                slider.style.transition = 'none';
                currentProductSlide = totalSlides;
                slider.style.transform = `translateX(-${currentProductSlide * 100}%)`;
                
                setTimeout(() => {
                    goToSlide(newIndex, true);
                }, 50);
                return;
            }
            goToSlide(newIndex, true);
        }

        const dots = document.createElement("div");
        dots.className = "popup-dots";
        
        function updateDots() {
            dots.innerHTML = '';
            for(let i = 0; i < totalSlides; i++) {
                const dot = document.createElement("div");
                const displayIndex = currentProductSlide >= totalSlides ? 0 : currentProductSlide;
                dot.className = `popup-dot ${i === displayIndex ? 'active' : ''}`;
                dot.addEventListener('click', () => goToSlide(i));
                dots.appendChild(dot);
            }
        }

        if(slideInterval) clearInterval(slideInterval);
        if(totalSlides > 1) {
            slideInterval = setInterval(nextSlide, 4000);
        }

        header.innerHTML = `
            <div class="popup-title">${state.lang === "en" ? (popup.title_en || t("newAvail")) : (popup.title_hu || t("newAvail"))}</div>
            <div class="popup-subtitle">${category.label}</div>
        `;

        footer.innerHTML = '';
        
        const dontShow = document.createElement("label");
        dontShow.className = "chk";
        dontShow.innerHTML = `<input type="checkbox" id="dontShowAgain"> ${t("dontShow")}`;
        
        const buttons = document.createElement("div");
        buttons.className = "popup-buttons";
        
        if(queue.length > 1) {
            const skipAllBtn = document.createElement("button");
            skipAllBtn.className = "ghost";
            skipAllBtn.textContent = t("skipAll");
            skipAllBtn.onclick = () => {
                queue.forEach(q => {
                    try {
                        localStorage.setItem(popupHideKey(q.popup), "1");
                    } catch {}
                });
                if(slideInterval) clearInterval(slideInterval);
                bg.remove();
            };
            buttons.appendChild(skipAllBtn);
        }
        
        const understoodBtn = document.createElement("button");
        understoodBtn.className = "primary";
        understoodBtn.textContent = t("understood");
        understoodBtn.onclick = () => {
            const checkbox = document.getElementById("dontShowAgain");
            if(checkbox && checkbox.checked) {
                try {
                    localStorage.setItem(popupHideKey(popup), "1");
                } catch {}
            }
            currentSlide++;
            if(slideInterval) clearInterval(slideInterval);
            renderPopup();
        };
        buttons.appendChild(understoodBtn);
        
        footer.appendChild(dontShow);
        if(totalSlides > 1) footer.appendChild(dots);
        footer.appendChild(buttons);

        if(totalSlides > 1) {
            const prevArrow = document.createElement("button");
            prevArrow.className = "popup-arrow prev";
            prevArrow.textContent = "‹";
            prevArrow.onclick = prevSlide;
            
            const nextArrow = document.createElement("button");
            nextArrow.className = "popup-arrow next";
            nextArrow.textContent = "›";
            nextArrow.onclick = nextSlide;
            
            content.appendChild(prevArrow);
            content.appendChild(nextArrow);
        }

        content.innerHTML = '';
        content.appendChild(slider);
        if(totalSlides > 1) updateDots();
        goToSlide(0, false);
    }

    renderPopup();

    let touchStartX = 0;
    let touchEndX = 0;

    content.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });

    content.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });

    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;

        if(Math.abs(diff) > swipeThreshold) {
            if(diff > 0) {
                nextSlide();
            } else {
                prevSlide();
            }
        }
    }

    bg.addEventListener("click", (e) => {
        if(e.target === bg) {
            if(slideInterval) clearInterval(slideInterval);
            bg.remove();
        }
    });
  }

  /* ----------------- Init ----------------- */
  function setLangUI(){
    $("#langLabel").textContent = state.lang.toUpperCase();
    $("#search").placeholder = state.lang === "en" ? "Search..." : "Keresés...";
  }

  function initLang(){
    $("#langBtn").onclick = () => {
      state.lang = state.lang === "hu" ? "en" : "hu";
      localStorage.setItem("sv_lang", state.lang);
      setLangUI();
      renderNav();
      renderGrid();
      showPopupsIfNeeded();
    };
  }

  function hydrateFromLivePayload(){
    try{
      const raw = localStorage.getItem("sv_live_payload");
      if(!raw) return false;
      const payload = JSON.parse(raw);
      if(!payload || !payload.doc) return false;

      const ts = Number(payload.ts || 0) || 0;
      if(!ts || (Date.now() - ts) > 120_000) return false;

      const docChanged = applyDocIfNewer(payload.doc, { source: "live" });
      const salesChanged = applySalesIfChanged(normalizeSales(payload.sales || []), { fresh: true });

      if(docChanged || salesChanged){
        computeFeaturedByCategory();
      }
      return (docChanged || salesChanged);
    }catch{ return false; }
  }

  async function loadAll({ forceBust=false } = {}){
    let changed = false;

    try {
      const docRaw = await fetchProducts({ forceBust });
      if(docRaw){
        const docChanged = applyDocIfNewer(docRaw, { source: "net" });
        if(docChanged) changed = true;
      }
    } catch(err) {
      console.error("Hiba a termékek betöltése közben:", err);
    }

    try {
      const salesRaw = await fetchSales({ forceBust });
      if(salesRaw) {
        applySalesIfChanged(normalizeSales(salesRaw || []), { fresh:true });
      }
    } catch(salesErr) {
      console.warn("Eladások betöltése sikertelen.");
    }

    computeFeaturedByCategory();
    return changed;
  }

  async function init() {
    applySyncParams();
    setLangUI();
    initLang();

    hydrateFromLivePayload();

    try {
      await loadAll({ forceBust:true });
    } catch(err) {
      console.error("Betöltési hiba:", err);
      $("#loaderText").textContent = "Adatok betöltése... próbálom újra.";
      // Próbáljuk újra
      try {
        await loadAll({ forceBust:true });
      } catch(err2) {
        console.error("Második próbálkozás is sikertelen:", err2);
      }
    }

    renderNav();
    renderGrid();

    $("#loader").style.display = "none";
    $("#app").style.display = "grid";

    setTimeout(() => showPopupsIfNeeded(), 500);

    try{
      const bc = new BroadcastChannel("sv_live");
      bc.onmessage = (e) => {
        try{
          if(!e.data) return;

          let changed = false;
          if(e.data.doc){
            changed = applyDocIfNewer(e.data.doc, { source:"live" }) || changed;
          }
          if("sales" in e.data){
            changed = applySalesIfChanged(normalizeSales(e.data.sales || []), { fresh:true }) || changed;
          }
          if(changed){
            computeFeaturedByCategory();
            renderNav();
            renderGrid();
            setTimeout(() => showPopupsIfNeeded(), 100);
          }
        }catch{}
      };
    }catch{}

    const loop = async () => {
      try{
        const changed = await loadAll({ forceBust:false });
        if(changed){
          renderNav();
          renderGrid();
          setTimeout(() => showPopupsIfNeeded(), 100);
        }
      }catch{}
      setTimeout(loop, 30_000);
    };

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) loadAll({ forceBust:true }).then((changed)=>{ if(changed){ renderNav(); renderGrid(); } setTimeout(() => showPopupsIfNeeded(), 100); }).catch(()=>{});
    });

    loop();
  }

  init().catch((err) => {
    console.error(err);
    $("#loaderText").textContent =
      "Betöltési hiba. Ellenőrizd a konzolt. Próbáld megnyitni a Sync linket az admin Beállításokból.";
  });
})();
