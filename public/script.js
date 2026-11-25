const CART_KEY = 'techStoreCart';
const TOKEN_KEY = 'techStoreToken';
const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const authHeaders = () => getToken() ? { Authorization: `Bearer ${getToken()}` } : {};
const money = value => new Intl.NumberFormat('uk-UA').format(value);
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Помилка запиту до сервера');
  return data;
}
function readCart() { try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; } }
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
function addToCart(productId) {
  const cart = readCart(); const found = cart.find(x => x.productId === Number(productId));
  if (found) found.quantity = Math.min(99, found.quantity + 1); else cart.push({ productId: Number(productId), quantity: 1 });
  saveCart(cart);
}

// Responsive navigation
const menuButton = document.querySelector('.menu-toggle');
const navMenu = document.querySelector('.nav-menu');
if (menuButton && navMenu) menuButton.addEventListener('click', () => {
  const active = navMenu.classList.toggle('active'); menuButton.setAttribute('aria-expanded', String(active));
});

// Load live product data from REST API and update cards
async function loadProductCards() {
  const cards = [...document.querySelectorAll('.product-card[data-product-id]')];
  if (!cards.length) return;
  try {
    const products = await api('/api/products');
    cards.forEach(card => {
      const product = products.find(p => p.id === Number(card.dataset.productId));
      if (!product) { card.hidden = true; return; }
      const name = card.querySelector('.product-name') || card.querySelector('h3');
      const price = card.querySelector('.price');
      if (name) name.textContent = product.name;
      if (price) price.textContent = `${money(product.price)} грн`;
    });
  } catch (error) { console.error(error); }
}
loadProductCards();

// Catalog search
const searchInput = document.querySelector('#product-search');
if (searchInput) searchInput.addEventListener('input', () => {
  const term = searchInput.value.toLocaleLowerCase('uk');
  document.querySelectorAll('.product-card').forEach(card => {
    const name = card.querySelector('.product-name')?.textContent.toLocaleLowerCase('uk') || '';
    card.hidden = !name.includes(term);
  });
});

// Add item from a product page
for (const button of document.querySelectorAll('.add-to-cart')) button.addEventListener('click', () => {
  addToCart(button.dataset.productId);
  const feedback = document.querySelector('.cart-feedback');
  if (feedback) feedback.textContent = 'Товар додано до кошика!';
  button.textContent = 'Додано ✓';
  setTimeout(() => { button.textContent = 'Додати до кошика'; }, 1200);
});

// Cart view and quantity controls
async function renderCart() {
  const container = document.querySelector('#cart-items');
  if (!container) return;
  try {
    const products = await api('/api/products');
    let cart = readCart().filter(row => products.some(p => p.id === row.productId));
    saveCart(cart);
    if (!cart.length) { container.innerHTML = '<p>Кошик порожній. <a href="catalog.html">Перейти до каталогу</a>.</p>'; updateSummary(0, 0); return; }
    container.replaceChildren();
    cart.forEach(row => {
      const product = products.find(p => p.id === row.productId);
      const article = document.createElement('article'); article.className = 'cart-item';
      const imageBox = document.createElement('div'); imageBox.className = 'product-icon';
      const image = document.createElement('img'); image.src = product.image || ''; image.alt = product.name; imageBox.append(image);
      const info = document.createElement('div');
      const title = document.createElement('h3'); title.textContent = product.name;
      const price = document.createElement('p'); price.className = 'price'; price.textContent = `${money(product.price)} грн за шт.`;
      const minus = document.createElement('button'); minus.className = 'minus'; minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', 'Зменшити кількість');
      const quantity = document.createElement('span'); quantity.className = 'quantity'; quantity.textContent = row.quantity;
      const plus = document.createElement('button'); plus.className = 'plus'; plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', 'Збільшити кількість');
      const subtotal = document.createElement('p'); subtotal.textContent = `Разом: ${money(product.price * row.quantity)} грн`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Видалити'; remove.addEventListener('click', () => changeQuantity(product.id, 0, true));
      minus.addEventListener('click', () => changeQuantity(product.id, -1)); plus.addEventListener('click', () => changeQuantity(product.id, 1));
      info.append(title, price, minus, quantity, plus, subtotal, remove); article.append(imageBox, info); container.append(article);
    });
    const count = cart.reduce((sum, row) => sum + row.quantity, 0);
    const total = cart.reduce((sum, row) => { const p = products.find(x => x.id === row.productId); return sum + p.price * row.quantity; }, 0);
    updateSummary(count, total);
  } catch (error) { container.textContent = `Не вдалося завантажити кошик: ${error.message}`; }
}
function updateSummary(count, total) { const c=document.querySelector('#summary-count'), t=document.querySelector('#summary'); if(c)c.textContent=count; if(t)t.textContent=money(total); }
function changeQuantity(id, delta, remove=false) {
  let cart = readCart(); const row = cart.find(x => x.productId === id);
  if (row) { if (remove) cart = cart.filter(x => x.productId !== id); else row.quantity = Math.max(1, Math.min(99, row.quantity + delta)); }
  saveCart(cart); renderCart();
}
renderCart();

// Submit order to server and save it in SQLite
const openButton = document.querySelector('#open-order-form');
const closeButton = document.querySelector('#close-order-form');
const formContainer = document.querySelector('#order-form-container');
const orderForm = document.querySelector('#order-form');
if (openButton && formContainer) openButton.addEventListener('click', () => {
  if (!readCart().length) { const msg=document.querySelector('#form-message'); if(msg) msg.textContent='Спочатку додайте товар до кошика.'; return; }
  formContainer.hidden = false;
});
if (closeButton && formContainer) closeButton.addEventListener('click', () => { formContainer.hidden = true; });
if (orderForm) orderForm.addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.querySelector('#form-message');
  const payload = {
    customerName: document.querySelector('#customer-name').value.trim(),
    phone: document.querySelector('#customer-phone').value.trim(),
    address: document.querySelector('#customer-address').value.trim(),
    items: readCart()
  };
  if (!getToken()) { window.location.href = 'auth.html?next=cart.html'; return; }
  try {
    const result = await api('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
    message.textContent = `${result.message}! Номер замовлення: ${result.orderId}. Сума: ${money(result.total)} грн.`;
    message.style.color = 'green'; saveCart([]); orderForm.reset(); await renderCart();
  } catch (error) { message.textContent = error.message; message.style.color = 'red'; }
});


// Authentication page: sign in or create an account.
const authForm = document.querySelector('#auth-form');
if (authForm) {
  const modeButtons = document.querySelectorAll('[data-auth-mode]');
  const nameField = document.querySelector('#auth-name-field');
  const title = document.querySelector('#auth-title');
  const submit = document.querySelector('#auth-submit');
  let mode = 'login';
  modeButtons.forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.authMode;
    nameField.hidden = mode !== 'register';
    title.textContent = mode === 'register' ? 'Створення облікового запису' : 'Вхід до кабінету';
    submit.textContent = mode === 'register' ? 'Зареєструватися' : 'Увійти';
    modeButtons.forEach(b => b.classList.toggle('selected', b === button));
    document.querySelector('#auth-message').textContent = '';
  }));
  authForm.addEventListener('submit', async event => {
    event.preventDefault();
    const message = document.querySelector('#auth-message');
    const payload = { email: document.querySelector('#auth-email').value.trim(), password: document.querySelector('#auth-password').value };
    if (mode === 'register') payload.name = document.querySelector('#auth-name').value.trim();
    try {
      const result = await api(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(payload) });
      localStorage.setItem(TOKEN_KEY, result.token);
      const next = new URLSearchParams(location.search).get('next');
      location.href = next === 'cart.html' ? 'cart.html' : 'account.html';
    } catch (error) { message.textContent = error.message; message.className = 'form-message error'; }
  });
}

// Personal account and order history.
const accountRoot = document.querySelector('#account-content');
if (accountRoot) {
  (async () => {
    if (!getToken()) { location.href = 'auth.html'; return; }
    try {
      const [profile, orders] = await Promise.all([api('/api/auth/me'), api('/api/orders/my')]);
      document.querySelector('#account-name').textContent = profile.user.name;
      document.querySelector('#account-email').textContent = profile.user.email;
      const list = document.querySelector('#orders-list');
      if (!orders.length) { list.innerHTML = '<div class="empty-state"><h3>Замовлень поки немає</h3><p>Коли оформите першу покупку, вона з’явиться тут.</p><a class="button" href="catalog.html">Перейти до каталогу</a></div>'; return; }
      list.replaceChildren();
      orders.forEach(order => {
        const card = document.createElement('article'); card.className = 'order-card';
        const heading = document.createElement('div'); heading.className = 'order-heading';
        const orderTitle = document.createElement('h3'); orderTitle.textContent = `Замовлення №${order.id}`;
        const date = document.createElement('span'); date.textContent = new Date(order.createdAt.replace(' ', 'T') + 'Z').toLocaleString('uk-UA');
        heading.append(orderTitle, date);
        const items = document.createElement('ul'); items.className = 'order-products';
        order.items.forEach(item => { const li = document.createElement('li'); li.textContent = `${item.name} — ${item.quantity} шт. × ${money(item.unitPrice)} грн`; items.append(li); });
        const total = document.createElement('p'); total.className = 'order-total'; total.textContent = `Сума: ${money(order.total)} грн`;
        const address = document.createElement('p'); address.textContent = `Доставка: ${order.address}`;
        const phone = document.createElement('p'); phone.textContent = `Телефон: ${order.phone}`;
        card.append(heading, items, total, address, phone); list.append(card);
      });
    } catch (error) {
      if (error.message.includes('Сесія') || error.message.includes('Увійдіть')) { localStorage.removeItem(TOKEN_KEY); location.href = 'auth.html'; return; }
      accountRoot.textContent = error.message;
    }
  })();
  document.querySelector('#logout-button')?.addEventListener('click', () => { localStorage.removeItem(TOKEN_KEY); location.href = 'main.html'; });
}

document.querySelectorAll('.nav-menu').forEach(nav => {

    // Шукаємо вже наявне посилання на кабінет
    let link = nav.querySelector(
        '[data-account-link], a[href="account.html"], a[href="auth.html"]'
    );

    // Якщо посилання немає — створюємо його
    if (!link) {
        link = document.createElement('a');
        nav.append(link);
    }

    // Позначаємо посилання, щоб не створювати дублікати
    link.dataset.accountLink = 'true';

    // Оновлюємо посилання залежно від авторизації
    if (getToken()) {
        link.href = 'account.html';
        link.textContent = 'Мій кабінет';
    } else {
        link.href = 'auth.html';
        link.textContent = 'Увійти';
    }

});
