const $ = (s) => document.querySelector(s);

const state = {
  lang: localStorage.getItem("sv_lang") || "hu",
  productsDoc: null,
  products: [],
  categories: [],
  activeCat: "all",
  search: ""
};

const T = {
  hu: { all:"Összes termék", soon:"Hamarosan", out:"Elfogyott", ok:"Készleten", pcs:"db", stock:"Készlet", price:"Ár", title:"Termékek" },
  en: { all:"All products", soon:"Coming soon", out:"Sold out", ok:"In stock", pcs:"pcs", stock:"Stock", price:"Price", title:"Products" },
};
const tr = (k)=> (T[state.lang] && T[state.lang][k]) || k;

const norm = (s)=> (s||"").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

function getName(p){
  return state.lang==="en" ? (p.name_en||p.name_hu||p.name||"") : (p.name_hu||p.name_en||p.name||"");
}
function getFlavor(p){
  return state.lang==="en" ? (p.flavor_en||p.flavor_hu||p.flavor||"") : (p.flavor_hu||p.flavor_en||p.flavor||"");
}
function catLabel(c){
  if(!c) return "";
  return state.lang==="en" ? (c.label_en||c.label_hu||c.id) : (c.label_hu||c.label_en||c.id);
}
function getCatById(id){
  return state.categories.find(c => String(c.id)===String(id)) || null;
}
function calcPrice(p){
  // termék price (override) > category defaultPrice > 0
  const override = (p.price !== undefined ? p.price : p.priceOverride);
  if(override !== null && override !== "" && override !== undefined){
    const v = Number(override);
    if(Number.isFinite(v)) return v;
  }
  const c = getCatById(p.categoryId);
  const dv = c ? Number(c.defaultPrice||0) : 0;
  return Number.isFinite(dv) ? dv : 0;
}
function fmtFt(n){
  return Number(n||0).toLocaleString("hu-HU") + " Ft";
}

function orderedCats(){
  // Összes mindig első, Hamarosan mindig utolsó
  const base = [...state.categories].filter(c => c && c.id && c.id !== "all" && c.id !== "soon");
  base.sort((a,b)=> catLabel(a).localeCompare(catLabel(b), state.lang==="hu"?"hu":"en"));
  return [{id:"all", virtual:true}, ...base, {id:"soon", virtual:true}];
}

function setActiveInfo(){
  const label =
    state.activeCat==="all" ? tr("all") :
    state.activeCat==="soon" ? tr("soon") :
    catLabel(getCatById(state.activeCat));
  $("#activeInfo").textContent = label || "—";
}

function renderNav(){
  const nav = $("#nav");
  nav.innerHTML = "";
  for(const c of orderedCats()){
    const b = document.createElement("button");
    b.className = (state.activeCat===c.id) ? "active" : "";
    b.textContent = c.id==="all" ? tr("all") : (c.id==="soon" ? tr("soon") : catLabel(c));
    b.onclick = ()=> { state.activeCat=c.id; setActiveInfo(); render(); };
    nav.appendChild(b);
  }
}

function groupAndSort(list){
  // cél:
  // - azonos nevűek egymás mellett
  // - out (elfogyott) minden kategóriában hátul legyen (group szinten is)
  const groups = new Map();
  for(const p of list){
    const key = norm(getName(p));
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const groupArr = [...groups.entries()].map(([k, items])=>{
    // hasAvailable: ha van ok/stock>0 (nem soon tab)
    const hasAvail = items.some(x => {
      const st = (x.status||"ok");
      const stock = Math.max(0, Number(x.stock||0));
      return st !== "soon" && st !== "out" && stock > 0;
    });
    return { key:k, items, hasAvail };
  });

  groupArr.sort((a,b)=>{
    // elérhető group előre, csak-out group hátra
    if(a.hasAvail !== b.hasAvail) return a.hasAvail ? -1 : 1;
    // név szerinti
    return a.key.localeCompare(b.key, state.lang==="hu"?"hu":"en");
  });

  const out = [];
  for(const g of groupArr){
    g.items.sort((a,b)=>{
      // csoporton belül: ok előre, out hátra, majd íz szerint
      const ra = ((a.status||"ok")==="out" || Number(a.stock||0)<=0) ? 1 : 0;
      const rb = ((b.status||"ok")==="out" || Number(b.stock||0)<=0) ? 1 : 0;
      if(ra!==rb) return ra-rb;
      return norm(getFlavor(a)).localeCompare(norm(getFlavor(b)));
    });
    out.push(...g.items);
  }
  return out;
}

function filtered(){
  const q = norm(state.search);

  let list = state.products.filter(p=>{
    const st = (p.status||"ok");
    if(st==="soon"){
      return state.activeCat==="soon";
    }
    if(state.activeCat==="soon") return false;

    if(state.activeCat==="all") return true;
    return String(p.categoryId||"")===String(state.activeCat);
  });

  if(q){
    list = list.filter(p=>{
      const hay = norm(getName(p)) + " " + norm(getFlavor(p));
      return hay.includes(q);
    });
  }

  // Out mindig hátra + azonos nevűek együtt
  return groupAndSort(list);
}

function badgeFor(p){
  const st = (p.status||"ok");
  const stock = Math.max(0, Number(p.stock||0));
  if(st==="soon") return { text: tr("soon"), cls:"soon" };
  if(st==="out" || stock<=0) return { text: tr("out"), cls:"out" };
  return { text: tr("ok"), cls:"" };
}

function card(p){
  const name = getName(p);
  const flavor = getFlavor(p);
  const st = (p.status||"ok");
  const stock = Math.max(0, Number(p.stock||0));
  const isOut = (st==="out" || stock<=0) && st!=="soon";

  const c = document.createElement("div");
  c.className = "card fade-in" + (isOut ? " dim" : "");

  const hero = document.createElement("div");
  hero.className = "hero";

  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = p.image || "";
  img.alt = name + (flavor ? " - " + flavor : "");
  hero.appendChild(img);

  const badges = document.createElement("div");
  badges.className = "badges";
  const b = badgeFor(p);
  const badge = document.createElement("div");
  badge.className = "badge " + (b.cls || "");
  badge.textContent = b.text;
  badges.appendChild(badge);
  hero.appendChild(badges);

  const overlay = document.createElement("div");
  overlay.className = "overlay-title";
  overlay.innerHTML = `
    <div class="name">${escapeHtml(name)}</div>
    <div class="flavor">${escapeHtml(flavor || "")}</div>
    <div class="info">
      <div class="priceTag">${fmtFt(calcPrice(p))}</div>
      <div class="stockTag">${st==="soon" ? "—" : `${tr("stock")}: <b>${stock}</b> ${tr("pcs")}`}</div>
    </div>
  `;
  hero.appendChild(overlay);

  const body = document.createElement("div");
  body.className = "card-body";
  body.innerHTML = `
    <div class="meta-row">
      <div class="price">${fmtFt(calcPrice(p))}</div>
      <div class="stock">${st==="soon" ? "—" : `${tr("stock")}: <b>${stock}</b> ${tr("pcs")}`}</div>
    </div>
  `;

  c.appendChild(hero);
  c.appendChild(body);

  c.onclick = ()=> openModal(p);
  return c;
}

function openModal(p){
  const name = getName(p);
  const flavor = getFlavor(p);
  const st = (p.status||"ok");
  const stock = Math.max(0, Number(p.stock||0));
  const price = calcPrice(p);

  $("#mTitle").textContent = name;
  $("#mDesc").innerHTML =
    `${escapeHtml(flavor || "")}<br>` +
    `<span class="small-muted">${fmtFt(price)} • ${st==="soon" ? "—" : `${tr("stock")}: ${stock} ${tr("pcs")}`}</span>`;
  $("#modalBackdrop").style.display = "flex";
}

function closeModal(){
  $("#modalBackdrop").style.display = "none";
}

function render(){
  const list = filtered();
  const grid = $("#grid");
  grid.innerHTML = "";

  $("#countText").textContent = `${list.length} ${tr("pcs")}`;
  $("#title").textContent = tr("title");
  $("#empty").style.display = list.length ? "none" : "block";

  for(const p of list){
    grid.appendChild(card(p));
  }
}

function bind(){
  $("#langBtn").onclick = ()=>{
    state.lang = state.lang==="hu" ? "en" : "hu";
    localStorage.setItem("sv_lang", state.lang);
    $("#langBtn").textContent = state.lang.toUpperCase();
    renderNav();
    setActiveInfo();
    render();
  };

  $("#search").addEventListener("input", (e)=>{
    state.search = e.target.value || "";
    render();
  });
  $("#clearSearch").onclick = ()=>{
    state.search = "";
    $("#search").value = "";
    render();
  };

  $("#mClose").onclick = closeModal;
  $("#modalBackdrop").onclick = (e)=>{
    if(e.target && e.target.id==="modalBackdrop") closeModal();
  };
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}

async function load(){
  // cache-bust => ne várj 6 percet a GitHub Pages cache-re
  const v = Date.now();
  const res = await fetch(`data/products.json?v=${v}`, { cache:"no-store" });
  const doc = await res.json();

  state.productsDoc = doc && typeof doc==="object" ? doc : { products:[], categories:[] };
  state.products = Array.isArray(state.productsDoc.products) ? state.productsDoc.products : (Array.isArray(state.productsDoc) ? state.productsDoc : []);
  state.categories = Array.isArray(state.productsDoc.categories) ? state.productsDoc.categories : [];

  // normalize
  state.categories = state.categories
    .filter(c=>c && c.id)
    .map(c=>({
      id: String(c.id),
      label_hu: c.label_hu || c.id,
      label_en: c.label_en || c.label_hu || c.id,
      defaultPrice: Number(c.defaultPrice||0)
    }));

  // default category list if empty (safe fallback)
  if(!state.categories.length){
    const seen = new Set();
    for(const p of state.products){
      if(p.categoryId && !seen.has(p.categoryId)){
        seen.add(p.categoryId);
        state.categories.push({ id:String(p.categoryId), label_hu:String(p.categoryId), label_en:String(p.categoryId), defaultPrice:0 });
      }
    }
  }

  $("#langBtn").textContent = state.lang.toUpperCase();
  renderNav();
  setActiveInfo();
  bind();
  render();

  $("#loader").style.display="none";
  $("#app").style.display="";
}

load().catch(err=>{
  console.error(err);
  $("#loaderText").textContent = "Hiba betöltésnél: " + err.message;
});
