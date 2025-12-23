const DATA_URL = 'data.json';

let DATA = null;
let currentCategory = 'Összes termék';
let currentTab = 'all'; // all | comingsoon
let lang = localStorage.getItem('sv_lang') || null;

const elGrid = document.getElementById('grid');
const elCatList = document.getElementById('catList');
const elLoader = document.getElementById('loader');
const elBrandName = document.getElementById('brandName');
const elLangToggle = document.getElementById('langToggle');

function showLoader(on){
  elLoader.style.display = on ? 'grid' : 'none';
}
function cacheBust(url){
  return `${url}?v=${Date.now()}`;
}

async function loadData(){
  showLoader(true);
  const res = await fetch(cacheBust(DATA_URL), { cache: 'no-store' });
  if(!res.ok) throw new Error('Nem jött le a data.json');
  DATA = await res.json();
  elBrandName.textContent = DATA.shopName || 'ShadowVapes';
  document.title = DATA.shopName || 'ShadowVapes';
  showLoader(false);
}

function pickLangIfNeeded(){
  if(lang) return;
  // “popup” egyszerűen confirm-ekkel (stabil, nem kell extra lib)
  const hu = confirm('Terméknevek nyelve: OK = Magyar, Cancel = Angol (eredeti)');
  lang = hu ? 'hu' : 'en';
  localStorage.setItem('sv_lang', lang);
}

function getName(p){
  return lang === 'hu' ? (p.nameHU || p.nameEN || '') : (p.nameEN || p.nameHU || '');
}
function getFlavor(p){
  return lang === 'hu' ? (p.flavorHU || p.flavorEN || '') : (p.flavorEN || p.flavorHU || '');
}

function renderCategories(){
  const cats = Array.isArray(DATA.categories) ? DATA.categories : ['Összes termék'];
  const counts = {};
  for(const p of DATA.products || []){
    const cat = p.category || 'Egyéb';
    counts[cat] = (counts[cat]||0) + 1;
  }

  elCatList.innerHTML = '';
  // mindig legyen Összes termék
  const list = cats.includes('Összes termék') ? cats : ['Összes termék', ...cats];

  for(const c of list){
    const div = document.createElement('div');
    div.className = 'sideItem' + (c===currentCategory ? ' active':'');
    div.innerHTML = `<span>${c}</span><span class="badge">${c==='Összes termék' ? (DATA.products||[]).length : (counts[c]||0)}</span>`;
    div.onclick = () => { currentCategory=c; render(); renderCategories(); };
    elCatList.appendChild(div);
  }
}

function sortProducts(arr){
  // soldout menjen alulra, normal/comingsoon felül
  return [...arr].sort((a,b)=>{
    const sa = a.status === 'soldout' ? 1 : 0;
    const sb = b.status === 'soldout' ? 1 : 0;
    if(sa !== sb) return sa - sb;
    return (getName(a) || '').localeCompare(getName(b) || '');
  });
}

function filterProducts(){
  let items = DATA.products || [];

  // tab logika:
  // - all: ne mutassa a comingsoon cuccokat
  // - comingsoon: csak comingsoon cuccok
  if(currentTab === 'all'){
    items = items.filter(p => p.status !== 'comingsoon');
  }else{
    items = items.filter(p => p.status === 'comingsoon');
  }

  // category
  if(currentCategory !== 'Összes termék'){
    items = items.filter(p => (p.category || '') === currentCategory);
  }

  return sortProducts(items);
}

function cardTag(p){
  if(p.status === 'soldout') return `<div class="tag soldout">Elfogyott</div>`;
  if(p.status === 'comingsoon') return `<div class="tag comingsoon">Hamarosan</div>`;
  return '';
}

function render(){
  const items = filterProducts();
  elGrid.innerHTML = '';

  for(const p of items){
    const card = document.createElement('div');
    card.className = 'card' + (p.status === 'soldout' ? ' soldDim':'');
    const price = Number(p.price || 0).toLocaleString('hu-HU');
    const stock = Math.max(0, Number(p.stock || 0));

    card.innerHTML = `
      ${cardTag(p)}
      <img class="cardImg" src="${p.image || ''}" alt="">
      <div class="overlay">
        <div class="nameLine">
          <div class="pname">${escapeHtml(getName(p))}</div>
        </div>
        <div class="flavor">${escapeHtml(getFlavor(p))}</div>
        <div class="meta">
          <div class="kpi">Ár: <b>${price} Ft</b></div>
          <div class="kpi">Készlet: <b>${stock} db</b></div>
        </div>
      </div>
    `;
    elGrid.appendChild(card);
  }
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function wireTabs(){
  document.querySelectorAll('.pill').forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll('.pill').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      render();
    };
  });
}

elLangToggle.onclick = ()=>{
  lang = (lang === 'hu') ? 'en' : 'hu';
  localStorage.setItem('sv_lang', lang);
  render();
};

(async ()=>{
  showLoader(true);
  await loadData();
  pickLangIfNeeded();
  wireTabs();
  renderCategories();
  render();
})();
