diff --git a/assets/app.js b/assets/app.js
index 6bfe1fadf319d41c2b78b0f169144c3f40ae7be8..34a9c35f546a67902b145ecfebdde758a98d55a2 100644
--- a/assets/app.js
+++ b/assets/app.js
@@ -52,50 +52,51 @@
       ok: "Értettem",
       prev: "◀",
       next: "▶",
     },
     en: {
       all: "All products",
       soon: "Coming soon",
       stock: "Stock",
       pcs: "pcs",
       out: "Sold out",
 
       popupTitle: "New products available",
       popupSub: "Use arrows or swipe – it also auto-slides.",
       dontShow: "Don’t show again",
       skipAll: "Skip all",
       ok: "Got it",
       prev: "◀",
       next: "▶",
     },
   };
   const t = (k) => (TXT[state.lang] && TXT[state.lang][k]) || TXT.hu[k] || k;
 
   const locale = () => (state.lang === "hu" ? "hu" : "en");
 
   const norm = (s) => String(s ?? "").trim();
+  const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v)));
 
   const getName = (p) =>
     state.lang === "hu"
       ? norm(p.name_hu || p.name_en || "")
       : norm(p.name_en || p.name_hu || "");
 
   const getFlavor = (p) =>
     state.lang === "hu"
       ? norm(p.flavor_hu || p.flavor_en || "")
       : norm(p.flavor_en || p.flavor_hu || "");
 
   const isOut = (p) => p && p.status === "out";
   const isSoon = (p) => p && p.status === "soon";
   const isVisible = (p) => p && p.visible !== false;
 
   const effectivePrice = (p) => {
     const v = Number(p.price);
     if (Number.isFinite(v) && v > 0) return v;
     const c = (state.productsDoc.categories || []).find((x) => String(x.id) === String(p.categoryId));
     const b = Number(c && c.basePrice);
     return Number.isFinite(b) ? b : 0;
   };
 
   const catLabel = (c) =>
     state.lang === "hu"
@@ -197,132 +198,142 @@
     }
 
     return null;
   }
 
   async function fetchDataFile(path, etagKey, { forceBust = false } = {}) {
     const relUrl = path;
     const src = await resolveSource();
     if (src && src.rawBase) {
       const rawUrl = `${src.rawBase}/${path}`;
       // raw first (faster propagation), fallback to relative
       const raw = await fetchJsonWithEtag(rawUrl, etagKey, { forceBust });
       if (raw.ok) return raw;
       const rel = await fetchJsonWithEtag(relUrl, etagKey, { forceBust });
       return rel;
     }
     return await fetchJsonWithEtag(relUrl, etagKey, { forceBust });
   }
 
   /* ---------------- Normalize ---------------- */
 
   function normalizeDoc(data) {
     const doc = Array.isArray(data)
       ? { categories: [], products: data, popups: [], featuredEnabled: true }
       : { categories: Array.isArray(data && data.categories) ? data.categories : [], products: Array.isArray(data && data.products) ? data.products : [], popups: Array.isArray(data && data.popups) ? data.popups : [], featuredEnabled: (data && data.featuredEnabled) !== false };
+    const rawUi = (data && data.ui) || {};
+    doc.ui = {
+      outlineWidth: clamp(rawUi.outlineWidth ?? 2, 1, 6),
+      hotOutlineWidth: clamp(rawUi.hotOutlineWidth ?? rawUi.outlineWidth ?? 2, 1, 6),
+      soonOverlayOpacity: clamp(rawUi.soonOverlayOpacity ?? 0.08, 0, 0.3),
+      outGray: clamp(rawUi.outGray ?? 0.75, 0, 1),
+      outBrightness: clamp(rawUi.outBrightness ?? 0.55, 0.2, 1.4),
+      soonGray: clamp(rawUi.soonGray ?? 0.25, 0, 1),
+      soonBrightness: clamp(rawUi.soonBrightness ?? 0.95, 0.5, 1.4),
+    };
 
     doc.categories = doc.categories
       .filter((c) => c && c.id)
       .map((c) => ({
         ...c,
         id: String(c.id),
         label_hu: c.label_hu ?? c.label ?? c.id,
         label_en: c.label_en ?? c.label ?? c.id,
         basePrice: c.basePrice ?? 0,
         // kompat: régi név 'featuredEnabled'
         featuredEnabled: (c.featuredEnabled !== false),
         showHot: (c.showHot !== false) && (c.featuredEnabled !== false),
       }));
 
     doc.products = doc.products
       .filter((p) => p && p.id)
       .map((p) => ({
         ...p,
         id: String(p.id),
         categoryId: String(p.categoryId || ""),
         status: p.status || "ok",
         stock: Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0,
         visible: p.visible !== false,
       }));
 
     return doc;
   }
 
   function normalizeSales(sales) {
     return Array.isArray(sales) ? sales : [];
   }
 
   function normalizePopups(popups) {
     const arr = Array.isArray(popups) ? popups : [];
     const seen = new Set();
     return arr
       .filter((p) => p && (p.id || p.title_hu || p.title_en))
       .map((p) => ({
         id: String(p.id || ("pp_" + Math.random().toString(16).slice(2))),
         rev: Number.isFinite(Number(p.rev)) ? Number(p.rev) : 1,
-        active: !!p.active,
+        active: !!(p.active ?? p.enabled),
         title_hu: String(p.title_hu || p.title || TXT.hu.popupTitle),
         title_en: String(p.title_en || p.title || TXT.en.popupTitle),
-        categories: Array.isArray(p.categories) ? [...new Set(p.categories.map(String).filter(Boolean))] : [],
-        products: Array.isArray(p.products) ? [...new Set(p.products.map(String).filter(Boolean))] : [],
+        categories: Array.isArray(p.categories || p.categoryIds) ? [...new Set((p.categories || p.categoryIds).map(String).filter(Boolean))] : [],
+        products: Array.isArray(p.products || p.productIds) ? [...new Set((p.products || p.productIds).map(String).filter(Boolean))] : [],
       }))
       .filter((p) => {
         if (seen.has(p.id)) return false;
         seen.add(p.id);
         return true;
       });
   }
 
   /* ---------------- Hot per category ---------------- */
 
   function computeHotByCat(doc, sales) {
     if (doc && doc.featuredEnabled === false) return {};
     const counts = new Map();
     for (const s of sales || []) {
       const items = Array.isArray(s.items) ? s.items : [];
       for (const it of items) {
         const pid = String(it.productId || "");
         const qty = Number(it.qty || it.quantity || 0);
         if (!pid || !Number.isFinite(qty) || qty <= 0) continue;
         counts.set(pid, (counts.get(pid) || 0) + qty);
       }
     }
 
     const out = {};
     const loc = locale();
 
     const flavorKey = (p) => getFlavor(p) || "";
 
     for (const c of doc.categories || []) {
       if (!c || !c.id || c.id === "soon") continue;
       if (c.showHot === false) continue;
       if (c.featuredEnabled === false) continue;
 
       const inCat = (doc.products || [])
         .filter((p) => isVisible(p))
         .filter((p) => String(p.categoryId) === String(c.id))
-        .filter((p) => !isSoon(p)); // soon not hot
+        .filter((p) => !isSoon(p) && !isOut(p)); // soon/out not hot
 
       let best = null;
       let bestCount = 0;
 
       for (const p of inCat) {
         const cnt = counts.get(String(p.id)) || 0;
         if (cnt > bestCount) {
           bestCount = cnt;
           best = p;
           continue;
         }
         if (cnt === bestCount && cnt > 0) {
           if (!best) {
             best = p;
             continue;
           }
           const a = flavorKey(p);
           const b = flavorKey(best);
           const cmp = a.localeCompare(b, loc, { sensitivity: "base" });
           if (cmp < 0) best = p;
           else if (cmp === 0) {
             if (String(p.id).localeCompare(String(best.id)) < 0) best = p;
           }
         }
       }
@@ -440,90 +451,83 @@
     const nav = $("#nav");
     if (!nav) return;
     nav.innerHTML = "";
 
     for (const c of orderedCategories()) {
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
 
   function makeCard(p) {
     const name = getName(p);
     const flavor = getFlavor(p);
     const out = isOut(p);
     const soon = isSoon(p);
     const price = effectivePrice(p);
     const stockShown = out ? 0 : Math.max(0, Number(p.stock || 0));
+    const ui = state.productsDoc.ui || {};
 
     const card = document.createElement("div");
     card.className = "card fade-in";
     if (out) card.classList.add("out");
     if (soon) card.classList.add("soon");
     if (p.__hot) card.classList.add("hot");
 
     const hero = document.createElement("div");
     hero.className = "hero";
 
     const img = document.createElement("img");
     img.loading = "lazy";
     img.alt = (name + (flavor ? " - " + flavor : "")).trim();
     img.src = p.image || "";
 
-    if (out) img.style.filter = "grayscale(1) brightness(0.26) contrast(0.95)";
-    else if (soon) img.style.filter = "grayscale(0.75) brightness(0.82) contrast(1.02)";
+    if (out) img.style.filter = `grayscale(${ui.outGray ?? 0.75}) brightness(${ui.outBrightness ?? 0.55}) contrast(0.98)`;
+    else if (soon) img.style.filter = `grayscale(${ui.soonGray ?? 0.25}) brightness(${ui.soonBrightness ?? 0.95}) contrast(1)`;
 
     hero.appendChild(img);
 
     const badges = document.createElement("div");
     badges.className = "badges";
     if (soon) {
       const b = document.createElement("div");
       b.className = "badge soon";
       b.textContent = t("soon");
       badges.appendChild(b);
     } else if (out) {
       const b = document.createElement("div");
       b.className = "badge out";
       b.textContent = t("out");
       badges.appendChild(b);
-    } else if (p.__hot) {
-      const b = document.createElement("div");
-      b.className = "badge";
-      b.textContent = "HOT";
-      b.style.background = "rgba(255,145,60,.16)";
-      b.style.borderColor = "rgba(255,145,60,.45)";
-      b.style.color = "rgba(255,205,160,.98)";
-      badges.appendChild(b);
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
 
     ov.appendChild(n);
     ov.appendChild(f);
     hero.appendChild(ov);
 
     const body = document.createElement("div");
     body.className = "card-body";
 
     const meta = document.createElement("div");
     meta.className = "meta-row";
 
     const priceEl = document.createElement("div");
@@ -548,56 +552,65 @@
   }
 
   function renderGrid() {
     const grid = $("#grid");
     const empty = $("#empty");
     if (!grid) return;
     grid.innerHTML = "";
 
     const list = filterList();
     $("#count").textContent = String(list.length);
     if (empty) empty.style.display = list.length ? "none" : "block";
 
     // mark hot items (so card can show badge)
     const hotIds = new Set();
     if (state.active === "all") for (const k of Object.keys(state.hotByCat || {})) hotIds.add(String(state.hotByCat[k]));
     else if (state.active !== "soon") {
       const hid = state.hotByCat && state.hotByCat[String(state.active)];
       if (hid) hotIds.add(String(hid));
     }
     for (const p of list) p.__hot = hotIds.has(String(p.id));
 
     for (const p of list) grid.appendChild(makeCard(p));
   }
 
   function applyRender() {
+    applyUiSettings();
     renderNav();
     renderGrid();
     $("#loader").style.display = "none";
     $("#app").style.display = "grid";
   }
 
+  function applyUiSettings() {
+    const ui = state.productsDoc.ui || {};
+    const root = document.documentElement;
+    root.style.setProperty("--status-outline-width", `${ui.outlineWidth ?? 2}px`);
+    root.style.setProperty("--hot-outline-width", `${ui.hotOutlineWidth ?? 2}px`);
+    root.style.setProperty("--soon-overlay-opacity", `${ui.soonOverlayOpacity ?? 0.08}`);
+  }
+
   /* ---------------- Popup (user) ---------------- */
 
   function getDismissedMap() {
     try {
       const j = JSON.parse(localStorage.getItem(LS.dismissed) || "{}");
       return j && typeof j === "object" ? j : {};
     } catch {
       return {};
     }
   }
 
   function setDismissed(id, rev) {
     const map = getDismissedMap();
     map[String(id)] = Math.max(Number(map[String(id)] || 0), Number(rev || 1));
     try {
       localStorage.setItem(LS.dismissed, JSON.stringify(map));
     } catch {}
   }
 
   function buildPopupItems(popup) {
     const doc = state.productsDoc;
     const prods = (doc.products || []).filter((p) => p && isVisible(p));
     const byId = new Map(prods.map((p) => [String(p.id), p]));
     const items = [];
 
@@ -1028,90 +1041,93 @@
     let tick = 0;
 
     async function poll() {
       tick += 1;
       const force = tick % 5 === 0; // ~10s forced bust
 
       const [pR, sR] = await Promise.all([
         fetchDataFile("data/products.json", "products", { forceBust: force }),
         fetchDataFile("data/sales.json", "sales", { forceBust: force }),
       ]);
 
       let changed = false;
 
       if (pR.ok && !pR.notModified) {
         state.productsDoc = normalizeDoc(pR.json);
         state.popups = normalizePopups(state.productsDoc.popups || []);
         changed = true;
       }
       if (sR.ok && !sR.notModified) {
         state.sales = normalizeSales(sR.json);
         changed = true;
       }
 
       if (changed) {
         state.hotByCat = computeHotByCat(state.productsDoc, state.sales);
+        applyUiSettings();
 
         // render throttling via signature (prevents double flicker)
         const sig = JSON.stringify({
           lang: state.lang,
           act: state.active,
           docLen: (state.productsDoc.products || []).length,
           docHash: (state.productsDoc.products || []).map((x) => [x.id, x.stock, x.status, x.visible, x.price]).slice(0, 200),
           hot: state.hotByCat,
+          ui: state.productsDoc.ui || {},
         });
         if (sig !== state.lastRenderSig) {
           state.lastRenderSig = sig;
           renderNav();
           renderGrid();
         }
         popupMaybeOpen();
       }
 
       setTimeout(poll, document.hidden ? 4500 : 1800);
     }
 
     document.addEventListener("visibilitychange", () => {
       if (!document.hidden) {
         // burst for quick pickup
         (async () => {
           for (let i = 0; i < 3; i++) {
             await Promise.all([
               fetchDataFile("data/products.json", "products", { forceBust: true }),
               fetchDataFile("data/sales.json", "sales", { forceBust: true }),
             ]).then((arr) => {
               const [pR, sR] = arr;
               let ch = false;
               if (pR.ok && !pR.notModified) {
                 state.productsDoc = normalizeDoc(pR.json);
                 state.popups = normalizePopups(state.productsDoc.popups || []);
                 ch = true;
               }
               if (sR.ok && !sR.notModified) {
                 state.sales = normalizeSales(sR.json);
                 ch = true;
               }
               if (ch) {
                 state.hotByCat = computeHotByCat(state.productsDoc, state.sales);
+                applyUiSettings();
                 renderNav();
                 renderGrid();
                 popupMaybeOpen();
               }
             }).catch(() => {});
             await new Promise((r) => setTimeout(r, 280));
           }
         })();
       }
     });
 
     poll();
   }
 
   initialLoad().catch((err) => {
     console.error(err);
     const lt = $("#loaderText");
     if (lt) {
       lt.textContent =
         "Betöltési hiba. (Nyisd meg a konzolt.) Ha telefonon vagy custom domainen vagy: nyisd meg egyszer a Sync linket az admin Beállításokból.";
     }
   });
-})();
\ No newline at end of file
+})();
