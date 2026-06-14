import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const dbPath = process.env.DB_PATH || path.join(dataDir, "bar-papa.sqlite");
const PORT = process.env.PORT || 3001;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

function now() {
  return new Date().toISOString();
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function createPdf(title, rows) {
  const lines = [title, "", ...rows].flatMap((line) => String(line).split("\n"));
  const content = lines
    .map((line, index) => `BT /F1 10 Tf 40 ${760 - index * 16} Td (${escapePdf(line)}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(body, "binary");
}

function escapePdf(value) {
  return String(value).replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7E]/g, "");
}

function migration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'cerveza',
      price_cents INTEGER NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (table_id) REFERENCES tables(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      table_name TEXT NOT NULL,
      total_cents INTEGER NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      cash_received_cents INTEGER NOT NULL DEFAULT 0,
      change_cents INTEGER NOT NULL DEFAULT 0,
      closed_by INTEGER,
      closed_at TEXT NOT NULL,
      FOREIGN KEY (closed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      stock_before INTEGER NOT NULL,
      stock_after INTEGER NOT NULL,
      table_id INTEGER,
      sale_id INTEGER,
      user_id INTEGER,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (count === 0) {
    db.prepare("INSERT INTO users (name, pin, active, created_at) VALUES (?, ?, 1, ?)").run("Admin", "1234", now());
  }
}

migration();

function audit(userId, action, entity, entityId, details) {
  db.prepare(
    "INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(userId || null, action, entity, entityId || null, json(details), now());
}

function requireUser(req) {
  const userId = Number(req.get("x-user-id") || req.body?.userId || 0);
  if (!userId) {
    const error = new Error("Selecciona un usuario antes de operar.");
    error.status = 401;
    throw error;
  }
  const user = db.prepare("SELECT id, name, active FROM users WHERE id = ? AND active = 1").get(userId);
  if (!user) {
    const error = new Error("Usuario no valido o inactivo.");
    error.status = 401;
    throw error;
  }
  return user;
}

function productById(productId) {
  return db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
}

function openTableById(tableId) {
  return db.prepare("SELECT * FROM tables WHERE id = ? AND status = 'open'").get(tableId);
}

function addInventoryMovement({ productId, type, quantity, stockBefore, stockAfter, tableId, saleId, userId, note }) {
  db.prepare(`
    INSERT INTO inventory_movements
      (product_id, type, quantity, stock_before, stock_after, table_id, sale_id, user_id, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(productId, type, quantity, stockBefore, stockAfter, tableId || null, saleId || null, userId || null, note || null, now());
}

function changeStock(productId, delta, context) {
  const product = productById(productId);
  if (!product) throw new Error("Producto no encontrado.");
  const nextStock = product.stock + delta;
  if (nextStock < 0) throw new Error(`Stock insuficiente para ${product.name}. Disponible: ${product.stock}.`);
  db.prepare("UPDATE products SET stock = ?, updated_at = ? WHERE id = ?").run(nextStock, now(), productId);
  addInventoryMovement({
    productId,
    type: context.type,
    quantity: delta,
    stockBefore: product.stock,
    stockAfter: nextStock,
    tableId: context.tableId,
    saleId: context.saleId,
    userId: context.userId,
    note: context.note,
  });
  return nextStock;
}

function hydrateTable(row) {
  const items = db.prepare(`
    SELECT oi.id, oi.table_id AS tableId, oi.product_id AS productId, oi.quantity,
      oi.unit_price_cents AS unitPriceCents, p.name AS productName, p.category,
      oi.quantity * oi.unit_price_cents AS totalCents
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.table_id = ?
    ORDER BY oi.id
  `).all(row.id);
  const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalCents,
    items,
  };
}

function saleWithItems(row) {
  const items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id").all(row.id).map((item) => ({
    id: item.id,
    saleId: item.sale_id,
    productId: item.product_id,
    productName: item.product_name,
    quantity: item.quantity,
    unitPriceCents: item.unit_price_cents,
    totalCents: item.total_cents,
  }));
  return {
    id: row.id,
    tableId: row.table_id,
    tableName: row.table_name,
    totalCents: row.total_cents,
    paymentMethod: row.payment_method,
    cashReceivedCents: row.cash_received_cents,
    changeCents: row.change_cents,
    closedBy: row.closed_by,
    closedByName: row.closed_by_name,
    closedAt: row.closed_at,
    items,
  };
}

function xlsResponse(res, filename, headers, rows) {
  const table = [
    "<table><thead><tr>",
    ...headers.map((header) => `<th>${header}</th>`),
    "</tr></thead><tbody>",
    ...rows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell ?? "")}</td>`).join("")}</tr>`),
    "</tbody></table>",
  ].join("");
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(`<!doctype html><html><meta charset="utf-8"><body>${table}</body></html>`);
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-id");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, dbPath });
});

app.post("/api/session", (req, res) => {
  const pin = String(req.body.pin || "").trim();
  const user = db.prepare("SELECT id, name FROM users WHERE pin = ? AND active = 1").get(pin);
  if (!user) return res.status(401).json({ error: "PIN incorrecto." });
  audit(user.id, "session.login", "users", user.id, {});
  res.json({ user });
});

app.get("/api/users", (req, res) => {
  res.json(db.prepare("SELECT id, name, active, created_at AS createdAt FROM users ORDER BY name").all());
});

app.post("/api/users", (req, res) => {
  const user = requireUser(req);
  const name = String(req.body.name || "").trim();
  const pin = String(req.body.pin || "").trim();
  if (!name || !pin) return res.status(400).json({ error: "Nombre y PIN son obligatorios." });
  const result = db.prepare("INSERT INTO users (name, pin, active, created_at) VALUES (?, ?, 1, ?)").run(name, pin, now());
  audit(user.id, "user.create", "users", result.lastInsertRowid, { name });
  res.status(201).json({ id: result.lastInsertRowid, name, active: 1 });
});

app.get("/api/products", (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, category, price_cents AS priceCents, stock, min_stock AS minStock,
      active, created_at AS createdAt, updated_at AS updatedAt
    FROM products
    ORDER BY active DESC, name
  `).all();
  res.json(rows);
});

app.post("/api/products", (req, res) => {
  const user = requireUser(req);
  const name = String(req.body.name || "").trim();
  const category = String(req.body.category || "cerveza").trim();
  const priceCents = Math.max(0, Math.round(Number(req.body.priceCents || 0)));
  const stock = Math.max(0, Math.round(Number(req.body.stock || 0)));
  const minStock = Math.max(0, Math.round(Number(req.body.minStock || 0)));
  if (!name) return res.status(400).json({ error: "El producto necesita nombre." });
  const ts = now();
  const result = db.prepare(`
    INSERT INTO products (name, category, price_cents, stock, min_stock, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(name, category, priceCents, stock, minStock, ts, ts);
  audit(user.id, "product.create", "products", result.lastInsertRowid, { name, category, priceCents, stock });
  if (stock > 0) {
    addInventoryMovement({
      productId: result.lastInsertRowid,
      type: "initial_stock",
      quantity: stock,
      stockBefore: 0,
      stockAfter: stock,
      userId: user.id,
      note: "Stock inicial",
    });
  }
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put("/api/products/:id", (req, res) => {
  const user = requireUser(req);
  const id = Number(req.params.id);
  const existing = productById(id);
  if (!existing) return res.status(404).json({ error: "Producto no encontrado." });
  const name = String(req.body.name || "").trim();
  const category = String(req.body.category || "cerveza").trim();
  const priceCents = Math.max(0, Math.round(Number(req.body.priceCents || 0)));
  const minStock = Math.max(0, Math.round(Number(req.body.minStock || 0)));
  const active = req.body.active ? 1 : 0;
  if (!name) return res.status(400).json({ error: "El producto necesita nombre." });

  db.prepare(`
    UPDATE products
    SET name = ?, category = ?, price_cents = ?, min_stock = ?, active = ?, updated_at = ?
    WHERE id = ?
  `).run(name, category, priceCents, minStock, active, now(), id);

  if (priceCents !== existing.price_cents) {
    db.prepare("UPDATE order_items SET unit_price_cents = ?, updated_at = ? WHERE product_id = ?").run(priceCents, now(), id);
    audit(user.id, "product.price_update", "products", id, { from: existing.price_cents, to: priceCents, openTablesRecalculated: true });
  }
  audit(user.id, "product.update", "products", id, { name, category, priceCents, minStock, active });
  res.json({ ok: true });
});

app.get("/api/tables", (req, res) => {
  const rows = db.prepare("SELECT * FROM tables WHERE status = 'open' ORDER BY updated_at DESC").all();
  res.json(rows.map(hydrateTable));
});

app.post("/api/tables", (req, res) => {
  const user = requireUser(req);
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "La mesa necesita un nombre." });
  const ts = now();
  const result = db.prepare(`
    INSERT INTO tables (name, status, created_by, created_at, updated_at)
    VALUES (?, 'open', ?, ?, ?)
  `).run(name, user.id, ts, ts);
  audit(user.id, "table.create", "tables", result.lastInsertRowid, { name });
  res.status(201).json(hydrateTable(openTableById(result.lastInsertRowid)));
});

app.post("/api/tables/:id/items", (req, res) => {
  const user = requireUser(req);
  const tableId = Number(req.params.id);
  const productId = Number(req.body.productId);
  const quantity = Math.max(1, Math.round(Number(req.body.quantity || 1)));
  const table = openTableById(tableId);
  if (!table) return res.status(404).json({ error: "Mesa abierta no encontrada." });
  const product = productById(productId);
  if (!product || !product.active) return res.status(404).json({ error: "Producto no disponible." });
  if (product.stock < quantity) return res.status(400).json({ error: `Stock insuficiente. Disponible: ${product.stock}.` });

  db.exec("BEGIN");
  try {
    changeStock(productId, -quantity, { type: "table_add", tableId, userId: user.id });
    const existing = db.prepare("SELECT * FROM order_items WHERE table_id = ? AND product_id = ?").get(tableId, productId);
    if (existing) {
      db.prepare("UPDATE order_items SET quantity = quantity + ?, unit_price_cents = ?, updated_at = ? WHERE id = ?").run(
        quantity,
        product.price_cents,
        now(),
        existing.id,
      );
    } else {
      db.prepare(`
        INSERT INTO order_items (table_id, product_id, quantity, unit_price_cents, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(tableId, productId, quantity, product.price_cents, now(), now());
    }
    db.prepare("UPDATE tables SET updated_at = ? WHERE id = ?").run(now(), tableId);
    audit(user.id, "table.item_add", "tables", tableId, { productId, quantity });
    db.exec("COMMIT");
    res.status(201).json(hydrateTable(openTableById(tableId)));
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
});

app.patch("/api/tables/:tableId/items/:itemId", (req, res) => {
  const user = requireUser(req);
  const tableId = Number(req.params.tableId);
  const itemId = Number(req.params.itemId);
  const quantity = Math.max(0, Math.round(Number(req.body.quantity || 0)));
  const table = openTableById(tableId);
  if (!table) return res.status(404).json({ error: "Mesa abierta no encontrada." });
  const item = db.prepare("SELECT * FROM order_items WHERE id = ? AND table_id = ?").get(itemId, tableId);
  if (!item) return res.status(404).json({ error: "Item no encontrado." });
  const delta = quantity - item.quantity;

  db.exec("BEGIN");
  try {
    if (delta !== 0) {
      changeStock(item.product_id, -delta, {
        type: delta > 0 ? "table_increase" : "table_reduce",
        tableId,
        userId: user.id,
      });
    }
    if (quantity === 0) {
      db.prepare("DELETE FROM order_items WHERE id = ?").run(itemId);
    } else {
      db.prepare("UPDATE order_items SET quantity = ?, updated_at = ? WHERE id = ?").run(quantity, now(), itemId);
    }
    db.prepare("UPDATE tables SET updated_at = ? WHERE id = ?").run(now(), tableId);
    audit(user.id, "table.item_update", "tables", tableId, { itemId, from: item.quantity, to: quantity });
    db.exec("COMMIT");
    res.json(hydrateTable(openTableById(tableId)));
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
});

app.delete("/api/tables/:tableId/items/:itemId", (req, res) => {
  const user = requireUser(req);
  const tableId = Number(req.params.tableId);
  const itemId = Number(req.params.itemId);
  const table = openTableById(tableId);
  if (!table) return res.status(404).json({ error: "Mesa abierta no encontrada." });
  const item = db.prepare("SELECT * FROM order_items WHERE id = ? AND table_id = ?").get(itemId, tableId);
  if (!item) return res.status(404).json({ error: "Item no encontrado." });

  db.exec("BEGIN");
  try {
    changeStock(item.product_id, item.quantity, { type: "table_remove", tableId, userId: user.id });
    db.prepare("DELETE FROM order_items WHERE id = ?").run(itemId);
    db.prepare("UPDATE tables SET updated_at = ? WHERE id = ?").run(now(), tableId);
    audit(user.id, "table.item_delete", "tables", tableId, { itemId, quantity: item.quantity });
    db.exec("COMMIT");
    res.json(hydrateTable(openTableById(tableId)));
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
});

app.post("/api/tables/:id/close", (req, res) => {
  const user = requireUser(req);
  const tableId = Number(req.params.id);
  const table = openTableById(tableId);
  if (!table) return res.status(404).json({ error: "Mesa abierta no encontrada." });
  const hydrated = hydrateTable(table);
  if (hydrated.items.length === 0) return res.status(400).json({ error: "No puedes cerrar una mesa vacia." });
  const cashReceivedCents = Math.max(hydrated.totalCents, Math.round(Number(req.body.cashReceivedCents || hydrated.totalCents)));
  const changeCents = cashReceivedCents - hydrated.totalCents;

  db.exec("BEGIN");
  try {
    const sale = db.prepare(`
      INSERT INTO sales (table_id, table_name, total_cents, payment_method, cash_received_cents, change_cents, closed_by, closed_at)
      VALUES (?, ?, ?, 'cash', ?, ?, ?, ?)
    `).run(tableId, table.name, hydrated.totalCents, cashReceivedCents, changeCents, user.id, now());
    hydrated.items.forEach((item) => {
      db.prepare(`
        INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price_cents, total_cents)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sale.lastInsertRowid, item.productId, item.productName, item.quantity, item.unitPriceCents, item.totalCents);
    });
    db.prepare("UPDATE tables SET status = 'closed', updated_at = ? WHERE id = ?").run(now(), tableId);
    audit(user.id, "sale.close", "sales", sale.lastInsertRowid, { tableId, totalCents: hydrated.totalCents, paymentMethod: "cash" });
    db.exec("COMMIT");
    const row = db.prepare(`
      SELECT s.*, u.name AS closed_by_name
      FROM sales s LEFT JOIN users u ON u.id = s.closed_by
      WHERE s.id = ?
    `).get(sale.lastInsertRowid);
    res.status(201).json(saleWithItems(row));
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
});

app.post("/api/tables/:id/cancel", (req, res) => {
  const user = requireUser(req);
  const tableId = Number(req.params.id);
  const table = openTableById(tableId);
  if (!table) return res.status(404).json({ error: "Mesa abierta no encontrada." });
  const hydrated = hydrateTable(table);

  db.exec("BEGIN");
  try {
    hydrated.items.forEach((item) => {
      changeStock(item.productId, item.quantity, {
        type: "table_cancel",
        tableId,
        userId: user.id,
        note: `Cancelacion de mesa ${table.name}`,
      });
    });
    db.prepare("UPDATE tables SET status = 'canceled', updated_at = ? WHERE id = ?").run(now(), tableId);
    audit(user.id, "table.cancel", "tables", tableId, {
      name: table.name,
      returnedItems: hydrated.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
      })),
    });
    db.exec("COMMIT");
    res.json({ ok: true, returnedItems: hydrated.items.length });
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
});

app.get("/api/inventory", (req, res) => {
  const products = db.prepare(`
    SELECT id, name, category, price_cents AS priceCents, stock, min_stock AS minStock, active
    FROM products ORDER BY active DESC, name
  `).all();
  const movements = db.prepare(`
    SELECT im.id, im.product_id AS productId, p.name AS productName, im.type, im.quantity,
      im.stock_before AS stockBefore, im.stock_after AS stockAfter, im.table_id AS tableId,
      im.sale_id AS saleId, im.user_id AS userId, u.name AS userName, im.note, im.created_at AS createdAt
    FROM inventory_movements im
    JOIN products p ON p.id = im.product_id
    LEFT JOIN users u ON u.id = im.user_id
    ORDER BY im.id DESC LIMIT 200
  `).all();
  res.json({ products, movements });
});

app.post("/api/inventory/adjust", (req, res) => {
  const user = requireUser(req);
  const productId = Number(req.body.productId);
  const delta = Math.round(Number(req.body.delta || 0));
  const note = String(req.body.note || "").trim();
  if (!delta) return res.status(400).json({ error: "El ajuste no puede ser cero." });
  const type = delta > 0 ? "stock_entry" : "stock_adjustment";
  const nextStock = changeStock(productId, delta, { type, userId: user.id, note });
  audit(user.id, "inventory.adjust", "products", productId, { delta, nextStock, note });
  res.json({ ok: true, stock: nextStock });
});

app.get("/api/sales", (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, u.name AS closed_by_name
    FROM sales s LEFT JOIN users u ON u.id = s.closed_by
    ORDER BY s.id DESC LIMIT 300
  `).all();
  res.json(rows.map(saleWithItems));
});

app.get("/api/audit", (req, res) => {
  const rows = db.prepare(`
    SELECT al.id, al.user_id AS userId, u.name AS userName, al.action, al.entity,
      al.entity_id AS entityId, al.details, al.created_at AS createdAt
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.id DESC LIMIT 300
  `).all().map((row) => ({ ...row, details: row.details ? JSON.parse(row.details) : {} }));
  res.json(rows);
});

app.get("/api/exports/inventory.xls", (req, res) => {
  const rows = db.prepare("SELECT name, category, price_cents, stock, min_stock, active FROM products ORDER BY name").all();
  xlsResponse(res, "inventario.xls", ["Producto", "Categoria", "Precio", "Stock", "Stock minimo", "Activo"], rows.map((row) => [
    row.name,
    row.category,
    money(row.price_cents),
    row.stock,
    row.min_stock,
    row.active ? "Si" : "No",
  ]));
});

app.get("/api/exports/sales.xls", (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.table_name, s.total_cents, s.cash_received_cents, s.change_cents, u.name AS user_name, s.closed_at
    FROM sales s LEFT JOIN users u ON u.id = s.closed_by
    ORDER BY s.id DESC
  `).all();
  xlsResponse(res, "ventas.xls", ["Venta", "Mesa", "Total", "Recibido", "Cambio", "Usuario", "Fecha"], rows.map((row) => [
    row.id,
    row.table_name,
    money(row.total_cents),
    money(row.cash_received_cents),
    money(row.change_cents),
    row.user_name || "",
    row.closed_at,
  ]));
});

app.get("/api/exports/inventory.pdf", (req, res) => {
  const rows = db.prepare("SELECT name, category, price_cents, stock, min_stock FROM products ORDER BY name").all();
  const pdf = createPdf("Inventario Bar Papa", rows.map((row) => `${row.name} | ${row.category} | ${money(row.price_cents)} | Stock ${row.stock} | Min ${row.min_stock}`));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="inventario.pdf"');
  res.send(pdf);
});

app.get("/api/exports/sales.pdf", (req, res) => {
  const rows = db.prepare("SELECT id, table_name, total_cents, closed_at FROM sales ORDER BY id DESC").all();
  const pdf = createPdf("Ventas Bar Papa", rows.map((row) => `#${row.id} | ${row.table_name} | ${money(row.total_cents)} | ${row.closed_at}`));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="ventas.pdf"');
  res.send(pdf);
});

app.get("/api/sales/:id/ticket.pdf", (req, res) => {
  const row = db.prepare(`
    SELECT s.*, u.name AS closed_by_name
    FROM sales s LEFT JOIN users u ON u.id = s.closed_by
    WHERE s.id = ?
  `).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Venta no encontrada." });
  const sale = saleWithItems(row);
  const lines = [
    `Ticket interno #${sale.id}`,
    `Mesa: ${sale.tableName}`,
    `Fecha: ${sale.closedAt}`,
    `Usuario: ${sale.closedByName || ""}`,
    "",
    ...sale.items.map((item) => `${item.quantity} x ${item.productName} @ ${money(item.unitPriceCents)} = ${money(item.totalCents)}`),
    "",
    `Total: ${money(sale.totalCents)}`,
    `Efectivo: ${money(sale.cashReceivedCents)}`,
    `Cambio: ${money(sale.changeCents)}`,
  ];
  const pdf = createPdf("Bar Papa", lines);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="ticket-${sale.id}.pdf"`);
  res.send(pdf);
});

const distDir = path.join(rootDir, "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/.*/, (req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Error interno." });
});

app.listen(PORT, () => {
  console.log(`POS API listo en http://127.0.0.1:${PORT}`);
  console.log(`SQLite: ${dbPath}`);
});
