fetch('data.json?v=' + Date.now())
  .then(r => r.json())
  .then(data => init(data));

function init(data) {
  const grid = document.getElementById('grid');
  const cats = document.getElementById('cats');

  let active = 'Összes termék';

  const categories = ['Összes termék', ...new Set(data.products.map(p => p.category))];

  function renderCats() {
    cats.innerHTML = '';
    categories.forEach(c => {
      const d = document.createElement('div');
      d.className = 'cat' + (c === active ? ' active' : '');
      d.textContent = c;
      d.onclick = () => {
        active = c;
        renderCats();
        render();
      };
      cats.appendChild(d);
    });
  }

  function render() {
    grid.innerHTML = '';
    data.products
      .filter(p => active === 'Összes termék' || p.category === active)
      .sort((a,b) => (a.status === 'soldout') - (b.status === 'soldout'))
      .forEach(p => {
        const card = document.createElement('div');
        card.className = 'card' + (p.status === 'soldout' ? ' sold' : '');

        card.innerHTML = `
          ${p.status === 'soldout' ? '<div class="badge soldout">Elfogyott</div>' : ''}
          ${p.status === 'comingsoon' ? '<div class="badge coming">Hamarosan</div>' : ''}
          <img src="${p.image}">
          <div class="name">${p.nameHU}</div>
          <div class="flavor">${p.flavorHU}</div>
          <div class="info">
            <div>${p.price} Ft</div>
            <div>${p.stock} db</div>
          </div>
        `;
        grid.appendChild(card);
      });
  }

  renderCats();
  render();
}
