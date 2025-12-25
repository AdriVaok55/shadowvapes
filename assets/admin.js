diff --git a/assets/admin.js b/assets/admin.js
index bfa4f788043cc56623abf47dd776de93a179777e..1aeb0e3bd012fa516aca1e30888b524df896e7e4 100644
--- a/assets/admin.js
+++ b/assets/admin.js
@@ -1,37 +1,37 @@
 (() => {
   const $ = (s) => document.querySelector(s);
 
   const LS = {
     owner: "sv_owner",
     repo: "sv_repo",
     branch: "sv_branch",
     token: "sv_token",
   };
 
   const state = {
-    doc: { categories: [], products: [], popups: [] },
+    doc: { categories: [], products: [], popups: [], ui: {} },
     sales: [],
     loaded: false,
     saving: false,
     saveQueued: false,
     dirty: false,
     dirtyProducts: false,
     dirtySales: false,
     saveTimer: null,
     shas: { products: null, sales: null },
     clientId: (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)),
     filters: {
       productsCat: "all",
       salesCat: "all",
       chartCat: "all",
       productsSearch: "",
       salesSearch: ""
     }
   };
 
   /* ---------- UI helpers ---------- */
   function setSaveStatus(type, text){
     const dot = $("#saveDot");
     dot.classList.remove("ok","busy","bad");
     dot.classList.add(type);
     $("#saveText").textContent = text;
@@ -49,50 +49,51 @@
     actions.forEach(a => {
       const b = document.createElement("button");
       b.textContent = a.label;
       b.className = a.kind === "primary" ? "primary" : (a.kind === "danger" ? "danger" : "ghost");
       b.onclick = a.onClick;
       act.appendChild(b);
     });
 
     $("#modalBg").style.display = "flex";
   }
   function closeModal(){
     $("#modalBg").style.display = "none";
   }
 
   function todayISO(){
     const d = new Date();
     const yyyy = d.getFullYear();
     const mm = String(d.getMonth()+1).padStart(2,"0");
     const dd = String(d.getDate()).padStart(2,"0");
     return `${yyyy}-${mm}-${dd}`;
   }
 
   function escapeHtml(s){
     return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
   }
+  const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v)));
 
   /* ---------- Cross-tab save lock (ugyanazon böngészőben) ---------- */
   const LOCK_KEY = "sv_save_lock";
   function readLock(){
     try{ return JSON.parse(localStorage.getItem(LOCK_KEY) || "null"); }catch{ return null; }
   }
   function lockValid(lock){
     return !!(lock && lock.id && (Date.now() - Number(lock.ts || 0)) < 15000);
   }
   function acquireLock(){
     const cur = readLock();
     if(lockValid(cur) && cur.id !== state.clientId) return false;
     localStorage.setItem(LOCK_KEY, JSON.stringify({ id: state.clientId, ts: Date.now() }));
     return true;
   }
   function releaseLock(){
     const cur = readLock();
     if(cur && cur.id === state.clientId) localStorage.removeItem(LOCK_KEY);
   }
   // ha crash/bezárás: engedjük el
   window.addEventListener("beforeunload", releaseLock);
 
 
   /* ---------- Settings ---------- */
   function getCfg(){
@@ -103,95 +104,107 @@
       token: ($("#cfgToken")?.value || "").trim()
     };
   }
   function loadCfg(){
     const owner = localStorage.getItem(LS.owner) || "";
     const repo = localStorage.getItem(LS.repo) || "";
     const branch = localStorage.getItem(LS.branch) || "main";
     const token = localStorage.getItem(LS.token) || "";
 
     return { owner, repo, branch, token };
   }
   function saveCfg(cfg){
     localStorage.setItem(LS.owner, cfg.owner);
     localStorage.setItem(LS.repo, cfg.repo);
     localStorage.setItem(LS.branch, cfg.branch);
     localStorage.setItem(LS.token, cfg.token);
   }
 
   /* ---------- Data logic ---------- */
   function normalizeDoc(){
     if(Array.isArray(state.doc)) state.doc = { categories: [], products: state.doc };
     if(!state.doc || typeof state.doc !== "object") state.doc = { categories: [], products: [] };
     if(!Array.isArray(state.doc.categories)) state.doc.categories = [];
     if(!Array.isArray(state.doc.products)) state.doc.products = [];
     if(!Array.isArray(state.sales)) state.sales = [];
+    if(!state.doc.ui || typeof state.doc.ui !== "object") state.doc.ui = {};
 
     state.doc.categories = state.doc.categories
       .filter(c => c && c.id)
       .map(c => ({
         id: String(c.id),
         label_hu: c.label_hu || c.id,
         label_en: c.label_en || c.label_hu || c.id,
         featuredEnabled: (c.featuredEnabled === false) ? false : true,
         basePrice: Number(c.basePrice || 0)
       }));
 
     state.doc.products = state.doc.products.map(p => ({
       id: String(p.id || ""),
       categoryId: String(p.categoryId || ""),
       status: (p.status === "ok" || p.status === "out" || p.status === "soon") ? p.status : "ok",
       stock: Math.max(0, Number(p.stock || 0)),
       // price lehet null/üres => kategória alapár
       price: (p.price === "" || p.price === null || p.price === undefined) ? null : Number(p.price || 0),
       image: p.image || "",
       visible: (p.visible === false) ? false : true,
       name_hu: p.name_hu || "",
       name_en: p.name_en || "",
       flavor_hu: p.flavor_hu || "",
       flavor_en: p.flavor_en || ""
     })).filter(p => p.id);
 
+    const rawUi = state.doc.ui || {};
+    state.doc.ui = {
+      outlineWidth: clamp(rawUi.outlineWidth ?? 2, 1, 6),
+      hotOutlineWidth: clamp(rawUi.hotOutlineWidth ?? rawUi.outlineWidth ?? 2, 1, 6),
+      soonOverlayOpacity: clamp(rawUi.soonOverlayOpacity ?? 0.08, 0, 0.3),
+      outGray: clamp(rawUi.outGray ?? 0.75, 0, 1),
+      outBrightness: clamp(rawUi.outBrightness ?? 0.55, 0.2, 1.4),
+      soonGray: clamp(rawUi.soonGray ?? 0.25, 0, 1),
+      soonBrightness: clamp(rawUi.soonBrightness ?? 0.95, 0.5, 1.4),
+    };
+
     // Popups normalize (külön fülön szerkeszthető)
     if(!Array.isArray(state.doc.popups)) state.doc.popups = [];
     state.doc.popups = state.doc.popups
       .filter(x => x && (x.id || x.title_hu || x.title_en || x.title))
       .map(x => {
         const id = String(x.id || ("pu_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16)));
         const updatedAt = Number(x.updatedAt || x.rev || Date.now());
         const createdAt = Number(x.createdAt || x.rev || updatedAt || Date.now());
         const rev = Number(x.rev || updatedAt || Date.now());
-        const catIds = Array.isArray(x.categoryIds) ? x.categoryIds.map(v => String(v)) : [];
-        const prodIds = Array.isArray(x.productIds) ? x.productIds.map(v => String(v)) : [];
+        const catIds = Array.isArray(x.categories || x.categoryIds) ? (x.categories || x.categoryIds).map(v => String(v)) : [];
+        const prodIds = Array.isArray(x.products || x.productIds) ? (x.products || x.productIds).map(v => String(v)) : [];
         return {
           id,
-          enabled: (x.enabled === false) ? false : true,
+          active: (x.active === false || x.enabled === false) ? false : true,
           rev,
           title_hu: String(x.title_hu || x.title || ""),
           title_en: String(x.title_en || x.title_hu || x.title || ""),
-          categoryIds: catIds.filter(Boolean),
-          productIds: prodIds.filter(Boolean),
+          categories: catIds.filter(Boolean),
+          products: prodIds.filter(Boolean),
           createdAt,
           updatedAt
         };
       })
       .filter(x => x.id);
 
     // Sales normalize (kompatibilis a régi formátummal is)
 state.sales = state.sales.map(s => {
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
@@ -471,107 +484,148 @@ function markDirty(flags){
       b.classList.add("active");
 
           const tab = b.dataset.tab;
 
     const panels = {
       products: $("#panelProducts"),
       categories: $("#panelCategories"),
       sales: $("#panelSales"),
       chart: $("#panelChart"),
       popups: $("#panelPopups"),
       settings: $("#panelSettings"),
     };
 
     for(const [k, el] of Object.entries(panels)){
       if(!el) continue;
       el.style.display = (tab === k) ? "block" : "none";
     }
 
     if(tab === "chart") drawChart();
     if(tab === "popups") renderPopups();
   });
 }
 
   function renderSettings(){
     const cfg = loadCfg();
+    const ui = state.doc.ui || {};
+    const uiCfg = {
+      outlineWidth: Number(ui.outlineWidth ?? 2),
+      hotOutlineWidth: Number(ui.hotOutlineWidth ?? ui.outlineWidth ?? 2),
+      soonOverlayOpacity: Number(ui.soonOverlayOpacity ?? 0.08),
+      outGray: Number(ui.outGray ?? 0.75),
+      outBrightness: Number(ui.outBrightness ?? 0.55),
+      soonGray: Number(ui.soonGray ?? 0.25),
+      soonBrightness: Number(ui.soonBrightness ?? 0.95),
+    };
     $("#panelSettings").innerHTML = `
       <div class="small-muted">GitHub mentés (token localStorage-ben). Branch: ha rossz, automatikusan próbál main/master.</div>
       <div class="form-grid" style="margin-top:12px;">
         <div class="field third"><label>Owner</label><input id="cfgOwner" value="${escapeHtml(cfg.owner)}" placeholder="pl. tesouser" /></div>
         <div class="field third"><label>Repo</label><input id="cfgRepo" value="${escapeHtml(cfg.repo)}" placeholder="pl. shadowvapes" /></div>
         <div class="field third"><label>Branch</label><input id="cfgBranch" value="${escapeHtml(cfg.branch)}" placeholder="main" /></div>
         <div class="field full"><label>Token</label><input id="cfgToken" value="${escapeHtml(cfg.token)}" type="password" placeholder="ghp_..." /></div>
       </div>
       <div class="actions">
         <button class="ghost" id="btnLoad">Betöltés</button>
         <button class="primary" id="btnSave">Mentés most</button>
       </div>
       <div class="small-muted" style="margin-top:10px;">
         Tipp: public oldalon RAW-ból töltünk, ezért a frissítés gyorsabb lesz (nem vársz 6 percet).
       </div>
 
       <div class="small-muted" style="margin-top:14px;">Telefon / másik eszköz gyorsítás: nyisd meg ezt a linket egyszer, és onnantól a katalógus RAW-ról tölt (gyors frissülés).</div>
       <div class="actions table" style="margin-top:10px;align-items:center;">
         <input id="syncUrl" readonly value="" style="min-width:280px;width:100%;" />
         <button class="ghost" id="btnCopySync">Link másolás</button>
       </div>
+
+      <div class="small-muted" style="margin-top:16px;">Megjelenés (public oldal): körvonal vastagság, szürkeség és overlay állítása.</div>
+      <div class="form-grid" style="margin-top:12px;">
+        <div class="field third"><label>Hamarosan/Elfogyott outline (px)</label><input id="ui_outline" type="number" min="1" max="6" step="0.5" value="${uiCfg.outlineWidth}"></div>
+        <div class="field third"><label>Felkapott outline (px)</label><input id="ui_hot_outline" type="number" min="1" max="6" step="0.5" value="${uiCfg.hotOutlineWidth}"></div>
+        <div class="field third"><label>Hamarosan overlay (0-0.3)</label><input id="ui_soon_overlay" type="number" min="0" max="0.3" step="0.01" value="${uiCfg.soonOverlayOpacity}"></div>
+        <div class="field third"><label>Elfogyott szürkeség (0-1)</label><input id="ui_out_gray" type="number" min="0" max="1" step="0.05" value="${uiCfg.outGray}"></div>
+        <div class="field third"><label>Elfogyott fényerő (0.2-1.4)</label><input id="ui_out_bright" type="number" min="0.2" max="1.4" step="0.05" value="${uiCfg.outBrightness}"></div>
+        <div class="field third"><label>Hamarosan szürkeség (0-1)</label><input id="ui_soon_gray" type="number" min="0" max="1" step="0.05" value="${uiCfg.soonGray}"></div>
+        <div class="field third"><label>Hamarosan fényerő (0.5-1.4)</label><input id="ui_soon_bright" type="number" min="0.5" max="1.4" step="0.05" value="${uiCfg.soonBrightness}"></div>
+      </div>
     `;
 
     $("#btnLoad").onclick = loadData;
     $("#btnSave").onclick = saveDataNow;
 
     // Sync link generálás (katalógus URL + query paramok)
     try{
       const basePath = location.pathname.replace(/\/admin\.html.*$/,"/"); // /repo/ vagy /
       const base = location.origin + basePath;
       const u = new URL(base);
       if(cfg.owner) u.searchParams.set("sv_owner", cfg.owner);
       if(cfg.repo) u.searchParams.set("sv_repo", cfg.repo);
       if(cfg.branch) u.searchParams.set("sv_branch", cfg.branch);
       const link = u.toString();
 
       const inp = $("#syncUrl");
       if(inp) inp.value = link;
 
       const btn = $("#btnCopySync");
       if(btn) btn.onclick = async () => {
         try{
           await navigator.clipboard.writeText(link);
           setSaveStatus("ok","Sync link másolva ✅");
         }catch{
           // fallback
           try{
             inp.select();
             document.execCommand("copy");
             setSaveStatus("ok","Sync link másolva ✅");
           }catch{}
         }
       };
     }catch{}
     ["cfgOwner","cfgRepo","cfgBranch","cfgToken"].forEach(id => {
       $("#"+id).addEventListener("input", () => saveCfg(getCfg()));
     });
+
+    const updateUi = () => {
+      state.doc.ui = {
+        outlineWidth: clamp($("#ui_outline").value, 1, 6),
+        hotOutlineWidth: clamp($("#ui_hot_outline").value, 1, 6),
+        soonOverlayOpacity: clamp($("#ui_soon_overlay").value, 0, 0.3),
+        outGray: clamp($("#ui_out_gray").value, 0, 1),
+        outBrightness: clamp($("#ui_out_bright").value, 0.2, 1.4),
+        soonGray: clamp($("#ui_soon_gray").value, 0, 1),
+        soonBrightness: clamp($("#ui_soon_bright").value, 0.5, 1.4),
+      };
+      markDirty({ products:true });
+    };
+
+    ["ui_outline","ui_hot_outline","ui_soon_overlay","ui_out_gray","ui_out_bright","ui_soon_gray","ui_soon_bright"].forEach(id => {
+      const el = $("#"+id);
+      if(!el) return;
+      el.addEventListener("change", updateUi);
+      el.addEventListener("input", updateUi);
+    });
   }
 
   function renderCategories(){
     const cats = [...state.doc.categories].sort((a,b)=> (a.label_hu||a.id).localeCompare(b.label_hu||b.id,"hu"));
 
     let rows = cats.map(c => `
       <tr>
         <td><b>${escapeHtml(c.id)}</b></td>
         <td><input data-cid="${escapeHtml(c.id)}" data-k="label_hu" value="${escapeHtml(c.label_hu)}"></td>
         <td><input data-cid="${escapeHtml(c.id)}" data-k="label_en" value="${escapeHtml(c.label_en)}"></td>
         <td style="width:160px;"><input data-cid="${escapeHtml(c.id)}" data-k="basePrice" type="number" min="0" value="${Number(c.basePrice||0)}"></td>
         <td style="width:140px;">
           <label class="small-muted" style="display:flex;align-items:center;gap:8px;">
             <input type="checkbox" data-cid="${escapeHtml(c.id)}" data-k="featuredEnabled" ${c.featuredEnabled!==false ? "checked":""}>
             Felkapott
           </label>
         </td>
         <td style="width:110px;"><button class="danger" data-delcat="${escapeHtml(c.id)}">Töröl</button></td>
       </tr>
     `).join("");
 
     $("#panelCategories").innerHTML = `
       <div class="actions">
         <button class="primary" id="btnAddCat">+ Kategória</button>
         <div class="small-muted">Ha terméknél az ár üres/null → kategória alap árát használja. A “Felkapott” kapcsoló: ha OFF, abban a kategóriában nem jelenik meg felkapott termék (ha nincs eladás, úgysem lesz).</div>
@@ -846,322 +900,259 @@ function markDirty(flags){
     const syncStockLock = () => {
       if(!stSel || !stInp) return;
       if(stSel.value === "out"){
         stInp.value = "0";
         stInp.disabled = true;
       }else{
         stInp.disabled = false;
       }
     };
     if(stSel){
       stSel.addEventListener("change", syncStockLock);
     }
     syncStockLock();
   }
 
 
   function popupById(id){
     return state.doc.popups.find(p => p.id === String(id)) || null;
   }
 
   function renderPopups(){
     const list = [...(state.doc.popups||[])].sort((a,b)=> Number(b.updatedAt||0) - Number(a.updatedAt||0));
 
     const rows = list.map(pu => {
       const title = pu.title_hu || pu.title_en || "(nincs cím)";
-      const cats = (pu.categoryIds||[]).length;
-      const prods = (pu.productIds||[]).length;
+      const cats = (pu.categories||[]).length;
+      const prods = (pu.products||[]).length;
       return `
         <div class="rowline table" style="align-items:center;">
           <div class="left">
             <div style="font-weight:900;">
               ${escapeHtml(title)}
               <span class="small-muted" style="margin-left:10px;">ID: <b>${escapeHtml(pu.id)}</b></span>
               <span class="small-muted" style="margin-left:10px;">rev: <b>${Number(pu.rev||0)}</b></span>
             </div>
             <div class="small-muted">Termékek: <b>${prods}</b> • Kategóriák: <b>${cats}</b></div>
           </div>
           <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
             <label class="small-muted" style="display:flex;align-items:center;gap:8px;">
-              <input type="checkbox" data-puid="${escapeHtml(pu.id)}" data-k="enabled" ${pu.enabled!==false ? "checked":""}>
+              <input type="checkbox" data-puid="${escapeHtml(pu.id)}" data-k="active" ${pu.active!==false ? "checked":""}>
               Aktív
             </label>
             <button class="ghost" data-editpopup="${escapeHtml(pu.id)}">Szerkeszt</button>
             <button class="danger" data-delpopup="${escapeHtml(pu.id)}">Töröl</button>
           </div>
         </div>
       `;
     }).join("");
 
     $("#panelPopups").innerHTML = `
       <div class="actions table" style="align-items:center;">
         <button class="primary" id="btnAddPopup">+ Új popup</button>
         <div class="small-muted">Több popup is lehet aktív: a public oldalon sorban dobja fel. “Ne mutasd többször” popup-ID + rev alapján működik (ha módosítod, újra megjelenik).</div>
       </div>
       <div style="margin-top:10px;">${rows || `<div class="small-muted">Nincs popup létrehozva.</div>`}</div>
     `;
 
     $("#btnAddPopup").onclick = () => openPopupModal(null);
 
     $("#panelPopups").querySelectorAll("input[data-puid]").forEach(inp => {
       const handler = () => {
         const id = inp.dataset.puid;
         const k = inp.dataset.k;
         const pu = popupById(id);
         if(!pu) return;
-        if(k === "enabled") pu.enabled = !!inp.checked;
+        if(k === "active") pu.active = !!inp.checked;
         pu.updatedAt = Date.now();
         pu.rev = pu.updatedAt;
         markDirty({ products:true });
         renderPopups();
       };
       inp.addEventListener("input", handler);
       inp.addEventListener("change", handler);
     });
 
     $("#panelPopups").querySelectorAll("button[data-editpopup]").forEach(btn => {
       btn.onclick = () => openPopupModal(btn.dataset.editpopup);
     });
     $("#panelPopups").querySelectorAll("button[data-delpopup]").forEach(btn => {
       btn.onclick = () => {
         const id = btn.dataset.delpopup;
         state.doc.popups = (state.doc.popups||[]).filter(p => p.id !== id);
         renderPopups();
         markDirty({ products:true });
       };
     });
   }
 
   function openPopupModal(id){
     const editing = id ? popupById(id) : null;
     const now = Date.now();
 
     const pu = editing ? JSON.parse(JSON.stringify(editing)) : {
       id: "pu_" + Math.random().toString(16).slice(2) + "_" + now.toString(16),
-      enabled: true,
+      active: true,
       rev: now,
       title_hu: "",
       title_en: "",
-      categoryIds: [],
-      productIds: [],
+      categories: [],
+      products: [],
       createdAt: now,
       updatedAt: now
     };
 
-    // UI state
-    let pSearch = "";
-    let pCat = "all";
-
     const body = document.createElement("div");
     body.innerHTML = `
       <div class="form-grid">
         <div class="field third"><label>ID</label><input id="pu_id" value="${escapeHtml(pu.id)}" ${editing?"disabled":""}></div>
         <div class="field third"><label>Cím (HU)</label><input id="pu_thu" value="${escapeHtml(pu.title_hu)}" placeholder="Új termékek"></div>
         <div class="field third"><label>Cím (EN)</label><input id="pu_ten" value="${escapeHtml(pu.title_en)}" placeholder="New products"></div>
         <div class="field full" style="display:flex;gap:10px;align-items:center;">
           <label class="small-muted" style="display:flex;align-items:center;gap:8px;">
-            <input id="pu_enabled" type="checkbox" ${pu.enabled!==false ? "checked":""}> Aktív popup
+            <input id="pu_enabled" type="checkbox" ${pu.active!==false ? "checked":""}> Aktív popup
           </label>
         </div>
       </div>
 
       <div class="small-muted" style="margin-top:10px;">Kategória kijelölés: ha bejelölöd, a popupban megjelenik az összes (látható) termék abból a kategóriából.</div>
       <div id="pu_catBox" style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;"></div>
 
-      <div style="margin-top:14px; display:grid; grid-template-columns: 1fr 340px; gap:14px; align-items:start;">
-        <div>
-          <div class="actions table" style="align-items:center; margin-bottom:10px;">
-            <input id="pu_psearch" placeholder="Keresés termékekben…" value="" style="flex:1;min-width:220px;">
-            <select id="pu_pcat" style="min-width:160px;">
-              <option value="all">Összes</option>
-              ${state.doc.categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label_hu||c.id)}</option>`).join("")}
-            </select>
-          </div>
-
-          <div id="pu_gridWrap" style="max-height:56vh; overflow:auto; padding-right:6px;">
-            <div id="pu_grid" class="pick-grid"></div>
-          </div>
-        </div>
-
-        <div>
-          <div class="small-muted" style="margin-bottom:10px;">Kiválasztott termékek (max ~4 látszik, görgethető):</div>
-          <div id="pu_selected" class="pick-selected" style="max-height:420px; overflow:auto; padding-right:6px;"></div>
+      <div style="margin-top:14px;">
+        <div class="actions table" style="align-items:center; margin-bottom:10px;">
+          <button class="ghost" id="pu_addProd">+ Termék</button>
+          <div class="small-muted">A popupba kézzel is kijelölhetsz termékeket (eladásos stílusú választó).</div>
         </div>
+        <div id="pu_products"></div>
       </div>
     `;
 
     openModal(editing ? "Popup szerkesztése" : "Új popup", "A public oldalon sorban dobja fel őket.", body, [
       { label:"Mégse", kind:"ghost", onClick: closeModal },
       { label:"Mentés", kind:"primary", onClick: () => {
         const nid = ($("#pu_id").value||"").trim();
         if(!nid) return;
         if(!editing && state.doc.popups.some(x => x.id === nid)) return;
 
         pu.id = nid;
         pu.title_hu = ($("#pu_thu").value||"").trim();
         pu.title_en = ($("#pu_ten").value||"").trim();
-        pu.enabled = !!$("#pu_enabled").checked;
+        pu.active = !!$("#pu_enabled").checked;
+        pu.products = (pu.products || []).filter(Boolean);
 
         pu.updatedAt = Date.now();
         pu.rev = pu.updatedAt;
 
-        // categoryIds/productIds már UI state-ből frissítve van
+        // categories/products már UI state-ből frissítve van
         if(editing){
           const idx = state.doc.popups.findIndex(x => x.id === editing.id);
           if(idx >= 0) state.doc.popups[idx] = pu;
         }else{
           state.doc.popups.push(pu);
         }
 
         closeModal();
         renderAll();
         markDirty({ products:true });
       }}
     ]);
 
     const catBox = $("#pu_catBox");
     catBox.innerHTML = state.doc.categories.map(c => {
-      const on = (pu.categoryIds||[]).includes(c.id);
+      const on = (pu.categories||[]).includes(c.id);
       return `
         <label class="badge" style="cursor:pointer;">
           <input type="checkbox" data-pucat="${escapeHtml(c.id)}" ${on?"checked":""} style="margin-right:8px;">
           ${escapeHtml(c.label_hu||c.id)}
         </label>
       `;
     }).join("");
 
     catBox.querySelectorAll("input[data-pucat]").forEach(ch => {
       const handler = () => {
         const cid = ch.dataset.pucat;
         const on = !!ch.checked;
-        pu.categoryIds = Array.from(new Set((pu.categoryIds||[]).filter(Boolean)));
-        if(on && !pu.categoryIds.includes(cid)) pu.categoryIds.push(cid);
-        if(!on) pu.categoryIds = pu.categoryIds.filter(x => x !== cid);
-        renderPopupPicker();
+        pu.categories = Array.from(new Set((pu.categories||[]).filter(Boolean)));
+        if(on && !pu.categories.includes(cid)) pu.categories.push(cid);
+        if(!on) pu.categories = pu.categories.filter(x => x !== cid);
       };
       ch.addEventListener("change", handler);
       ch.addEventListener("input", handler);
     });
 
-    $("#pu_psearch").oninput = () => { pSearch = ($("#pu_psearch").value||"").toLowerCase(); renderPopupPicker(); };
-    $("#pu_pcat").onchange = () => { pCat = $("#pu_pcat").value; renderPopupPicker(); };
-
-    function renderPopupPicker(){
-      const selected = new Set(pu.productIds||[]);
-
-      // Selected preview
-      const selWrap = $("#pu_selected");
-      const selList = (pu.productIds||[])
-        .map(id => prodById(id))
-        .filter(Boolean);
-
-      selWrap.innerHTML = selList.map(p => {
-        const eff = effectivePrice(p);
-        const status = p.status || "ok";
-        const cls = "card " + (status==="out" ? "dim out" : (status==="soon" ? "soon" : ""));
-        return `
-          <div class="${cls}" style="margin-bottom:10px; max-width:320px;">
-            <div class="hero"><img src="${escapeHtml(p.image||"")}" alt=""></div>
-            <div class="card-body">
-              <div style="font-weight:900;">${escapeHtml(p.name_hu||p.name_en||"")}</div>
-              <div class="small-muted">${escapeHtml(p.flavor_hu||p.flavor_en||"")}</div>
-              <div class="meta-row">
-                <div class="price">${eff.toLocaleString("hu-HU")} Ft</div>
-                <div class="stock">Készlet: <b>${status==="soon" ? "—" : p.stock}</b></div>
-              </div>
-              <button class="danger" data-unpick="${escapeHtml(p.id)}" style="width:100%; margin-top:10px;">Kivesz</button>
-            </div>
-          </div>
-        `;
-      }).join("") || `<div class="small-muted">Még nincs kiválasztva.</div>`;
-
-      selWrap.querySelectorAll("button[data-unpick]").forEach(b => {
-        b.onclick = () => {
-          const id = b.dataset.unpick;
-          pu.productIds = (pu.productIds||[]).filter(x => x !== id);
-          renderPopupPicker();
-        };
-      });
+    const productsRoot = $("#pu_products");
 
-      // Build full list: category-filtered + search
-      let all = [...state.doc.products];
-      if(pCat !== "all"){
-        all = all.filter(p => p.categoryId === pCat);
-      }
-      if(pSearch){
-        all = all.filter(p => (`${p.name_hu} ${p.name_en} ${p.flavor_hu} ${p.flavor_en}`).toLowerCase().includes(pSearch));
-      }
-      // sort: ok/soon/out, then name/flavor
-      const r = (s) => s==="ok"?0:(s==="soon"?1:2);
-      all.sort((a,b)=>{
-        const ra=r(a.status), rb=r(b.status);
-        if(ra!==rb) return ra-rb;
-        return (`${a.name_hu||a.name_en||""} ${a.flavor_hu||a.flavor_en||""}`).localeCompare(`${b.name_hu||b.name_en||""} ${b.flavor_hu||b.flavor_en||""}`,"hu");
-      });
+    const productOptions = () => state.doc.products.map(p => {
+      const n = p.name_hu || p.name_en || "—";
+      const f = p.flavor_hu || p.flavor_en || "";
+      const stock = p.status === "soon" ? "—" : p.stock;
+      const status = p.status === "out" ? "elfogyott" : (p.status === "soon" ? "hamarosan" : "ok");
+      return `<option value="${escapeHtml(p.id)}">${escapeHtml(n + (f? " • "+f:"") + ` (${status}, stock:${stock})`)}</option>`;
+    }).join("");
 
-      $("#pu_grid").innerHTML = all.map(p => {
-        const eff = effectivePrice(p);
-        const status = p.status || "ok";
-        const isSel = selected.has(p.id);
-        const cls = "card pick-card " + (isSel ? "selected " : "") + (status==="out" ? "dim out" : (status==="soon" ? "soon" : ""));
-        return `
-          <div class="${cls}" data-pick="${escapeHtml(p.id)}" style="min-width:220px;">
-            <div class="hero">
-              <img src="${escapeHtml(p.image||"")}" alt="">
-              <div class="badges">
-                ${p.visible===false ? `<span class="badge out">rejtve</span>` : ``}
-                ${status==="soon" ? `<span class="badge soon">hamarosan</span>` : ``}
-                ${status==="out" ? `<span class="badge out">elfogyott</span>` : ``}
-              </div>
-              <div class="overlay-title">
-                <div class="name">${escapeHtml(p.name_hu||p.name_en||"")}</div>
-                <div class="flavor">${escapeHtml(p.flavor_hu||p.flavor_en||"")}</div>
-              </div>
-            </div>
-            <div class="card-body">
-              <div class="meta-row">
-                <div class="price">${eff.toLocaleString("hu-HU")} Ft</div>
-                <div class="stock">Készlet: <b>${status==="soon" ? "—" : p.stock}</b></div>
-              </div>
-              <div class="small-muted">${isSel ? "Kiválasztva ✅" : "Kattints a kijelöléshez"}</div>
-            </div>
+    const renderPopupProducts = () => {
+      const list = (pu.products || []);
+      if(!list.length){
+        productsRoot.innerHTML = `<div class="small-muted">Még nincs kiválasztva termék.</div>`;
+        return;
+      }
+      productsRoot.innerHTML = list.map((pid, idx) => `
+        <div class="rowline table">
+          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;width:100%;">
+            <select class="pu_prod" data-idx="${idx}" style="min-width:280px;">
+              <option value="">Válassz terméket…</option>
+              ${productOptions()}
+            </select>
+            <button class="danger pu_del" data-idx="${idx}" type="button">Töröl</button>
           </div>
-        `;
-      }).join("");
-
-      $("#pu_grid").querySelectorAll("[data-pick]").forEach(el => {
-        el.onclick = () => {
-          const id = el.dataset.pick;
-          const set = new Set(pu.productIds||[]);
-          if(set.has(id)) set.delete(id); else set.add(id);
-          pu.productIds = Array.from(set);
-          renderPopupPicker();
+        </div>
+      `).join("");
+
+      productsRoot.querySelectorAll(".pu_prod").forEach(sel => {
+        const idx = Number(sel.dataset.idx);
+        sel.value = list[idx] || "";
+        sel.onchange = () => {
+          pu.products[idx] = sel.value;
+          pu.products = Array.from(new Set(pu.products.filter(Boolean)));
+          renderPopupProducts();
         };
       });
-    }
+      productsRoot.querySelectorAll(".pu_del").forEach(btn => {
+        btn.onclick = () => {
+          const idx = Number(btn.dataset.idx);
+          pu.products.splice(idx, 1);
+          renderPopupProducts();
+        };
+      });
+    };
+
+    $("#pu_addProd").onclick = () => {
+      pu.products = Array.from(new Set([...(pu.products || []), ""]));
+      renderPopupProducts();
+    };
 
-    renderPopupPicker();
+    renderPopupProducts();
   }
   function renderSales(){
     const cats = [{id:"all", label:"Mind"}, ...state.doc.categories.map(c=>({id:c.id,label:c.label_hu||c.id}))];
 
     const filterCat = state.filters.salesCat;
     const q = (state.filters.salesSearch || "").toLowerCase();
 
     let list = [...state.sales].sort((a,b)=> String(b.date).localeCompare(String(a.date)));
     if(q){
       list = list.filter(s => (`${s.name} ${s.payment}`).toLowerCase().includes(q));
     }
     if(filterCat !== "all"){
       list = list.filter(s => saleTotals(s, filterCat).hit);
     }
 
     const rows = list.map(s => {
       const tot = saleTotals(s, filterCat);
       const itemsCount = s.items.reduce((acc,it)=> acc + Number(it.qty||0), 0);
 
       return `
         <div class="rowline">
           <div class="left">
             <div style="font-weight:900;">
               ${escapeHtml(s.date)} • ${escapeHtml(s.name || "—")}
               <span class="small-muted">• ${escapeHtml(s.payment || "")}</span>
