const express = require('express');
const helmet = require('helmet');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { initDatabase, db } = require('./src/database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret-before-deployment';
initDatabase();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  index: 'main.html'
}));
function validId(id) { return Number.isInteger(Number(id)) && Number(id) > 0; }
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Увійдіть у свій кабінет, щоб продовжити' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(payload.userId);
    if (!user) return res.status(401).json({ error: 'Обліковий запис не знайдено. Увійдіть повторно.' });
    req.user = user; next();
  } catch { return res.status(401).json({ error: 'Сесія завершилася. Увійдіть повторно.' }); }
}
const createToken = user => jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'TECH STORE API працює' }));

// Registration and login
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60)
    return res.status(400).json({ error: "Ім'я має містити від 2 до 60 символів" });
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120)
    return res.status(400).json({ error: 'Введіть коректну електронну пошту' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 72)
    return res.status(400).json({ error: 'Пароль має містити щонайменше 8 символів' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (exists) return res.status(409).json({ error: 'Користувач із такою поштою вже зареєстрований' });
  const passwordHash = await bcrypt.hash(password, 12);
  const result = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.trim().toLowerCase(), passwordHash);
  const user = { id: Number(result.lastInsertRowid), name: name.trim(), email: email.trim().toLowerCase() };
  res.status(201).json({ message: 'Реєстрація успішна', token: createToken(user), user });
});
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Введіть пошту та пароль' });
  const record = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!record || !(await bcrypt.compare(password, record.password_hash)))
    return res.status(401).json({ error: 'Неправильна електронна пошта або пароль' });
  const user = { id: record.id, name: record.name, email: record.email };
  res.json({ message: 'Вхід виконано', token: createToken(user), user });
});
app.get('/api/auth/me', authRequired, (req, res) => res.json({ user: req.user }));

// Products CRUD
app.get('/api/products', (req, res) => res.json(db.prepare('SELECT * FROM products ORDER BY id').all()));
app.get('/api/products/:id', (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Некоректний ID товару' });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Товар не знайдено' }); res.json(product);
});
app.post('/api/products', (req, res) => {
  const { name, description = '', price, image = '' } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100 || !Number.isFinite(Number(price)) || Number(price) <= 0 || Number(price) > 10000000)
    return res.status(400).json({ error: 'Вкажіть назву та коректну ціну більше нуля' });
  const result = db.prepare('INSERT INTO products (name, description, price, image) VALUES (?, ?, ?, ?)').run(name.trim(), String(description).slice(0,500), Number(price), String(image).slice(0,200));
  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid));
});
app.put('/api/products/:id', (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Некоректний ID товару' });
  const old = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
  if (!old) return res.status(404).json({ error: 'Товар не знайдено' });
  const { name = old.name, description = old.description, price = old.price, image = old.image } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100 || !Number.isFinite(Number(price)) || Number(price) <= 0) return res.status(400).json({ error: 'Некоректні дані товару' });
  db.prepare('UPDATE products SET name=?, description=?, price=?, image=? WHERE id=?').run(name.trim(), String(description).slice(0,500), Number(price), String(image).slice(0,200), Number(req.params.id));
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id)));
});
app.delete('/api/products/:id', (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Некоректний ID товару' });
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Товар не знайдено' }); res.json({ message: 'Товар видалено' });
});

// Create an order for the currently authenticated customer
app.post('/api/orders', authRequired, (req, res) => {
  const { customerName, phone, address, items } = req.body || {};
  if (typeof customerName !== 'string' || customerName.trim().length < 2 || customerName.trim().length > 80) return res.status(400).json({ error: "Введіть ім'я (від 2 до 80 символів)" });
  if (typeof phone !== 'string' || !/^\+380\d{9}$/.test(phone)) return res.status(400).json({ error: 'Телефон має бути у форматі +380XXXXXXXXX' });
  if (typeof address !== 'string' || address.trim().length < 5 || address.trim().length > 200) return res.status(400).json({ error: 'Введіть коректну адресу доставки' });
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) return res.status(400).json({ error: 'Кошик порожній або містить забагато позицій' });
  let total = 0; const normalized = [];
  for (const item of items) {
    const id = Number(item.productId), quantity = Number(item.quantity);
    if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return res.status(400).json({ error: 'Некоректна кількість товару' });
    const product = db.prepare('SELECT id, name, price FROM products WHERE id = ?').get(id);
    if (!product) return res.status(400).json({ error: 'Один із товарів більше недоступний' });
    total += product.price * quantity; normalized.push({ product, quantity });
  }
  const saveOrder = db.transaction(() => {
    const order = db.prepare('INSERT INTO orders (user_id, customer_name, phone, address, total) VALUES (?, ?, ?, ?, ?)').run(req.user.id, customerName.trim(), phone, address.trim(), total);
    const addItem = db.prepare('INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)');
    for (const row of normalized) addItem.run(order.lastInsertRowid, row.product.id, row.product.name, row.quantity, row.product.price);
    return Number(order.lastInsertRowid);
  });
  const orderId = saveOrder(); res.status(201).json({ message: 'Замовлення успішно оформлено та збережено у вашому кабінеті', orderId, total });
});
app.get('/api/orders/my', authRequired, (req, res) => {
  const orders = db.prepare('SELECT id, customer_name AS customerName, phone, address, total, created_at AS createdAt FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  const getItems = db.prepare('SELECT product_name AS name, quantity, unit_price AS unitPrice FROM order_items WHERE order_id = ?');
  res.json(orders.map(order => ({ ...order, items: getItems.all(order.id) })));
});
app.use((req, res) => res.status(404).json({ error: 'Маршрут не знайдено' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Внутрішня помилка сервера' }); });
app.listen(PORT, () => console.log(`TECH STORE запущено: http://localhost:${PORT}`));
