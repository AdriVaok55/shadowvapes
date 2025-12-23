(() => {
  const $ = (s) => document.querySelector(s);

  const LS = {
    owner: "sv_gh_owner",
    repo: "sv_gh_repo",
    branch: "sv_gh_branch",
    token: "sv_gh_token"
  };

  const state = {
    doc: { categories: [], products: [] }, // products.json
    sales: [],                             // sales.json
    loaded: false
  };

  // ---------- UI helpers ----------
  function setSave(stateName) {
    const dot = $("#saveDot");
    const txt = $("#saveText");
    dot.classList.remove("ok", "busy");
    if (stateName === "ok") {
      dot.classList.add("ok");
      txt.textContent = "Kész";
    } else if (stateName === "busy") {
      dot.classList.add("busy");
      txt.textContent = "Dolgozok...";
    } else {
      txt.textContent = "—";
    }
  }

  function openModal(title, bodyHtml, buttons) {
    const back = $("#modalBackdrop");
    const box = $("#modalBox");
    box.innerHTML = `
      <h2>${escapeHtml(title)}</h2>
      <div class="small-muted" style="margin-bottom:12px;"></div>
      ${bodyHtml}
      <div class="row" style="margin-top:14px;" id="modalBtns"></div>
    `;
    const btnRow = box.querySelector("#modalBtns");
    btnRow.innerHTML = "";
    for (const b of buttons) {
      const btn = document.createElement("button");
      btn.textContent = b.label;
      btn.style.background = b.primary ? "linear-gradient(90deg,var(--brand),var(--brand2))" : "rgba(124,92,255,.18)";
      btn.style.color = b.primary ? "#061018" : "var(--text)";
      btn.style.fontWeight = b.primary ? "900" : "700";
      btn.addEventListener("click", b.onClick);
      btnRow.appendChild(btn);
    }
    back.style.display = "flex";
  }

  function closeModal() {
    $("#modalBackdrop").style.display = "none";
    $("#modalBox").innerHTML = "";
  }

  $("#modalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") closeModal();
  });

  function uniqueId(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function ensure() {
    if (!Array.isArray(state.doc.categories)) state.doc.categories = [];
    if (!Array.isArray(state.doc.products)) state.doc.products = [];
    if (!Array.isArray(state.sales)) state.sales = [];
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString("hu-HU");
  }

  // ---------- GitHub cfg ----------
  function loadCfg() {
    $("#tab-settings").innerHTML = `
      <div class="small-muted">Ha nincs token/owner/repo, akkor is megy a szerkesztés — mentés letöltéssel.</div>
      <div class="form-grid" style="margin-top:10px">
        <div class="field third">
          <label>Owner</label>
          <input id="ghOwner" placeholder="pl. TesóUser" />
        </div>
        <div class="field third">
          <label>Repo</label>
          <input id="ghRepo" placeholder="pl. shadowvapes" />
        </div>
        <div class="field third">
          <label>Branch</label>
          <input id="ghBranch" placeholder="main" />
        </div>
        <div class="field full">
          <label>Token (fine-grained vagy classic)</label>
          <input id="ghToken" type="password" placeholder="github token..." />
        </div>
      </div>

      <div class="actions">
        <button class="ghost" id="btnLoad">Betöltés</button>
        <button class="primary" id="btnSave">Mentés</button>
      </div>

      <div class="small-muted" style="margin-top:10px">
        Tipp: Fine-grained tokennél kell <b>Contents: Read and write</b> a repóra.
      </div>
    `;

    $("#ghOwner").value = localStorage.getItem(LS.owner) || "";
    $("#ghRepo").value = localStorage.getItem(LS.repo) || "";
    $("#ghBranch").value = localStorage.getItem(LS.branch) || "main";
    $("#ghToken").value = localStorage.getItem(LS.token) || "";

    const persist = () => {
      localStorage.setItem(LS.owner, $("#ghOwner").value.trim());
      localStorage.setItem(LS.repo, $("#ghRepo").value.trim());
      localStorage.setItem(LS.branch, ($("#ghBranch").value.trim() || "main"));
      localStorage.setItem(LS.token, $("#ghToken").value.trim());
    };

    ["ghOwner", "ghRepo", "ghBranch", "ghToken"].forEach(id => {
      $("#" + id).addEventListener("input", persist);
    });

    $("#btnLoad").addEventListener("click", async () => {
      persist();
      await loadAll();
      renderAll();
    });

    $("#btnSave").addEventListener("click", async () => {
      persist();
      await saveAll(true); // true => reload after save
    });
  }

  function cfg() {
    return {
      owner: (localStorage.getItem(LS.owner) || "").trim(),
      repo: (localStorage.getItem(LS.repo) || "").trim(),
      branch: (localStorage.getItem(LS.branch) || "main").trim(),
      token: (localStorage.getItem(LS.token) || "").trim()
    };
  }

  // ---------- Load / Save ----------
  async function loadAll() {
    setSave("busy");
    try {
      const c = cfg();
      if (c.owner && c.repo && c.token) {
        const p = await ShadowGH.getFile({ ...c, path: "data/products.json" });
        const s = await ShadowGH.getFile({ ...c, path: "data/sales.json" });

        const pData = JSON.parse(p.content);
        state.doc = Array.isArray(pData) ? { categories: [], products: pData } : { categories: pData.categories || [], products: pData.products || [] };

        const sData = JSON.parse(s.content);
        state.sales = Array.isArray(sData) ? sData : [];
      } else {
        // local fetch
        const pr = await fetch("data/products.json", { cache: "no-store" });
        const sr = await fetch("data/sales.json", { cache: "no-store" });
        const pData = await pr.json();
        const sData = await sr.json();

        state.doc = Array.isArray(pData) ? { categories: [], products: pData } : { categories: pData.categories || [], products: pData.products || [] };
        state.sales = Array.isArray(sData) ? sData : [];
      }

      ensure();

      // sanitize product fields
      state.doc.categories = state.doc.categories
        .filter(c => c && c.id)
        .map(c => ({ id: String(c.id), label_hu: c.label_hu || c.id, label_en: c.label_en || c.label_hu || c.id }));

      state.doc.products = state.doc.products.map(p => ({
        ...p,
        id: String(p.id || uniqueId("p")),
        categoryId: String(p.categoryId || ""),
        status: (p.status === "soon" || p.status === "out" || p.status === "ok") ? p.status : "ok",
        stock: Math.max(0, Number(p.stock || 0)),
        price: Math.max(0, Number(p.price || 0))
      }));

      // sales sanitize
      state.sales = state.sales.map(s => ({
        id: String(s.id || uniqueId("s")),
        date: String(s.date || todayISO()).slice(0, 10),
        items: Array.isArray(s.items) ? s.items.map(it => ({
          productId: String(it.productId || ""),
          qty: Math.max(1, Number(it.qty || 1)),
          unitPrice: Math.max(0, Number(it.unitPrice || 0))
        })) : []
      }));

      state.loaded = true;
      setSave("ok");
    } catch (e) {
      console.error(e);
      setSave("ok");
      alert("Betöltés hiba: " + e.message);
      // still allow UI (empty)
      state.loaded = true;
      ensure();
    }
  }

  function download(name, content) {
    const blob = new Blob([content], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  async function saveAll(reloadAfter) {
    if (!state.loaded) return;

    setSave("busy");
    try {
      ensure();

      const c = cfg();
      const productsText = JSON.stringify({ categories: state.doc.categories, products: state.doc.products }, null, 2);
      const salesText = JSON.stringify(state.sales, null, 2);

      if (c.owner && c.repo && c.token) {
        // need sha
        const pOld = await ShadowGH.getFile({ ...c, path: "data/products.json" });
        const sOld = await ShadowGH.getFile({ ...c, path: "data/sales.json" });

        await ShadowGH.putFile({ ...c, path: "data/products.json", sha: pOld.sha, message: "Update products.json", content: productsText });
        await ShadowGH.putFile({ ...c, path: "data/sales.json", sha: sOld.sha, message: "Update sales.json", content: salesText });
      } else {
        // fallback download
        download("products.json", productsText);
        download("sales.json", salesText);
      }

      setSave("ok");

      // IMPORTANT REQUEST: after every save -> reload
      if (reloadAfter) {
        await loadAll();
        renderAll();
      }
    } catch (e) {
      console.error(e);
      setSave("ok");
      alert("Mentés hiba: " + e.message);
    }
  }

  // ---------- Tabs ----------
  function bindTabs() {
    document.querySelectorAll(".tabs button").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const tab = btn.dataset.tab;
        $("#tab-products").style.display = tab === "products" ? "" : "none";
        $("#tab-categories").style.display = tab === "categories" ? "" : "none";
        $("#tab-sales").style.display = tab === "sales" ? "" : "none";
        $("#tab-settings").style.display = tab === "settings" ? "" : "none";
      });
    });
  }

  // ---------- Render Products ----------
  function renderProducts() {
    const root = $("#tab-products");

    const totalCount = state.doc.products.length;

    root.innerHTML = `
      <div class="rowline">
        <div class="left">
          <b>Termékek</b>
          <span class="small-muted">Azonos nevűek egymás mellett (mindig) • Status: ok/out/soon</span>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <input id="pSearch" placeholder="Keresés..." style="border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(11,15,23,.45);color:var(--text);padding:10px 12px;outline:none;min-width:260px;">
          <button class="primary" id="btnAddP">+ Termék</button>
        </div>
      </div>
      <div class="small-muted" style="margin-top:10px;">Összes: <b>${totalCount}</b></div>

      <table class="table" id="pTable">
        <thead>
          <tr>
            <th>Név</th>
            <th>Íz</th>
            <th>Kategória</th>
            <th>Ár</th>
            <th>Készlet</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;

    $("#btnAddP").addEventListener("click", () => openProductModal(null));

    const tbody = root.querySelector("tbody");
    const catsMap = new Map(state.doc.categories.map(c => [c.id, c]));

    const getLabel = (c) => (c ? (c.label_hu || c.id) : "—");

    const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const getName = (p) => (p.name_hu || p.name_en || "");
    const getFlavor = (p) => (p.flavor_hu || p.flavor_en || "");

    function sortedFiltered(q) {
      let list = [...state.doc.products];
      if (q) {
        const nq = norm(q);
        list = list.filter(p => (norm(getName(p)) + " " + norm(getFlavor(p))).includes(nq));
      }

      // group by name
      const map = new Map();
      for (const p of list) {
        const key = norm(getName(p));
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(p);
      }
      const keys = [...map.keys()].sort((a,b)=>a.localeCompare(b,"hu"));
      const out = [];
      for (const k of keys) {
        const arr = map.get(k);
        arr.sort((a,b)=> norm(getFlavor(a)).localeCompare(norm(getFlavor(b)),"hu"));
        out.push(...arr);
      }
      return out;
    }

    function paint(q) {
      tbody.innerHTML = "";
      for (const p of sortedFiltered(q)) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml((p.name_hu||"") + (p.name_en ? ` / ${p.name_en}`:""))}</td>
          <td>${escapeHtml((p.flavor_hu||"") + (p.flavor_en ? ` / ${p.flavor_en}`:""))}</td>
          <td>${escapeHtml(getLabel(catsMap.get(String(p.categoryId||""))))}</td>
          <td>${fmt(p.price)} Ft</td>
          <td>${Math.max(0, Number(p.stock||0))} db</td>
          <td>${escapeHtml(p.status)}</td>
          <td style="text-align:right; white-space:nowrap;">
            <button class="ghost" data-edit="${escapeHtml(p.id)}">Szerk</button>
            <button class="danger" data-del="${escapeHtml(p.id)}">Töröl</button>
          </td>
        `;
        tbody.appendChild(tr);
      }

      tbody.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openProductModal(b.dataset.edit)));
      tbody.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => deleteProduct(b.dataset.del)));
    }

    $("#pSearch").addEventListener("input", (e) => paint(e.target.value || ""));
    paint("");
  }

  function openProductModal(productId) {
    const p = productId ? state.doc.products.find(x => x.id === productId) : null;
    const isNew = !p;

    const cats = state.doc.categories;
    const options = cats.map(c => `<option value="${escapeHtml(c.id)}"${(p && String(p.categoryId)===String(c.id))?" selected":""}>${escapeHtml(c.label_hu||c.id)}</option>`).join("");

    const model = p || {
      id: uniqueId("p"),
      categoryId: cats[0]?.id || "",
      status: "ok",
      stock: 0,
      price: 0,
      image: "",
      name_hu: "",
      name_en: "",
      flavor_hu: "",
      flavor_en: ""
    };

    openModal(isNew ? "Új termék" : "Termék szerkesztés", `
      <div class="form-grid">
        <div class="field third">
          <label>ID</label>
          <input id="pid" value="${escapeHtml(model.id)}" ${isNew ? "" : "disabled"} />
        </div>
        <div class="field third">
          <label>Kategória</label>
          <select id="pcat">${options}</select>
        </div>
        <div class="field third">
          <label>Status</label>
          <select id="pstatus">
            <option value="ok"${model.status==="ok"?" selected":""}>ok</option>
            <option value="out"${model.status==="out"?" selected":""}>out</option>
            <option value="soon"${model.status==="soon"?" selected":""}>soon</option>
          </select>
        </div>

        <div class="field third">
          <label>Készlet</label>
          <input id="pstock" type="number" min="0" value="${escapeHtml(String(model.stock||0))}" />
        </div>
        <div class="field third">
          <label>Ár (Ft)</label>
          <input id="pprice" type="number" min="0" value="${escapeHtml(String(model.price||0))}" />
        </div>
        <div class="field full">
          <label>Kép URL (1000×1000 ajánlott)</label>
          <input id="pimg" value="${escapeHtml(model.image||"")}" placeholder="https://..." />
        </div>

        <div class="field third">
          <label>Név HU</label>
          <input id="nHu" value="${escapeHtml(model.name_hu||"")}" />
        </div>
        <div class="field third">
          <label>Név EN</label>
          <input id="nEn" value="${escapeHtml(model.name_en||"")}" />
        </div>
        <div class="field third">
          <label>Íz HU</label>
          <input id="fHu" value="${escapeHtml(model.flavor_hu||"")}" />
        </div>
        <div class="field third">
          <label>Íz EN</label>
          <input id="fEn" value="${escapeHtml(model.flavor_en||"")}" />
        </div>
      </div>
      <div class="small-muted" style="margin-top:10px">
        soon termék csak “Hamarosan” menüben látszik a katalógusban.
      </div>
    `, [
      { label: "Mégse", onClick: closeModal },
      { label: isNew ? "Létrehozás" : "Mentés", primary: true, onClick: async () => {
        const next = {
          id: isNew ? $("#modalBox #pid").value.trim() : model.id,
          categoryId: $("#modalBox #pcat").value,
          status: $("#modalBox #pstatus").value,
          stock: Math.max(0, Number($("#modalBox #pstock").value || 0)),
          price: Math.max(0, Number($("#modalBox #pprice").value || 0)),
          image: $("#modalBox #pimg").value.trim(),
          name_hu: $("#modalBox #nHu").value.trim(),
          name_en: $("#modalBox #nEn").value.trim(),
          flavor_hu: $("#modalBox #fHu").value.trim(),
          flavor_en: $("#modalBox #fEn").value.trim()
        };

        if (!next.name_hu && !next.name_en) return alert("Adj nevet (HU vagy EN)");

        if (isNew) {
          if (state.doc.products.some(x => x.id === next.id)) return alert("Ez az ID már létezik.");
          state.doc.products.push(next);
        } else {
          Object.assign(model, next);
        }

        // bugfix: ha te állítod out-ra, biztosan beírja (nem “nem állítja”)
        // (semmi extra, csak rendesen state-be írunk)

        closeModal();
        renderProducts();

        // save + reload after save (kérésed)
        await saveAll(true);
      }}
    ]);
  }

  function deleteProduct(id) {
    // if used in sales, block
    const used = state.sales.some(s => (s.items || []).some(it => it.productId === id));
    if (used) return alert("Eladásban szerepel — előbb töröld az eladást.");

    state.doc.products = state.doc.products.filter(p => p.id !== id);
    renderProducts();
    saveAll(true);
  }

  // ---------- Render Categories ----------
  function renderCategories() {
    const root = $("#tab-categories");
    root.innerHTML = `
      <div class="rowline">
        <div class="left">
          <b>Kategóriák</b>
          <span class="small-muted">“Összes termék” és “Hamarosan” a katalógusban virtuális, nem kell ide.</span>
        </div>
        <button class="primary" id="btnAddC">+ Kategória</button>
      </div>

      <table class="table" id="cTable">
        <thead>
          <tr>
            <th>ID</th>
            <th>Név HU</th>
            <th>Név EN</th>
            <th></th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;

    $("#btnAddC").addEventListener("click", () => openCategoryModal(null));

    const tbody = root.querySelector("tbody");
    tbody.innerHTML = "";

    for (const c of [...state.doc.categories].sort((a,b)=> (a.label_hu||a.id).localeCompare((b.label_hu||b.id), "hu"))) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(c.id)}</td>
        <td>${escapeHtml(c.label_hu||"")}</td>
        <td>${escapeHtml(c.label_en||"")}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="ghost" data-edit="${escapeHtml(c.id)}">Szerk</button>
          <button class="danger" data-del="${escapeHtml(c.id)}">Töröl</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openCategoryModal(b.dataset.edit)));
    tbody.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => deleteCategory(b.dataset.del)));
  }

  function openCategoryModal(catId) {
    const c = catId ? state.doc.categories.find(x => x.id === catId) : null;
    const isNew = !c;
    const model = c || { id: "", label_hu: "", label_en: "" };

    openModal(isNew ? "Új kategória" : "Kategória szerkesztés", `
      <div class="form-grid">
        <div class="field third">
          <label>ID</label>
          <input id="cid" value="${escapeHtml(model.id||"")}" ${isNew ? "" : "disabled"} />
        </div>
        <div class="field third">
          <label>Név HU</label>
          <input id="chu" value="${escapeHtml(model.label_hu||"")}" />
        </div>
        <div class="field third">
          <label>Név EN</label>
          <input id="cen" value="${escapeHtml(model.label_en||"")}" />
        </div>
      </div>
    `, [
      { label: "Mégse", onClick: closeModal },
      { label: isNew ? "Létrehozás" : "Mentés", primary: true, onClick: async () => {
        const id = (isNew ? $("#modalBox #cid").value.trim() : model.id);
        if (!id) return alert("Adj ID-t");

        const next = {
          id: id,
          label_hu: $("#modalBox #chu").value.trim() || id,
          label_en: $("#modalBox #cen").value.trim() || ($("#modalBox #chu").value.trim() || id)
        };

        if (isNew) {
          if (state.doc.categories.some(x => x.id === next.id)) return alert("Már van ilyen ID.");
          state.doc.categories.push(next);
        } else {
          Object.assign(model, next);
        }

        closeModal();
        renderCategories();
        await saveAll(true);
      }}
    ]);
  }

  function deleteCategory(id) {
    const used = state.doc.products.some(p => String(p.categoryId||"") === String(id));
    if (used) return alert("Ezt termék használja — előbb állítsd át.");

    state.doc.categories = state.doc.categories.filter(c => c.id !== id);
    renderCategories();
    saveAll(true);
  }

  // ---------- Sales ----------
  function saleTotal(s) {
    return (s.items || []).reduce((acc, it) => acc + (Number(it.unitPrice || 0) * Number(it.qty || 0)), 0);
  }

  function renderSales() {
    const root = $("#tab-sales");

    const total = state.sales.reduce((a,s)=>a+saleTotal(s),0);
    const today = todayISO();
    const todaySum = state.sales.filter(s => s.date === today).reduce((a,s)=>a+saleTotal(s),0);

    root.innerHTML = `
      <div class="rowline">
        <div class="left">
          <b>Eladások</b>
          <span class="small-muted">Több termék / 1 eladás • Törlés = rollback stock + bevétel is vissza</span>
        </div>
        <button class="primary" id="btnAddSale">+ Eladás</button>
      </div>

      <div class="kpi" style="margin-top:10px">
        <div class="box">
          <div class="t">Összes bevétel</div>
          <div class="v">${fmt(total)} Ft</div>
        </div>
        <div class="box">
          <div class="t">Mai (dátum szerint)</div>
          <div class="v">${fmt(todaySum)} Ft</div>
        </div>
      </div>

      <table class="table" id="sTable">
        <thead>
          <tr>
            <th>Dátum</th>
            <th>Tételek</th>
            <th>Összeg</th>
            <th></th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;

    $("#btnAddSale").addEventListener("click", () => openSaleModal());

    const tbody = root.querySelector("tbody");
    tbody.innerHTML = "";

    const prodMap = new Map(state.doc.products.map(p => [p.id, p]));
    const sorted = [...state.sales].sort((a,b)=> String(b.date).localeCompare(String(a.date)));

    for (const s of sorted) {
      const itemsLabel = (s.items || []).map(it => {
        const p = prodMap.get(it.productId);
        const name = p ? (p.name_hu || p.name_en || "??") : "??";
        const flav = p ? (p.flavor_hu || p.flavor_en || "") : "";
        return `${name}${flav ? ` (${flav})` : ""} ×${it.qty}`;
      }).join(" • ");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.date)}</td>
        <td>${escapeHtml(itemsLabel || "—")}</td>
        <td>${fmt(saleTotal(s))} Ft</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="ghost" data-view="${escapeHtml(s.id)}">Megnéz</button>
          <button class="danger" data-del="${escapeHtml(s.id)}">Töröl</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => viewSale(b.dataset.view)));
    tbody.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => deleteSale(b.dataset.del)));
  }

  function openSaleModal() {
    // exclude soon from selling
    const products = state.doc.products.filter(p => (p.status || "ok") !== "soon");
    if (!products.length) return alert("Nincs eladható termék (soon nem eladható).");

    const prodMap = new Map(state.doc.products.map(p => [p.id, p]));
    const opts = products.map(p => {
      const name = p.name_hu || p.name_en || "??";
      const flav = p.flavor_hu || p.flavor_en || "";
      const st = Math.max(0, Number(p.stock||0));
      return `<option value="${escapeHtml(p.id)}">${escapeHtml(name + (flav ? " • " + flav : "") + ` (stock:${st})`)}</option>`;
    }).join("");

    const body = `
      <div class="form-grid">
        <div class="field third">
          <label>Dátum (csak dátum, nincs óra)</label>
          <input id="sdate" value="${todayISO()}" placeholder="YYYY-MM-DD" />
        </div>
        <div class="field full">
          <label>Tételek</label>
          <div id="items"></div>
          <div style="margin-top:10px;">
            <button class="ghost" id="addItem">+ Tétel</button>
          </div>
        </div>
      </div>
      <div class="small-muted" style="margin-top:10px">
        Mentéskor azonnal levonja a stockot (nem lesz “lassú frissülés”).
      </div>
    `;

    openModal("Új eladás", body, [
      { label: "Mégse", onClick: closeModal },
      { label: "Mentés", primary: true, onClick: async () => {
        const date = $("#modalBox #sdate").value.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return alert("Dátum formátum: YYYY-MM-DD");

        const rows = [...$("#modalBox #items").querySelectorAll("[data-row]")];
        const items = [];
        for (const r of rows) {
          const pid = r.querySelector("select").value;
          const qty = Math.max(1, Number(r.querySelector(".qty").value || 1));
          const unitPrice = Math.max(0, Number(r.querySelector(".price").value || 0));
          if (!pid) continue;
          items.push({ productId: pid, qty, unitPrice });
        }
        if (!items.length) return alert("Adj hozzá legalább 1 tételt.");

        // stock check + instant update (bugfix: ne legyen lassú)
        for (const it of items) {
          const p = prodMap.get(it.productId);
          if (!p) return alert("Ismeretlen termék");
          if ((p.status||"ok")==="soon") return alert("soon termék nem eladható");
          const st = Math.max(0, Number(p.stock||0));
          if (st < it.qty) return alert(`Nincs elég stock: ${p.name_hu||p.name_en} (van: ${st})`);
        }

        // apply stock decrease now
        for (const it of items) {
          const p = prodMap.get(it.productId);
          p.stock = Math.max(0, Number(p.stock||0) - it.qty);
          if (p.stock <= 0 && (p.status||"ok")==="ok") p.status = "out";
        }

        state.sales.push({ id: uniqueId("s"), date, items });

        closeModal();

        // instant re-render
        renderProducts();
        renderSales();

        // save + reload after save
        await saveAll(true);
      }}
    ]);

    const itemsRoot = $("#modalBox #items");

    const addRow = (preset) => {
      const row = document.createElement("div");
      row.className = "rowline";
      row.dataset.row = "1";
      row.innerHTML = `
        <div class="left" style="flex:1;">
          <select style="width:100%; border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(11,15,23,.45);color:var(--text);padding:10px 12px;outline:none;">
            <option value="">Válassz...</option>
            ${opts}
          </select>
          <div class="small-muted" style="margin-top:6px">Egységár + qty</div>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <input class="qty" type="number" min="1" value="1" style="width:90px; border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(11,15,23,.45);color:var(--text);padding:10px 12px;outline:none;">
          <input class="price" type="number" min="0" value="0" style="width:120px; border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(11,15,23,.45);color:var(--text);padding:10px 12px;outline:none;">
          <button class="danger" type="button">Töröl</button>
        </div>
      `;

      const sel = row.querySelector("select");
      const price = row.querySelector(".price");
      sel.addEventListener("change", () => {
        const p = state.doc.products.find(x => x.id === sel.value);
        price.value = String(p ? Number(p.price||0) : 0);
      });
      row.querySelector("button.danger").addEventListener("click", () => row.remove());

      if (preset) {
        sel.value = preset.productId || "";
        row.querySelector(".qty").value = String(preset.qty || 1);
        row.querySelector(".price").value = String(preset.unitPrice || 0);
      }

      itemsRoot.appendChild(row);
    };

    $("#modalBox #addItem").addEventListener("click", () => addRow());
    addRow(); // start 1
  }

  function viewSale(id) {
    const s = state.sales.find(x => x.id === id);
    if (!s) return;

    const prodMap = new Map(state.doc.products.map(p => [p.id, p]));
    const lines = (s.items || []).map(it => {
      const p = prodMap.get(it.productId);
      const name = p ? (p.name_hu || p.name_en || "??") : "??";
      const flav = p ? (p.flavor_hu || p.flavor_en || "") : "";
      return `<div class="rowline">
        <div class="left">
          <b>${escapeHtml(name)}</b>
          <span class="small-muted">${escapeHtml(flav)}</span>
        </div>
        <div><b>${it.qty}</b> db</div>
        <div>${fmt(it.unitPrice)} Ft</div>
        <div><b>${fmt(it.unitPrice * it.qty)} Ft</b></div>
      </div>`;
    }).join("");

    openModal("Eladás", `
      <div class="rowline">
        <div class="left">
          <b>Dátum</b>
          <span class="small-muted">${escapeHtml(s.date)}</span>
        </div>
        <div><b>${fmt(saleTotal(s))} Ft</b></div>
      </div>
      <div style="margin-top:10px">${lines}</div>
    `, [
      { label: "Bezár", primary: true, onClick: closeModal }
    ]);
  }

  function deleteSale(id) {
    const idx = state.sales.findIndex(x => x.id === id);
    if (idx < 0) return;

    const s = state.sales[idx];

    // rollback stock
    for (const it of (s.items || [])) {
      const p = state.doc.products.find(x => x.id === it.productId);
      if (!p) continue;
      p.stock = Math.max(0, Number(p.stock||0) + Number(it.qty||0));
      if (p.stock > 0 && (p.status||"ok")==="out") p.status = "ok";
    }

    state.sales.splice(idx, 1);

    // instant UI update
    renderProducts();
    renderSales();

    // save + reload after save
    saveAll(true);
  }

  function renderAll() {
    renderProducts();
    renderCategories();
    renderSales();
  }

  // ---------- boot ----------
  bindTabs();
  loadCfg();
  setSave("busy");

  // BUGFIX: admin “nem csinál semmit” -> auto load at start
  loadAll().then(() => {
    renderAll();
    setSave("ok");
  });
})();
