(() => {
  const $ = (s) => document.querySelector(s);

  /* ----------------- State ----------------- */
  const state = {
    lang: "hu",
    productsDoc: { categories: [], products: [], popups: [] },
    salesDoc: { sales: [] },
    activeCat: "all",
    search: "",
    loaded: false,

    // live sync
    source: null,
    lastDocSig: null,
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

  // ✅ Nyelv váltás: CSAK az ízek változnak, minden UI marad magyar
  const t = (k) => (UI[k] ? UI[k].hu : k);

  // ✅ UI rendezés is marad HU
  const locale = () => "hu";

  const norm = (s) =>
    (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  function getName(p) {
    return (p && (p.name_hu || p.name_en || p.name)) || "";
  }
  function getFlavor(p) {
    if (!p) return "";
    return state.lang === "en"
      ? (p.flavor_en || p.flavor_hu || p.flavor || "")
      : (p.flavor_hu || p.flavor_en || p.flavor || "");
  }

  function catLabel(c) {
    return (c && (c.label_hu || c.label_en || c.id)) || "";
  }

  // ✅ Hamarosan hónap: év nélkül
  function formatMonth(monthStr) {
    if (!monthStr) return "";
    try {
      const parts = String(monthStr).split("-");
      const month = parts[1] || parts[0];
      const monthNum = parseInt(month, 10);
      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) return String(monthStr);

      const monthNames = ["Január", "Február", "Március", "Április", "Május", "Június",
        "Július", "Augusztus", "Szeptember", "Október", "November", "December"];

      return monthNames[monthNum - 1];
    } catch {
      return String(monthStr);
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
    if (!p) return false;
    const st = String(p.status || "").toLowerCase();
    return st === "out" || st === "soldout" || st === "sold-out";
  }

  function isSoon(p) {
    if (!p) return false;
    const st = String(p.status || "").toLowerCase();
    return st === "soon" || st === "hamarosan";
  }

  function fmtFt(n) {
    const v = Number(n || 0) || 0;
    return v.toLocaleString("hu-HU") + " Ft";
  }

  async function loadDocs() {
    try {
      const res = await fetch("data/products.json?v=" + Date.now());
      const doc = await res.json();
      state.productsDoc = doc || { categories: [], products: [], popups: [] };
    } catch (e) {
      console.error("products.json load error", e);
      state.productsDoc = { categories: [], products: [], popups: [] };
    }

    try {
      const res = await fetch("data/sales.json?v=" + Date.now());
      const doc = await res.json();
      state.salesDoc = doc || { sales: [] };
    } catch (e) {
      console.error("sales.json load error", e);
      state.salesDoc = { sales: [] };
    }
  }

  /* ----------------- Live source sync (optional) ----------------- */
  function docSignature(doc) {
    try {
      return JSON.stringify(doc);
    } catch {
      return null;
    }
  }

  function applyDocIfNewer(doc, meta = {}) {
    const sig = docSignature(doc);
    if (!sig) return false;
    if (state.lastDocSig === sig) return false;
    state.lastDocSig = sig;
    state.productsDoc = doc;
    state.source = meta.source || state.source || null;
    return true;
  }

  function hydrateFromLivePayload() {
    try {
      const raw = localStorage.getItem("sv_live_payload");
      if (!raw) return false;
      const payload = JSON.parse(raw);
      if (!payload || !payload.doc) return false;

      const ts = Number(payload.ts || 0) || 0;
      if (!ts || (Date.now() - ts) > 120000) return false;

      const docChanged = applyDocIfNewer(payload.doc, { source: "live" });
      if (!docChanged) return false;

      renderNav();
      renderGrid();
      return true;
    } catch {
      return false;
    }
  }

  function listenLive() {
    window.addEventListener("storage", (e) => {
      if (e.key === "sv_live_payload") {
        hydrateFromLivePayload();
      }
    });
  }

  /* ----------------- Featured (Felkapott) ----------------- */
  function featuredProductIdForCategory(catId) {
    const cats = state.productsDoc.categories || [];
    const cat = cats.find((c) => String(c.id) === String(catId));
    if (!cat || cat.featuredEnabled === false) return null;

    const sales = (state.salesDoc && state.salesDoc.sales) || [];
    if (!sales.length) return null;

    const totals = new Map();
    for (const s of sales) {
      if (!s || !Array.isArray(s.items)) continue;
      for (const it of s.items) {
        const pid = String(it.productId || "");
        if (!pid) continue;

        const p = (state.productsDoc.products || []).find((x) => String(x.id) === pid);
        if (!p) continue;
        if (String(p.categoryId) !== String(catId)) continue;
        if (isOut(p)) continue;

        const q = Number(it.qty || 0) || 0;
        if (!q) continue;
        totals.set(pid, (totals.get(pid) || 0) + q);
      }
    }

    if (!totals.size) return null;

    let bestId = null;
    let best = -Infinity;
    for (const [pid, v] of totals.entries()) {
      if (v > best) {
        best = v;
        bestId = pid;
      } else if (v === best) {
        const pa = (state.productsDoc.products || []).find((x) => String(x.id) === bestId);
        const pb = (state.productsDoc.products || []).find((x) => String(x.id) === pid);
        const fa = norm(getFlavor(pa));
        const fb = norm(getFlavor(pb));
        if (fb < fa) bestId = pid;
      }
    }
    return bestId;
  }

  /* ----------------- Render nav ----------------- */
  function renderNav() {
    const nav = $("#nav");
    nav.innerHTML = "";

    const cats = (state.productsDoc.categories || []).slice();

    const btnAll = document.createElement("button");
    btnAll.textContent = t("all");
    btnAll.className = state.activeCat === "all" ? "active" : "";
    btnAll.onclick = () => {
      state.activeCat = "all";
      $("#title").textContent = t("all");
      renderNav();
      renderGrid();
    };
    nav.appendChild(btnAll);

    const btnSoon = document.createElement("button");
    btnSoon.textContent = t("soon");
    btnSoon.className = state.activeCat === "soon" ? "active" : "";
    btnSoon.onclick = () => {
      state.activeCat = "soon";
      $("#title").textContent = t("soon");
      renderNav();
      renderGrid();
    };
    nav.appendChild(btnSoon);

    cats.sort((a, b) => catLabel(a).localeCompare(catLabel(b), locale()));

    for (const c of cats) {
      if (!c || !c.id) continue;
      const id = String(c.id);
      const b = document.createElement("button");
      b.textContent = catLabel(c);
      b.className = state.activeCat === id ? "active" : "";
      b.onclick = () => {
        state.activeCat = id;
        $("#title").textContent = catLabel(c);
        renderNav();
        renderGrid();
      };
      nav.appendChild(b);
    }
  }

  /* ----------------- Render grid ----------------- */
  function renderGrid() {
    const grid = $("#grid");
    const empty = $("#empty");
    grid.innerHTML = "";

    const products = (state.productsDoc.products || []).filter(
      (p) => p && p.id && p.visible !== false
    );

    const q = norm(state.search);

    let list = products.slice();

    if (state.activeCat === "soon") {
      list = list.filter((p) => isSoon(p));
    } else if (state.activeCat !== "all") {
      list = list.filter((p) => String(p.categoryId) === String(state.activeCat));
    }

    if (q) {
      list = list.filter((p) => {
        const name = norm(getName(p));
        const fl = norm(getFlavor(p));
        return name.includes(q) || fl.includes(q);
      });
    }

    const byName = new Map();
    for (const p of list) {
      const key = norm(getName(p));
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(p);
    }

    const groups = [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0], locale()));

    let totalShown = 0;

    for (const [, items] of groups) {
      items.sort((a, b) => norm(getFlavor(a)).localeCompare(norm(getFlavor(b)), locale()));

      const catId = String(items[0].categoryId || "");
      const featuredId = featuredProductIdForCategory(catId);

      if (featuredId) {
        const idx = items.findIndex((x) => String(x.id) === String(featuredId));
        if (idx > 0) {
          const [it] = items.splice(idx, 1);
          items.unshift(it);
        }
      }

      for (const p of items) {
        const name = getName(p);
        const flavor = getFlavor(p);
        const price = effectivePrice(p);
        const stock = Number(p.stock || 0) || 0;
        const out = isOut(p);
        const soon = isSoon(p);
        const featured = featuredId && String(p.id) === String(featuredId);

        let stockShown = stock;
        if (out) stockShown = 0;

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

        // sold-out legyen szürke (CSS is)
        if (out) {
          img.style.filter = "grayscale(.75) contrast(.95) brightness(.85)";
        } else if (soon) {
          // hamarosan: kicsit szürkébb, de ne annyira mint az elfogyott
          img.style.filter = "grayscale(.25) contrast(.98) brightness(.92)";
        }

        const badges = document.createElement("div");
        badges.className = "badges";

        if (featured) {
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

          // Add expected month badge if available (háttér = hamarosan)
          if (p.soonEta) {
            const expectedBadge = document.createElement("div");
            expectedBadge.className = "badge soon";
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
        totalShown++;
      }
    }

    $("#count").textContent = String(totalShown);
    empty.style.display = totalShown ? "none" : "block";
  }

  /* ----------------- Popups (New products) ----------------- */
  function popupHideKey(pp) {
    const id = String(pp.id || "");
    const rev = Number(pp.rev || pp.updatedAt || pp.createdAt || 0) || 0;
    return `sv_popup_hide_${id}_${rev}`;
  }

  function buildPopupQueue() {
    const popups = (state.productsDoc.popups || []).filter(
      (pp) => pp && pp.id && (pp.enabled === false ? false : true)
    );
    popups.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    const products = (state.productsDoc.products || []).filter((p) => p && p.id && p.visible !== false);
    const cats = state.productsDoc.categories || [];

    const queue = [];

    for (const pp of popups) {
      try {
        if (localStorage.getItem(popupHideKey(pp)) === "1") continue;
      } catch {}

      const ids = new Set();
      for (const cid of pp.categoryIds || []) {
        for (const p of products) {
          if (String(p.categoryId) === String(cid)) ids.add(String(p.id));
        }
      }
      for (const pid of pp.productIds || []) {
        ids.add(String(pid));
      }

      const picked = [...ids]
        .map((id) => products.find((p) => String(p.id) === String(id)))
        .filter(Boolean);

      const byCat = new Map();
      for (const p of picked) {
        const cid = String(p.categoryId || "");
        if (!byCat.has(cid)) byCat.set(cid, []);
        byCat.get(cid).push(p);
      }

      const catIds = [...byCat.keys()].sort((a, b) => {
        const ca = cats.find((x) => String(x.id) === String(a));
        const cb = cats.find((x) => String(x.id) === String(b));
        return catLabel(ca).localeCompare(catLabel(cb), locale());
      });

      if (!catIds.length) continue;

      queue.push({
        popup: pp,
        categories: catIds.map((cid) => ({
          id: cid,
          label: catLabel(cats.find((x) => String(x.id) === String(cid)) || { id: cid, label_hu: cid, label_en: cid }),
          products: byCat
            .get(cid)
            .slice()
            .sort((a, b) => norm(getFlavor(a)).localeCompare(norm(getFlavor(b)), locale())),
        })),
      });
    }

    return queue;
  }

  function showPopupsIfNeeded() {
    const queue = buildPopupQueue();
    if (!queue.length) return;

    const existing = document.getElementById("popupBg");
    if (existing) existing.remove();

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
    let currentSlide = 0; // kategória slide index
    let currentProductSlide = 0; // termék slide index
    let slides = []; // termék slide-ok
    let slideInterval = null;

    // swipe-hoz: a legutóbb renderelt termék slider vezérlők
    let nextSlideFn = null;
    let prevSlideFn = null;

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

      // Reset slider
      slider.innerHTML = "";
      slides = [];

      // Create slides for each product
      products.forEach((product) => {
        const slide = document.createElement("div");
        slide.className = "popup-slide";

        const name = getName(product);
        const flavor = getFlavor(product);
        const price = effectivePrice(product);
        const stock = product.stock;
        const isProductSoon = isSoon(product);
        const isProductOut = isOut(product);
        const imgFilter = isProductOut
          ? "grayscale(.75) contrast(.95) brightness(.85)"
          : (isProductSoon ? "grayscale(.25) contrast(.98) brightness(.92)" : "none");

        slide.innerHTML = `
          <div class="popup-product-image">
            <img src="${product.image || ''}" alt="${name} ${flavor}" loading="lazy" style="object-fit: contain;max-height:350px;width:100%;filter:${imgFilter};">
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

      // Add clone of first slide for smooth looping
      if (slides.length > 1) {
        const firstClone = slides[0].cloneNode(true);
        slider.appendChild(firstClone);
      }

      const totalSlides = slides.length;
      // 🔧 ne legyen elcsúszás: a translateX(%) így 1 slide = 100%
      slider.style.width = "100%";

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
          // Ha az elsőnél vagyunk és visszamegyünk, ugorjunk az utolsó igazi slide-ra
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

      // swipe vezérlők frissítése
      nextSlideFn = nextSlide;
      prevSlideFn = prevSlide;

      // Create dots
      const dots = document.createElement("div");
      dots.className = "popup-dots";

      function updateDots() {
        dots.innerHTML = "";
        for (let i = 0; i < totalSlides; i++) {
          const dot = document.createElement("div");
          const displayIndex = currentProductSlide >= totalSlides ? 0 : currentProductSlide;
          dot.className = `popup-dot ${i === displayIndex ? 'active' : ''}`;
          dot.addEventListener("click", () => goToSlide(i));
          dots.appendChild(dot);
        }
      }

      // Auto slide interval
      if (slideInterval) clearInterval(slideInterval);
      if (totalSlides > 1) {
        slideInterval = setInterval(nextSlide, 4000);
      }

      // Header
      header.innerHTML = `
        <div class="popup-title">${popup.title_hu || t("newAvail")}</div>
        <div class="popup-subtitle">${category.label}</div>
      `;

      // Footer
      footer.innerHTML = "";

      const dontShow = document.createElement("label");
      dontShow.className = "chk";
      dontShow.innerHTML = `<input type="checkbox" id="dontShowAgain"> ${t("dontShow")}`;

      const buttons = document.createElement("div");
      buttons.className = "popup-buttons";

      // Skip all button only if multiple popups
      if (queue.length > 1) {
        const skipAllBtn = document.createElement("button");
        skipAllBtn.className = "ghost";
        skipAllBtn.textContent = t("skipAll");
        skipAllBtn.onclick = () => {
                const checkbox = document.getElementById("dontShowAgain");
                // Csak akkor "tiltsuk" le tartósan, ha be van pipálva
                if (checkbox && checkbox.checked) {
                    queue.forEach(q => {
                        try {
                            localStorage.setItem(popupHideKey(q.popup), "1");
                        } catch {}
                    });
                }
                if(slideInterval) clearInterval(slideInterval);
                bg.remove();
            };
        buttons.appendChild(skipAllBtn);
      }

      // Understood button
      const understoodBtn = document.createElement("button");
      understoodBtn.className = "primary";
      understoodBtn.textContent = t("understood");
      understoodBtn.onclick = () => {
        const checkbox = document.getElementById("dontShowAgain");
        if (checkbox && checkbox.checked) {
          try {
            localStorage.setItem(popupHideKey(popup), "1");
          } catch {}
        }
        currentSlide++;
        if (slideInterval) clearInterval(slideInterval);
        renderPopup();
      };
      buttons.appendChild(understoodBtn);

      footer.appendChild(dontShow);
      if (totalSlides > 1) footer.appendChild(dots);
      footer.appendChild(buttons);

      // Render content
      content.innerHTML = "";
      content.appendChild(slider);

      if (totalSlides > 1) {
        updateDots();
      }

      goToSlide(0, false);
    }

    renderPopup();

    // ✅ Swipe support for mobile (újjal lapozás)
    let touchStartX = 0;
    let touchEndX = 0;

    content.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    content.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });

    function handleSwipe() {
      const swipeThreshold = 50;
      const diff = touchStartX - touchEndX;

      if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
          // Swipe left - next
          if (typeof nextSlideFn === 'function') nextSlideFn();
        } else {
          // Swipe right - previous
          if (typeof prevSlideFn === 'function') prevSlideFn();
        }
      }
    }

    // Close on background click
    bg.addEventListener("click", (e) => {
      if (e.target === bg) {
        if (slideInterval) clearInterval(slideInterval);
        bg.remove();
      }
    });
  }

  /* ----------------- Init ----------------- */
  function setLangUI(){
    $("#langLabel").textContent = state.lang.toUpperCase();
    $("#search").placeholder = "Keresés...";
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

  function initSearch(){
    $("#search").addEventListener("input", (e) => {
      state.search = e.target.value || "";
      renderGrid();
    });
  }

  async function init(){
    try{
      state.lang = localStorage.getItem("sv_lang") || "hu";
    }catch{}

    setLangUI();
    initLang();
    initSearch();
    listenLive();

    hydrateFromLivePayload();

    await loadDocs();

    state.loaded = true;
    document.getElementById("loader").style.display = "none";
    document.getElementById("app").style.display = "grid";

    renderNav();
    renderGrid();
    showPopupsIfNeeded();

    setInterval(() => {
      hydrateFromLivePayload();
    }, 5000);
  }

  init();
})();
