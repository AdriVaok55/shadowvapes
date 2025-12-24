(() => {
  const $ = (s) => document.querySelector(s);

  const state = {
    lang: localStorage.getItem("sv_lang") || "hu",
    active: "all",
    productsDoc: { categories: [], products: [] },
    sales: [],
    search: "",
    etagProducts: "",
    etagSales: "",
  };

  const UI = {
    all: "Összes termék",
    soon: "Hamarosan",
    stock: "Készlet",
    pcs: "db",
    out: "Elfogyott",
    hot: "Felkapott",
    newTitle: "Új termékek elérhetőek",
    newDont: "Ne mutasd többször",
    newOk: "Értettem",
  };
  const t = (k) => UI[k] || k;

  const norm = (s) =>
    (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  function catLabel(c) {
    return (c && (c.label_hu || c.label_en || c.id)) || "";
  }

  function getName(p) {
    return (p && (p.name_hu || p.name_en || p.name)) || "";
  }
  function getFlavor(p) {
    if (!p) return "";
    return state.lang === "en"
      ? (p.flavor_en || p.flavor_hu || p.flavor || "")
      : (p.flavor_hu || p.flavor_en || p.flavor || "");
  }
  function localeForLang() {
    return state.lang === "en" ? "en" : "hu";
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
    // soon-nál a stock ne csinálja out-t
    return st === "out" || (st !== "soon" && stock <= 0);
  }

  function ensureInjectedStyles() {
    if (document.getElementById("sv_hot_styles")) return;

    const style = document.createElement("style");
    style.id = "sv_hot_styles";
    style.textContent = `
      /* HOT border: 1 szín szegmens körbemegy, fade, szín vált */
      .sv-hot { position: relative; }
      .sv-hot::before{
        content:"";
        position:absolute;
        inset:-2px;
        border-radius: 22px;
        padding:2px;
        background:
          conic-gradient(from 0deg,
            rgba(0,0,0,0) 0deg 322deg,
            var(--svHot, rgba(0,212,255,.95)) 322deg 360deg
          );
        -webkit-mask:
          linear-gradient(#000 0 0) content-box,
          linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
                mask-composite: exclude;
        filter: blur(.0px);
        opacity: .92;
        pointer-events:none;
        animation: svHotSpin 1.85s linear infinite, svHotColor 7.8s linear infinite, svHotPulse 1.85s ease-in-out infinite;
      }
      .sv-hot::after{
        content:"";
        position:absolute;
        inset:-6px;
        border-radius: 26px;
        background: radial-gradient(closest-side, rgba(124,92,255,.30), rgba(0,0,0,0));
        opacity:.10;
        pointer-events:none;
      }
      @keyframes svHotSpin{ from{ transform: rotate(0deg);} to{ transform: rotate(360deg);} }
      @keyframes svHotPulse{
        0%, 15%{ opacity:.0; }
        30%, 70%{ opacity:.92; }
        100%{ opacity:.0; }
      }
      @keyframes svHotColor{
        0%{ --svHot: rgba(0,212,255,.95); }
        25%{ --svHot: rgba(168,85,247,.95); }
        50%{ --svHot: rgba(34,211,238,.95); }
        75%{ --svHot: rgba(244,114,182,.95); }
        100%{ --svHot: rgba(0,212,255,.95); }
      }

      /* NEW popup (design-hoz illő, CSS fájl nélkül) */
      .sv-new-backdrop{
        position:fixed; inset:0;
        background: rgba(0,0,0,.55);
        backdrop-filter: blur(10px);
        display:flex; align-items:center; justify-content:center;
        z-index: 9999;
      }
      .sv-new-modal{
        width:min(920px, calc(100% - 26px));
        border-radius: 22px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(11,15,23,.82);
        box-shadow: 0 24px 80px rgba(0,0,0,.55);
        overflow:hidden;
      }
      .sv-new-top{
        display:flex; align-items:center; justify-content:space-between;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255,255,255,.07);
      }
      .sv-new-top .ttl{ font-weight: 900; letter-spacing:.2px; }
      .sv-new-viewport{ position:relative; overflow:hidden; }
      .sv-new-track{
        display:flex;
        will-change: transform;
        transition: transform 520ms cubic-bezier(.2,.9,.2,1);
      }
      .sv-new-slide{
        flex:0 0 100%;
        display:grid;
        grid-template-columns: 1.05fr .95fr;
        gap: 14px;
        padding: 14px;
      }
      @media (max-width: 820px){
        .sv-new-slide{ grid-template-columns: 1fr; }
      }
      .sv-new-img{
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.03);
        overflow:hidden;
        aspect-ratio: 1/1;
      }
      .sv-new-img img{ width:100%; height:100%; object-fit:cover; display:block; }
      .sv-new-info{
        display:flex; flex-direction:column; gap:10px; justify-content:center;
        padding: 6px 6px 6px 2px;
      }
      .sv-new-name{ font-weight: 950; font-size: 22px; line-height:1.15; }
      .sv-new-flavor{ opacity:.96; font-size: 16.5px; }
      .sv-new-price{ font-weight: 900; font-size: 18px; }
      .sv-new-actions{
        display:flex; gap:10px; align-items:center; justify-content:space-between;
        padding: 12px 16px;
        border-top: 1px solid rgba(255,255,255,.07);
      }
      .sv-new-actions label{
        display:flex; gap:8px; align-items:center;
        opacity:.9; font-size: 13.5px;
        user-select:none;
      }
      .sv-new-actions button{
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        color: inherit;
        padding: 10px 12px;
        cursor: pointer;
        font-weight: 800;
      }
      .sv-new-actions button:hover{ background: rgba(255,255,255,.09); }
      .sv-new-dots{
        display:flex; gap:6px; align-items:center; justify-content:center;
        padding: 10px 0 0 0;
      }
      .sv-new-dot{
        width: 7px; height: 7px; border-radius: 99px;
        background: rgba(255,255,255,.22);
      }
      .sv-new-dot.on{ background: rgba(255,255,255,.66); }
      `;
    document.head.appendChild(style);
  }

  /* ----------------- Source resolving (RAW preferált, custom domainen is) ----------------- */
  let source = null; // {owner, repo, branch}

  async function validateSource(s){
    try{
      if(!s || !s.owner || !s.repo || !s.branch) return false;
      const testUrl = `https://raw.githubusercontent.com/${s.owner}/${s.repo}/${s.branch}/data/products.json?_=${Date.now()}`;
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
        try { localStorage.removeItem("sv_source"); } catch {}
      }
    } catch {}

    // 2) stabil fájl: data/sv_source.json (admin írja)
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

    const branches = [or.branch, "main", "master", "gh-pages"]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);

    for (const br of branches) {
      const testUrl = `https://raw.githubusercontent.com/${or.owner}/${or.repo}/${br}/data/products.json?_=${Date.now()}`;
      try {
        const r = await fetch(testUrl, { cache: "no-store" });
        if (r.ok) {
          source = { owner: or.owner, repo: or.repo, branch: br };
          try { localStorage.setItem("sv_source", JSON.stringify(source)); } catch {}
          return source;
        }
      } catch {}
    }
    return null;
  }

  async function fetchJsonFile(path, { forceBust = false } = {}) {
    const src = await resolveSource();
    const relBase = `data/${path}`;
    const rawBase = src ? `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${src.branch}/data/${path}` : null;

    const mkUrl = (base) => forceBust ? `${base}${base.includes("?") ? "&" : "?"}_=${Date.now()}` : base;

    const headers = {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    };

    if (rawBase) {
      try {
        const r = await fetch(mkUrl(rawBase), { cache: "no-store", headers });
        if (r.ok) return await r.json();
        try { localStorage.removeItem("sv_source"); } catch {}
        source = null;
      } catch {
        try { localStorage.removeItem("sv_source"); } catch {}
        source = null;
      }
    }

    const r = await fetch(mkUrl(relBase), { cache: "no-store", headers });
    if (!r.ok) throw new Error(`Nem tudtam betölteni: ${path} (${r.status})`);
    return await r.json();
  }

  function normalizeDoc(data) {
    if (Array.isArray(data)) return { categories: [], products: data };
    const categories = data && Array.isArray(data.categories) ? data.categories : [];
    const products = data && Array.isArray(data.products) ? data.products : [];
    return { categories, products };
  }

  function normalizeSales(raw) {
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map(s => {
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
        date: String(s.date || s.day || s.createdAt || "").split("T")[0].split(" ")[0],
        name: s.name || "",
        payment: s.payment || s.method || "",
        items
      };
    }).filter(s => s.id);
  }

  /* ----------------- HOT per category ----------------- */
  function computeSoldMap() {
    const m = new Map();
    for (const s of state.sales || []) {
      for (const it of (s.items || [])) {
        const pid = String(it.productId || "");
        if (!pid) continue;
        const q = Number(it.qty || 0);
        if (!Number.isFinite(q) || q <= 0) continue;
        m.set(pid, (m.get(pid) || 0) + q);
      }
    }
    return m;
  }

  function computeHotByCategory() {
    const sold = computeSoldMap();
    const locale = localeForLang();
    const hot = new Map(); // categoryId -> productId

    const cats = (state.productsDoc.categories || []).map(c => String(c.id));
    for (const cid of cats) {
      const candidates = (state.productsDoc.products || [])
        .filter(p => p && String(p.categoryId || "") === cid)
        .filter(p => p.visible !== false);

      if (!candidates.length) continue;

      let max = -1;
      for (const p of candidates) {
        const v = sold.get(String(p.id)) || 0;
        if (v > max) max = v;
      }
      const tied = candidates.filter(p => (sold.get(String(p.id)) || 0) === max);

      tied.sort((a, b) => {
        const fa = (state.lang === "en" ? (a.flavor_en || a.flavor_hu || "") : (a.flavor_hu || a.flavor_en || "")) || "";
        const fb = (state.lang === "en" ? (b.flavor_en || b.flavor_hu || "") : (b.flavor_hu || b.flavor_en || "")) || "";
        const c1 = fa.localeCompare(fb, locale, { sensitivity: "base" });
        if (c1) return c1;
        const c2 = getName(a).localeCompare(getName(b), "hu", { sensitivity: "base" });
        if (c2) return c2;
        return String(a.id).localeCompare(String(b.id), "en");
      });

      hot.set(cid, String(tied[0].id));
    }
    return hot;
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
      }))
      .sort((a, b) => catLabel(a).localeCompare(catLabel(b), "hu"));

    return [
      { id: "all", label_hu: t("all"), label_en: t("all"), virtual: true },
      ...cats,
      { id: "soon", label_hu: t("soon"), label_en: t("soon"), virtual: true },
    ];
  }

  function filterList() {
    const q = norm(state.search);
    const hotByCat = computeHotByCategory();

    let list = (state.productsDoc.products || []).map((p) => ({
      ...p,
      id: String(p.id || ""),
      categoryId: String(p.categoryId || ""),
      status: p.status === "soon" || p.status === "out" || p.status === "ok" ? p.status : "ok",
      stock: Math.max(0, Number(p.stock || 0)),
      visible: p.visible !== false,
      isNew: !!p.isNew,
    })).filter(p => p.id);

    // csak láthatók
    list = list.filter(p => p.visible);

    if (state.active === "soon") {
      list = list.filter((p) => p.status === "soon");
    } else {
      if (state.active !== "all") {
        list = list.filter((p) => String(p.categoryId) === String(state.active));
      }
      // soon itt is látszik
    }

    if (q) {
      list = list.filter((p) => norm(getName(p) + " " + getFlavor(p)).includes(q));
    }

    // hot kiemelés: active kategória alatt 1 db, all alatt kategóriánként 1 db (mind elöl)
    const hotIds = new Set();
    if (state.active === "all") {
      for (const [cid, pid] of hotByCat.entries()) {
        hotIds.add(pid);
      }
    } else if (state.active !== "soon") {
      const pid = hotByCat.get(String(state.active));
      if (pid) hotIds.add(pid);
    }

    const hotItems = [];
    const rest = [];
    for (const p of list) {
      if (hotIds.has(String(p.id))) hotItems.push(p);
      else rest.push(p);
    }

    const okPart = rest.filter((p) => p.status === "ok" && !isOut(p));
    const soonPart = rest.filter((p) => p.status === "soon"); // soon mindig a végén, de out előtt
    const outPart = rest.filter((p) => isOut(p));

    const groupSort = (arr) => {
      const map = new Map();
      for (const p of arr) {
        const key = norm(getName(p));
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(p);
      }
      const keys = [...map.keys()].sort((a, b) => a.localeCompare(b, "hu"));
      const out = [];
      for (const k of keys) {
        const items = map.get(k);
        items.sort((a, b) => norm(getFlavor(a)).localeCompare(norm(getFlavor(b)), localeForLang(), { sensitivity: "base" }));
        out.push(...items);
      }
      return out;
    };

    // all tabon: több hot van -> kategória sorrend szerint rakjuk előre
    if (state.active === "all" && hotItems.length > 1) {
      const order = orderedCategories().map(c => c.id);
      hotItems.sort((a,b) => order.indexOf(String(a.categoryId)) - order.indexOf(String(b.categoryId)));
    }

    return [...hotItems, ...groupSort(okPart), ...groupSort(soonPart), ...groupSort(outPart)];
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

  function renderGrid() {
    ensureInjectedStyles();

    const grid = $("#grid");
    const empty = $("#empty");
    grid.innerHTML = "";

    const list = filterList();
    $("#count").textContent = String(list.length);
    empty.style.display = list.length ? "none" : "block";

    // hot set a badge-hez
    const hotByCat = computeHotByCategory();
    const hotSet = new Set();
    if (state.active === "all") for (const v of hotByCat.values()) hotSet.add(String(v));
    else if (state.active !== "soon") {
      const v = hotByCat.get(String(state.active));
      if (v) hotSet.add(String(v));
    }

    for (const p of list) {
      const name = getName(p);
      const flavor = getFlavor(p);
      const out = isOut(p);
      const price = effectivePrice(p);

      const isHot = hotSet.has(String(p.id));

      const card = document.createElement("div");
      card.className = "card fade-in" + (out ? " dim" : "") + (isHot ? " sv-hot" : "");

      const hero = document.createElement("div");
      hero.className = "hero";

      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = (name + (flavor ? " - " + flavor : "")).trim();
      img.src = p.image || "";

      // státusz alapú szürkeség (CSS nélkül)
      if (out) {
        img.style.filter = "grayscale(1) brightness(0.20) contrast(0.92)";
      } else if (p.status === "soon") {
        // kevésbé szürke, mint eddig
        img.style.filter = "grayscale(0.55) brightness(0.92) contrast(1.02)";
      }
      hero.appendChild(img);

      const badges = document.createElement("div");
      badges.className = "badges";

      if (isHot) {
        const b = document.createElement("div");
        b.className = "badge";
        b.style.background = "rgba(255,255,255,.10)";
        b.style.border = "1px solid rgba(255,255,255,.18)";
        b.style.backdropFilter = "blur(10px)";
        b.style.fontWeight = "900";
        b.textContent = "🔥 " + t("hot");
        badges.appendChild(b);
      }

      if (p.status === "soon") {
        const b = document.createElement("div");
        b.className = "badge soon";
        b.textContent = t("soon");
        badges.appendChild(b);
      } else if (out) {
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
      f.style.fontSize = "16.5px";
      f.style.opacity = "0.98";
      f.style.letterSpacing = "0.2px";

      ov.appendChild(n);
      ov.appendChild(f);
      hero.appendChild(ov);

      const body = document.createElement("div");
      body.className = "card-body";

      const meta = document.createElement("div");
      meta.className = "meta-row";

      const priceEl = document.createElement("div");
      priceEl.className = "price";
      priceEl.textContent = fmtFt(price);

      const stockEl = document.createElement("div");
      stockEl.className = "stock";
      const stockShown = out ? 0 : Math.max(0, Number(p.stock || 0));
      stockEl.innerHTML =
        p.status === "soon"
          ? `${t("stock")}: <b>—</b>`
          : `${t("stock")}: <b>${stockShown}</b> ${t("pcs")}`;
      stockEl.style.fontSize = "14.5px";
      stockEl.style.opacity = "0.98";
      const sb = stockEl.querySelector("b");
      if (sb) {
        sb.style.fontSize = "15.5px";
        sb.style.opacity = "1";
      }

      meta.appendChild(priceEl);
      meta.appendChild(stockEl);
      body.appendChild(meta);

      card.appendChild(hero);
      card.appendChild(body);
      grid.appendChild(card);
    }
  }

  /* ----------------- NEW popup ----------------- */
  let popupShownSig = "";

  function getDismissedNewIds() {
    try {
      const arr = JSON.parse(localStorage.getItem("sv_new_dismissed") || "[]");
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
      return new Set();
    }
  }
  function setDismissedNewIds(set) {
    try {
      localStorage.setItem("sv_new_dismissed", JSON.stringify([...set]));
    } catch {}
  }

  function maybeShowNewPopup() {
    // csak ha van olyan "isNew", amit még nem dismisseltek
    const dismissed = getDismissedNewIds();
    const newItems = (state.productsDoc.products || [])
      .filter(p => p && p.visible !== false)
      .filter(p => !!p.isNew)
      .map(p => ({
        id: String(p.id || ""),
        name: getName(p),
        flavor: getFlavor(p),
        price: effectivePrice(p),
        image: p.image || ""
      }))
      .filter(p => p.id);

    const pending = newItems.filter(p => !dismissed.has(p.id));
    if (!pending.length) return;

    // ne spammeljünk: ugyanazt a listát csak egyszer mutassuk session-ben
    const sig = pending.map(x => x.id).sort().join("|") + "|" + state.lang;
    if (sig === popupShownSig) return;
    popupShownSig = sig;

    ensureInjectedStyles();

    // backdrop
    const bg = document.createElement("div");
    bg.className = "sv-new-backdrop";

    const modal = document.createElement("div");
    modal.className = "sv-new-modal";

    const top = document.createElement("div");
    top.className = "sv-new-top";
    top.innerHTML = `<div class="ttl">${t("newTitle")}</div><div style="opacity:.65;font-size:12.5px;">(${pending.length})</div>`;

    const viewport = document.createElement("div");
    viewport.className = "sv-new-viewport";

    const track = document.createElement("div");
    track.className = "sv-new-track";

    const dots = document.createElement("div");
    dots.className = "sv-new-dots";

    pending.forEach((p, idx) => {
      const slide = document.createElement("div");
      slide.className = "sv-new-slide";
      slide.innerHTML = `
        <div class="sv-new-img"><img alt="" loading="eager" src="${p.image}"></div>
        <div class="sv-new-info">
          <div class="sv-new-name">${escapeHtml(p.name || "—")}</div>
          <div class="sv-new-flavor">${escapeHtml(p.flavor || "")}</div>
          <div class="sv-new-price">${escapeHtml(fmtFt(p.price))}</div>
          <div class="small-muted" style="margin-top:6px;opacity:.75;">Új termékek elérhetőek ✨</div>
        </div>
      `;
      track.appendChild(slide);

      const d = document.createElement("div");
      d.className = "sv-new-dot" + (idx === 0 ? " on" : "");
      dots.appendChild(d);
    });

    viewport.appendChild(track);

    const actions = document.createElement("div");
    actions.className = "sv-new-actions";
    actions.innerHTML = `
      <label><input type="checkbox" id="svNewDont" /> ${t("newDont")}</label>
      <button id="svNewOk">${t("newOk")}</button>
    `;

    modal.appendChild(top);
    modal.appendChild(viewport);
    modal.appendChild(dots);
    modal.appendChild(actions);
    bg.appendChild(modal);
    document.body.appendChild(bg);

    const dont = actions.querySelector("#svNewDont");
    const okBtn = actions.querySelector("#svNewOk");

    let idx = 0;
    let timer = null;

    const setIdx = (i) => {
      idx = (i + pending.length) % pending.length;
      track.style.transform = `translateX(-${idx * 100}%)`;
      [...dots.children].forEach((x, j) => x.classList.toggle("on", j === idx));
    };

    const start = () => {
      if (pending.length <= 1) return;
      timer = setInterval(() => setIdx(idx + 1), 3200);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    bg.addEventListener("click", (e) => {
      if (e.target === bg) {
        // backdrop click: csak bezár, nem dismissel
        stop();
        bg.remove();
      }
    });

    okBtn.onclick = () => {
      if (dont && dont.checked) {
        const s = getDismissedNewIds();
        pending.forEach(p => s.add(p.id));
        setDismissedNewIds(s);
      }
      stop();
      bg.remove();
    };

    // swipe (teló)
    let sx = 0;
    viewport.addEventListener("touchstart", (e) => { sx = e.touches?.[0]?.clientX || 0; stop(); }, { passive:true });
    viewport.addEventListener("touchend", (e) => {
      const ex = e.changedTouches?.[0]?.clientX || 0;
      const dx = ex - sx;
      if (Math.abs(dx) > 40) setIdx(idx + (dx < 0 ? 1 : -1));
      start();
    });

    start();
  }

  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
  }

  /* ----------------- Live updates ----------------- */
  let lastSig = "";

  function applyData(doc, sales) {
    if (!doc) return;
    const sig = JSON.stringify(doc) + "||" + JSON.stringify(sales || []);
    if (sig && sig === lastSig) return;
    lastSig = sig;

    state.productsDoc = doc;
    if (Array.isArray(sales)) state.sales = sales;

    renderNav();
    renderGrid();

    $("#loader").style.display = "none";
    $("#app").style.display = "grid";

    // popup: ha kell
    try { maybeShowNewPopup(); } catch {}
  }

  async function init() {
    applySyncParams();
    $("#langLabel").textContent = state.lang.toUpperCase();
    $("#langBtn").onclick = () => {
      state.lang = state.lang === "hu" ? "en" : "hu";
      localStorage.setItem("sv_lang", state.lang);
      $("#langLabel").textContent = state.lang.toUpperCase();
      renderNav();
      renderGrid();
      // popup nyelv váltásnál ne erőltesd újra
    };

    $("#search").addEventListener("input", (e) => {
      state.search = e.target.value || "";
      renderGrid();
    });

    // ugyanazon böngészőben azonnali update admin mentésnél
    try {
      const cached = localStorage.getItem("sv_live_payload");
      if (cached) {
        const j = JSON.parse(cached);
        if (j && j.doc) applyData(normalizeDoc(j.doc), normalizeSales(j.sales || []));
      }
    } catch {}

    try {
      const ch = new BroadcastChannel("sv_live");
      ch.onmessage = (ev) => {
        if (ev && ev.data && ev.data.doc) {
          applyData(normalizeDoc(ev.data.doc), normalizeSales(ev.data.sales || []));
        }
      };
    } catch {}

    window.addEventListener("storage", (e) => {
      if (e.key === "sv_live_payload" && e.newValue) {
        try {
          const j = JSON.parse(e.newValue);
          if (j && j.doc) applyData(normalizeDoc(j.doc), normalizeSales(j.sales || []));
        } catch {}
      }
    });

    $("#loaderText").textContent = "Termékek betöltése…";

    const rawP = await fetchJsonFile("products.json", { forceBust: true });
    const rawS = await fetchJsonFile("sales.json", { forceBust: true }).catch(() => []);
    applyData(normalizeDoc(rawP), normalizeSales(rawS));

    // poll: products 2s aktív, sales 8s aktív; háttér 12s/30s
    let tick = 0;

    async function pollProducts(forceBust = false) {
      try {
        const data = await fetchJsonFile("products.json", { forceBust });
        applyData(normalizeDoc(data), state.sales);
      } catch {}
    }

    async function pollSales(forceBust = false) {
      try {
        const data = await fetchJsonFile("sales.json", { forceBust });
        state.sales = normalizeSales(data);
        // csak re-render (doc ugyanaz)
        applyData(state.productsDoc, state.sales);
      } catch {}
    }

    async function burst() {
      for (let i = 0; i < 3; i++) {
        await pollProducts(true);
        await new Promise((r) => setTimeout(r, 280));
      }
      await pollSales(true);
    }

    async function loop() {
      tick++;
      const force = tick % 7 === 0; // kb 14s
      await pollProducts(force);
      if (tick % 4 === 0) await pollSales(force); // kb 8s

      const next = document.hidden ? 12000 : 2000;
      setTimeout(loop, next);
    }

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) burst();
    });

    loop();
  }

  init().catch((err) => {
    console.error(err);
    $("#loaderText").textContent =
      "Betöltési hiba. (Nyisd meg a konzolt.) Ha telefonon vagy custom domainen vagy: nyisd meg egyszer a Sync linket az admin Beállításokból.";
  });
})();