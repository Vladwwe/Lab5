const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'tech-store.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL CHECK(price > 0),
      image TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      total REAL NOT NULL CHECK(total >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL CHECK(unit_price > 0)
    );
  `);
  // Migration for databases created by the previous lab version.
  const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
  if (!orderColumns.includes('user_id')) db.exec('ALTER TABLE orders ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
  const count = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  if (count === 0) {
    const insert = db.prepare('INSERT INTO products (name, description, price, image) VALUES (?, ?, ?, ?)');
    const seed = db.transaction(() => {
      insert.run('Бездротові навушники', 'Сучасні бездротові навушники для комфортного прослуховування музики.', 1999, 'photo1.jpg');
      insert.run("Комп'ютерна миша", 'Комп’ютерна миша для комфортного користування ПК.', 499, 'photo2.jpg');
      insert.run('Клавіатура', 'Комп’ютерна клавіатура для роботи та ігор.', 1499, 'photo3.jpg');
    });
    seed();
  }
}
module.exports = { db, initDatabase };
