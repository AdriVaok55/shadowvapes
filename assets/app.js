/* assets/app.js */
(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    lang: localStorage.getItem("sv_lang") || "hu",
    category: "Összes termék",
    data: { categories: [], products: [] },
  };

  function norm(s) {
    return String(s || "").trim().toLowerCase();
  }

  function getText(obj, key, lang) {
    // támogatott formák:
    // {name:{hu,en}} vagy {nameHu,nameEn} vagy {name, name_en}
    if (!obj) return "";
    const v = obj[key];
    if (v && typeof v === "object") return v[lang] || v.hu || v.en || "";
    const a = obj[`${key}${lang.toUpperCase()}`];
    if (a) return a;
    const b = obj[`${key}_${lang}`];
    if (b) return b;
    // fallback
    return obj[key] || obj[`${key}Hu`] || obj[`${key}En`] || "";
  }

  function orderCategories(list) {
    const uniq = Array.from(new Set(list.map((x) => String(x).trim()).filter(Boolean)));

    const all = "Összes termék";
    const soon = "Hamarosan";

    const middle = uniq.filter((c) => c !== all && c !== soon).sort((a, b) => a.localeCompare(b, "hu"));
    const out = [];
    out.push(all);
    out.push(...middle);
    out.push(soon);
    return out;
  }

  function parseProductsJson(raw) {
    // raw lehet: array (products) vagy {products, categories}
    if (Array.isArray(raw)) {
      const products = raw;
      const categories = orderCategories([
        "Összes termék",
        ...products.map((p) => p.category || p.kategoria).filter(Boolean),
        "Hamarosan",
      ]);
      return { products, categories };
    }
    const products = Array.isArray(raw.products) ? raw.products : [];
    const cats = Array.isArray(raw.categories) ? raw.categories : [];
    const categories = orderCategories(
      cats.length
        ? cats
        : ["Összes termék", ...products.map((p) => p.category || p.kategoria).filter(Boolean), "Hamarosan"]
    );
    return { products, categories };
  }

  async function loadData() {
    const res = await fetch(`data/products.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Nem tudom betölteni: data/products.json");
    const raw = await res.json();
    state.data = parseProductsJson(raw);
  }

  function renderCategories() {
    const nav = $("categoryNav");
    nav.innerHTML = "";

    state.data.categories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.textContent = cat;
      btn.className = cat === state.category ? "active" : "";
      btn.onclick = () => {
        state.category = cat;
        renderAll();
      };
      nav.appendChild(btn);
    });
  }

  function visibleProducts() {
    const cat = state.category;
    const products = state.data.products.slice();

    // státusz: soon csak hamarosan fülön
    const filtered = products.filter((p) => {
      const status = (p.status || "ok").toLowerCase();
      if (cat === "Hamarosan") return status === "soon";
      if (status === "soon") return false;

      if (cat === "Összes termék") return true;
      return (p.category || p.kategoria) === cat;
    });

    // azonos nevűek egymás mellett => sort by name (HU)
    filtered.sort((a, b) => {
      const an = norm(getText(a, "name", "hu") || a.name || a.nev);
      const bn = norm(getText(b, "name", "hu") || b.name || b.nev);
      if (an !== bn) return an.localeCompare(bn, "hu");
      const af = norm(getText(a, "flavor", "hu") || a.flavor || a.iz);
      const bf = norm(getText(b, "flavor", "hu") || b.flavor || b.iz);
      if (af !== bf) return af.localeCompare(bf, "hu");
      const aid = String(a.id || "");
      const bid = String(b.id || "");
      return aid.localeCompare(bid);
    });

    return filtered;
  }

  function cardEl(p) {
    const status = (p.status || "ok").toLowerCase();
    const stock = Number.isFinite(+p.stock) ? +p.stock : +p.keszlet || 0;
    const isOut = status === "out" || stock <= 0;
    const isSoon = status === "soon";

    const name = getText(p, "name", state.lang) || p.name || p.nev || "Névtelen";
    const flavor = getText(p, "flavor", state.lang) || p.flavor || p.iz || "";
    const price = Number.isFinite(+p.price) ? +p.price : +p.ar || 0;
    const img = p.image || p.img || p.kep || "";

    const div = document.createElement("div");
    div.className = `card ${isOut ? "dim" : ""}`;

    div.innerHTML = `
      <div class="hero">
        ${img ? `<img loading="lazy" src="${img}" alt="">` : ``}
        <div class="badges">
          ${isSoon ? `<span class="badge soon">Hamarosan</span>` : ``}
          ${isOut && !isSoon ? `<span class="badge out">Elfogyott</span>` : ``}
        </div>
        <div class="overlay-title">
          <div class="name">${escapeHtml(name)}</div>
          <div class="flavor">${escapeHtml(flavor)}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="meta-row">
          <div class="price">${price ? `${fmtFt(price)} Ft` : ""}</div>
          <div class="stock">${isSoon ? "" : `Készlet: <b>${Math.max(0, stock)}</b>`}</div>
        </div>
      </div>
    `;
    return div;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
  function fmtFt(n) {
    return new Intl.NumberFormat("hu-HU").format(Math.round(n));
  }

  function renderGrid() {
    const grid = $("productGrid");
    const list = visibleProducts();
    grid.innerHTML = "";
    list.forEach((p) => grid.appendChild(cardEl(p)));
    $("countLabel").textContent = `${list.length} db`;
  }

  function renderTop() {
    $("pageTitle").textContent = state.category;
    $("langLabel").textContent = state.lang.toUpperCase();
  }

  function renderAll() {
    renderCategories();
    renderTop();
    renderGrid();
  }

  async function init() {
    $("langToggle").onclick = () => {
      state.lang = state.lang === "hu" ? "en" : "hu";
      localStorage.setItem("sv_lang", state.lang);
      renderAll();
    };

    await loadData();
    // default category
    const cats = state.data.categories;
    if (!cats.includes(state.category)) state.category = cats[0] || "Összes termék";

    renderAll();
    const loader = $("loader");
    if (loader) loader.style.display = "none";
  }

  init().catch((e) => {
    console.error(e);
    const loader = $("loader");
    if (loader) loader.querySelector(".loader-sub").textContent = "Hiba a betöltésnél 😭";
  });
})();
