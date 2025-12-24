(() => {
  const $ = (s) => document.querySelector(s);

  const state = {
    lang: localStorage.getItem("sv_lang") || "hu",
    active: "all",
    productsDoc: { categories: [], products: [] },
    search: ""
  };

  const UI = { all:"Összes termék", soon:"Hamarosan", stock:"Készlet", pcs:"db", out:"Elfogyott" };
  const t = (k) => UI[k] || k;

  const norm = (s) => (s || "").toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  function getOwnerRepoFromUrl(){
    // https://username.github.io/repo/...
    const host = location.hostname;
    if(!host.endsWith(".github.io")) return null;
    const owner = host.replace(".github.io", "");
    const parts = location.pathname.split("/").filter(Boolean);
    const repo = parts.length ? parts[0] : null;
    if(!repo) return null;
    return { owner, repo };
  }

function getOwnerRepoCfg(){
    const owner = (localStorage.getItem("sv_owner")||"").trim();
    const repo = (localStorage.getItem("sv_repo")||"").trim();
    const branch = (localStorage.getItem("sv_branch")||"").trim();
    const token = (localStorage.getItem("sv_token")||"").trim();
    if(!owner || !repo) return null;
    return { owner, repo, branch: branch || null, token: token || null };
  }

  async function fetchJsonSmart(path){
    // 1) raw github main/master (gyorsabb mint pages cache)
    const or = getOwnerRepoFromUrl() || getOwnerRepoCfg();
    const ts = Date.now();
    if(or){
      const branches = [or.branch, "main", "master", "gh-pages"].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
      for(const br of branches){
        const raw = `https://raw.githubusercontent.com/${or.owner}/${or.repo}/${br}/${path}?v=${ts}`;
        try{
          const r = await fetch(raw, { cache:"no-store" });
          if(r.ok) return await r.json();
        }catch{}
      }
    }
    // 2) fallback relative
    const rel = `${path}?v=${ts}`;
    const r2 = await fetch(rel, { cache:"no-store" });
    if(!r2.ok) throw new Error(`Nem tudtam betölteni: ${path}`);
    return await r2.json();
  }

  function getName(p){
    return (p.name_hu || p.name_en || p.name || "");
  }
  function getFlavor(p){
    return state.lang === "en"
      ? (p.flavor_en || p.flavor_hu || p.flavor || "")
      : (p.flavor_hu || p.flavor_en || p.flavor || "");
  }

  function catLabel(c){
    if(!c) return "";
    return (c.label_hu || c.label_en || c.id);
  }

  function orderedCategories(){
    const cats = (state.productsDoc.categories || [])
      .filter(c => c && c.id)
      .map(c => ({
        id: String(c.id),
        label_hu: c.label_hu || c.id,
        label_en: c.label_en || c.label_hu || c.id,
        basePrice: Number(c.basePrice || 0)
      }))
      .sort((a,b) => catLabel(a).localeCompare(catLabel(b), "hu"));

    // Összes első, Hamarosan utolsó (fixen)
    return [
      { id:"all", label_hu:t("all"), label_en:t("all"), virtual:true },
      ...cats,
      { id:"soon", label_hu:t("soon"), label_en:t("soon"), virtual:true }
    ];
  }

  function effectivePrice(p){
    const price = p.price;
    if(price !== null && price !== undefined && price !== "" && Number.isFinite(Number(price)) && Number(price) > 0){
      return Number(price);
    }
    const c = (state.productsDoc.categories || []).find(x => String(x.id) === String(p.categoryId));
    const bp = c ? Number(c.basePrice || 0) : 0;
    return Number.isFinite(bp) ? bp : 0;
  }

  function isOut(p){
    const st = (p.status || "ok");
    const stock = Math.max(0, Number(p.stock || 0));
    return st === "out" || stock <= 0;
  }

  function filterList(){
    const q = norm(state.search);

    let list = (state.productsDoc.products || []).map(p => ({
      ...p,
      categoryId: String(p.categoryId || ""),
      status: (p.status === "soon" || p.status === "out" || p.status === "ok") ? p.status : "ok",
      stock: Math.max(0, Number(p.stock || 0))
    }));

    if(state.active === "soon"){
      list = list.filter(p => p.status === "soon");
    }else{
      // soon termékek csak hamarosan tabban
      list = list.filter(p => p.status !== "soon");
      if(state.active !== "all"){
        list = list.filter(p => String(p.categoryId) === String(state.active));
      }
    }

    if(q){
      list = list.filter(p => {
        const hay = norm(getName(p) + " " + getFlavor(p));
        return hay.includes(q);
      });
    }

    // ✅ out mindenhol leghátul: két szekció
    const okPart = list.filter(p => !isOut(p));
    const outPart = list.filter(p => isOut(p));

    const groupSort = (arr) => {
      const map = new Map();
      for(const p of arr){
        const key = norm(getName(p));
        if(!map.has(key)) map.set(key, []);
        map.get(key).push(p);
      }
      const keys = [...map.keys()].sort((a,b)=> a.localeCompare(b, "hu"));
      const out = [];
      for(const k of keys){
        const items = map.get(k);
        items.sort((a,b) => norm(getFlavor(a)).localeCompare(norm(getFlavor(b))));
        out.push(...items);
      }
      return out;
    };

    return [...groupSort(okPart), ...groupSort(outPart)];
  }

  function renderNav(){
    const nav = $("#nav");
    nav.innerHTML = "";

    const cats = orderedCategories();
    for(const c of cats){
      const btn = document.createElement("button");
      btn.textContent = c.id === "all" ? t("all") : (c.id === "soon" ? t("soon") : catLabel(c));
      if(state.active === c.id) btn.classList.add("active");
      btn.onclick = () => {
        state.active = c.id;
        $("#title").textContent = btn.textContent;
        renderNav();
        renderGrid();
      };
      nav.appendChild(btn);
    }
  }

  function fmtFt(n){
    const v = Number(n || 0);
    return v.toLocaleString(state.lang === "hu" ? "hu-HU" : "en-US") + " Ft";
  }

  function renderGrid(){
    const grid = $("#grid");
    const empty = $("#empty");
    grid.innerHTML = "";

    const list = filterList();
    $("#count").textContent = String(list.length);

    empty.style.display = list.length ? "none" : "block";

    for(const p of list){
      const name = getName(p);
      const flavor = getFlavor(p);
      const stock = Math.max(0, Number(p.stock || 0));
      const out = isOut(p);
      const stockShown = out ? 0 : stock;
      const price = effectivePrice(p);

      const card = document.createElement("div");
      card.className = "card fade-in" + (out ? " dim" : "");

      const hero = document.createElement("div");
      hero.className = "hero";

      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = (name + (flavor ? " - " + flavor : "")).trim();
      img.src = p.image || "";
      // státusz alapú szürkeség (CSS nélkül)
      if(out){
        img.style.filter = "grayscale(1) brightness(0.40) contrast(0.95)";
      }else if(p.status === "soon"){
        img.style.filter = "grayscale(1) brightness(0.62) contrast(0.98)";
      }
      hero.appendChild(img);

      const badges = document.createElement("div");
      badges.className = "badges";
      if(p.status === "soon"){
        const b = document.createElement("div");
        b.className = "badge soon";
        b.textContent = t("soon");
        badges.appendChild(b);
      }else if(out){
        const b = document.createElement("div");
        b.className = "badge out";
        b.textContent = t("out");
        badges.appendChild(b);
      }
      hero.appendChild(badges);

      const ov = document.createElement("div");
      ov.className = "overlay-title";
      const n = document.createElement("div");
      n.className = "name";
      n.textContent = name || "—";
      const f = document.createElement("div");
      f.className = "flavor";
      f.textContent = flavor || "";
      // olvashatóság (CSS nélkül)
      f.style.fontSize = "15px";
      f.style.opacity = "0.92";
      f.style.letterSpacing = "0.2px";
      ov.appendChild(n);
      ov.appendChild(f);
      hero.appendChild(ov);

      const body = document.createElement("div");
      body.className = "card-body";

      // ✅ ár + készlet CSAK a kép alatt (ahogy kérted)
      const meta = document.createElement("div");
      meta.className = "meta-row";

      const priceEl = document.createElement("div");
      priceEl.className = "price";
      priceEl.textContent = fmtFt(price);

      const stockEl = document.createElement("div");
      stockEl.className = "stock";
      stockEl.innerHTML = `${t("stock")}: <b>${p.status === "soon" ? "—" : stockShown}</b> ${p.status === "soon" ? "" : t("pcs")}`;
      stockEl.style.fontSize = "13.5px";
      stockEl.style.opacity = "0.90";
      const sb = stockEl.querySelector("b");
      if(sb){ sb.style.fontSize = "14px"; sb.style.opacity = "0.98"; }

      meta.appendChild(priceEl);
      meta.appendChild(stockEl);
      body.appendChild(meta);

      card.appendChild(hero);
      card.appendChild(body);
      grid.appendChild(card);
    }
  }

  async function init(){
    $("#langLabel").textContent = state.lang.toUpperCase();
    $("#langBtn").onclick = () => {
      state.lang = state.lang === "hu" ? "en" : "hu";
      localStorage.setItem("sv_lang", state.lang);
      $("#langLabel").textContent = state.lang.toUpperCase();
      renderNav();
      renderGrid();
    };

    $("#search").addEventListener("input", (e) => {
      state.search = e.target.value || "";
      renderGrid();
    });

    // ✅ élő frissítés admin mentésnél (ha nyitva van a katalógus)
    let lastSig = "";

    const applyLive = (payload) => {
      if(payload && payload.doc){
        state.productsDoc = payload.doc;
        try{ lastSig = JSON.stringify(state.productsDoc); }catch{}
        renderNav();
        renderGrid();
        $("#loader").style.display = "none";
        $("#app").style.display = "block";
      }
    };

    try{
      const cached = localStorage.getItem("sv_live_payload");
      if(cached) applyLive(JSON.parse(cached));
    }catch{}

    try{
      const ch = new BroadcastChannel("sv_live");
      ch.onmessage = (ev) => applyLive(ev.data);
    }catch{}

    window.addEventListener("storage", (e) => {
      if(e.key === "sv_live_payload" && e.newValue){
        try{ applyLive(JSON.parse(e.newValue)); }catch{}
      }
    });

    $("#loaderText").textContent = "Termékek betöltése...";
    const data = await fetchJsonSmart("data/products.json");
    if(Array.isArray(data)){
      state.productsDoc = { categories: [], products: data };
    }else{
      state.productsDoc = {
        categories: Array.isArray(data.categories) ? data.categories : [],
        products: Array.isArray(data.products) ? data.products : []
      };
    }

    try{ lastSig = JSON.stringify(state.productsDoc); }catch{}

    try{
      const old = JSON.parse(localStorage.getItem("sv_live_payload") || "null");
      const payload = Object.assign({}, old||{}, { doc: state.productsDoc, ts: Date.now() });
      localStorage.setItem("sv_live_payload", JSON.stringify(payload));
    }catch{}

    renderNav();
    renderGrid();

    // ✅ másik eszközön is gyors frissülés (könnyű poll, no cache)
    setInterval(async () => {
      if(document.hidden) return;
      try{
        const fresh = await fetchJsonSmart("data/products.json");
        const doc = Array.isArray(fresh)
          ? { categories: [], products: fresh }
          : {
              categories: Array.isArray(fresh.categories) ? fresh.categories : [],
              products: Array.isArray(fresh.products) ? fresh.products : []
            };
        const sig = JSON.stringify(doc);
        if(sig && sig !== lastSig){
          lastSig = sig;
          state.productsDoc = doc;
          renderNav();
          renderGrid();
        }
      }catch{}
    }, 8000);

    $("#loader").style.display = "none";
    $("#app").style.display = "grid";
  }

  init().catch(err => {
    console.error(err);
    $("#loaderText").textContent = "Betöltési hiba. Nézd meg a konzolt.";
    // nincs alert/prompt (kérted)
  });
})();
