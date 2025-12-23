document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
});

function loadProducts() {
    // Adatok betöltése
    let products = JSON.parse(localStorage.getItem('products')) || [];
    const container = document.getElementById('product-container');
    
    if (!container) return;
    container.innerHTML = '';

    // --- RENDEZÉSI LOGIKA (Kérés szerint) ---
    products.sort((a, b) => {
        // 1. "Hamarosan" státuszúak menjenek a lista VÉGÉRE
        const aSoon = a.status === 'hamarosan';
        const bSoon = b.status === 'hamarosan';
        
        if (aSoon && !bSoon) return 1;
        if (!aSoon && bSoon) return -1;

        // 2. Név szerinti ABC sorrend (Így az azonos nevűek egymás mellé kerülnek)
        // localeCompare a helyes magyar rendezéshez
        return a.name.localeCompare(b.name);
    });

    // Kártyák renderelése
    products.forEach(product => {
        const stock = parseInt(product.stock);
        // Ha a készlet 0 VAGY a státusz 'elfogyott', akkor elfogyottnak tekintjük
        const isOutOfStock = stock <= 0 || product.status === 'elfogyott';
        
        // Státusz logika megjelenítéshez
        let badgeHtml = '';
        let statusClass = ''; // Ez megy a kártyára szürkéítéshez

        if (product.status === 'hamarosan') {
            badgeHtml = '<span class="badge-status bg-warning">Hamarosan</span>';
        } else if (isOutOfStock) {
            badgeHtml = '<span class="badge-status bg-danger">Elfogyott</span>';
            statusClass = 'out-of-stock'; // CSS szürke filter
        } else {
            badgeHtml = '<span class="badge-status bg-success">Készleten</span>';
        }

        // HTML Kártya összeállítása
        const cardHtml = `
            <div class="col-lg-3 col-md-4 col-sm-6 mb-4">
                <div class="card ${statusClass}">
                    ${badgeHtml}
                    <img src="${product.image || 'https://via.placeholder.com/1000'}" class="card-img-top" alt="${product.name}">
                    <div class="card-body">
                        <div>
                            <h5 class="card-title">${product.name}</h5>
                            <p class="card-text">${product.flavor}</p>
                        </div>
                        <p class="price">${parseInt(product.price).toLocaleString()} Ft</p>
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML += cardHtml;
    });
}
