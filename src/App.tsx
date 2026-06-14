import React from "react";

type User = {
  id: number;
  name: string;
  active?: number;
};

type Product = {
  id: number;
  name: string;
  category: string;
  priceCents: number;
  stock: number;
  minStock: number;
  active: number;
};

type OrderItem = {
  id: number;
  tableId: number;
  productId: number;
  productName: string;
  category: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

type OpenTable = {
  id: number;
  name: string;
  status: string;
  totalCents: number;
  items: OrderItem[];
};

type SaleItem = {
  id: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

type Sale = {
  id: number;
  tableName: string;
  totalCents: number;
  cashReceivedCents: number;
  changeCents: number;
  closedByName?: string;
  closedAt: string;
  items: SaleItem[];
};

type InventoryMovement = {
  id: number;
  productName: string;
  type: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  userName?: string;
  note?: string;
  createdAt: string;
};

type AuditEntry = {
  id: number;
  userName?: string;
  action: string;
  entity: string;
  entityId?: number;
  details: Record<string, unknown>;
  createdAt: string;
};

type Tab = "tables" | "products" | "inventory" | "sales" | "audit" | "users";

const emptyProduct = {
  id: 0,
  name: "",
  category: "cerveza",
  price: "0.00",
  stock: "0",
  minStock: "0",
  active: true,
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "tables", label: "Mesas" },
  { id: "products", label: "Productos" },
  { id: "inventory", label: "Inventario" },
  { id: "sales", label: "Ventas" },
  { id: "audit", label: "Auditoria" },
  { id: "users", label: "Usuarios" },
];

function cents(value: string | number) {
  return Math.round(Number(value || 0) * 100);
}

function dollars(value: number) {
  return (value / 100).toFixed(2);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function App() {
  const [user, setUser] = useStoredUser();
  const [pin, setPin] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<Tab>("tables");
  const [products, setProducts] = React.useState<Product[]>([]);
  const [tables, setTables] = React.useState<OpenTable[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [movements, setMovements] = React.useState<InventoryMovement[]>([]);
  const [audit, setAudit] = React.useState<AuditEntry[]>([]);
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const api = React.useCallback(
    async <T,>(url: string, options: RequestInit = {}) => {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(user ? { "x-user-id": String(user.id) } : {}),
          ...(options.headers || {}),
        },
      });
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await response.json() : await response.text();
      if (!response.ok) {
        throw new Error(data?.error || "Operacion no completada.");
      }
      return data as T;
    },
    [user],
  );

  const refresh = React.useCallback(async () => {
    if (!user) return;
    const [nextProducts, nextTables, nextInventory, nextSales, nextUsers, nextAudit] = await Promise.all([
      api<Product[]>("/api/products"),
      api<OpenTable[]>("/api/tables"),
      api<{ products: Product[]; movements: InventoryMovement[] }>("/api/inventory"),
      api<Sale[]>("/api/sales"),
      api<User[]>("/api/users"),
      api<AuditEntry[]>("/api/audit"),
    ]);
    setProducts(nextProducts);
    setTables(nextTables);
    setMovements(nextInventory.movements);
    setSales(nextSales);
    setUsers(nextUsers);
    setAudit(nextAudit);
  }, [api, user]);

  React.useEffect(() => {
    refresh().catch((error) => setMessage(error.message));
  }, [refresh]);

  async function run(action: () => Promise<void>, success?: string) {
    setLoading(true);
    setMessage("");
    try {
      await action();
      await refresh();
      if (success) setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await api<{ user: User }>("/api/session", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      setUser(data.user);
      setPin("");
      setMessage(`Sesion iniciada: ${data.user.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PIN incorrecto.");
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <main className="loginShell">
        <section className="loginPanel">
          <div>
            <p className="eyebrow">Bar Papa POS</p>
            <h1>Caja local</h1>
            <p className="muted">Ingresa con PIN para abrir mesas, vender y controlar inventario.</p>
          </div>
          <form onSubmit={login} className="loginForm">
            <label>
              PIN
              <input value={pin} onChange={(event) => setPin(event.target.value)} autoFocus inputMode="numeric" />
            </label>
            <button disabled={loading || pin.length === 0}>Entrar</button>
            <p className="hint">Primer acceso: Admin / PIN 1234</p>
            {message && <p className="errorText">{message}</p>}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Bar Papa POS</p>
          <h1>Operacion del mini-bar</h1>
        </div>
        <div className="sessionBox">
          <span>{user.name}</span>
          <button
            className="ghost"
            onClick={() => {
              setUser(null);
              setMessage("");
            }}
          >
            Salir
          </button>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map((tab) => (
          <button key={tab.id} className={classNames(activeTab === tab.id && "active")} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>

      {message && <div className={classNames("notice", message.toLowerCase().includes("error") && "bad")}>{message}</div>}

      {activeTab === "tables" && <TablesView api={api} run={run} products={products} tables={tables} loading={loading} />}
      {activeTab === "products" && <ProductsView api={api} run={run} products={products} loading={loading} />}
      {activeTab === "inventory" && <InventoryView api={api} run={run} products={products} movements={movements} loading={loading} />}
      {activeTab === "sales" && <SalesView sales={sales} />}
      {activeTab === "audit" && <AuditView audit={audit} />}
      {activeTab === "users" && <UsersView api={api} run={run} users={users} loading={loading} />}
    </main>
  );
}

function useStoredUser() {
  const [user, setUserState] = React.useState<User | null>(() => {
    const stored = localStorage.getItem("bar-papa-user");
    return stored ? JSON.parse(stored) : null;
  });

  const setUser = React.useCallback((next: User | null) => {
    setUserState(next);
    if (next) localStorage.setItem("bar-papa-user", JSON.stringify(next));
    else localStorage.removeItem("bar-papa-user");
  }, []);

  return [user, setUser] as const;
}

function TablesView({
  api,
  run,
  products,
  tables,
  loading,
}: {
  api: <T>(url: string, options?: RequestInit) => Promise<T>;
  run: (action: () => Promise<void>, success?: string) => Promise<void>;
  products: Product[];
  tables: OpenTable[];
  loading: boolean;
}) {
  const [tableName, setTableName] = React.useState("");
  const available = products.filter((product) => product.active && product.stock > 0);
  const openTotal = tables.reduce((sum, table) => sum + table.totalCents, 0);

  return (
    <section className="workspace">
      <div className="panel compactPanel">
        <h2>Nueva mesa</h2>
        <form
          className="inlineForm"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              async () => {
                await api("/api/tables", { method: "POST", body: JSON.stringify({ name: tableName }) });
                setTableName("");
              },
              "Mesa creada.",
            );
          }}
        >
          <input placeholder="Nombre o referencia" value={tableName} onChange={(event) => setTableName(event.target.value)} />
          <button disabled={loading || !tableName.trim()}>Crear</button>
        </form>
      </div>

      <div className="summaryStrip">
        <Metric label="Mesas abiertas" value={String(tables.length)} />
        <Metric label="En consumo" value={money(openTotal)} />
        <Metric label="Productos activos" value={String(products.filter((product) => product.active).length)} />
      </div>

      <div className="tableGrid">
        {tables.length === 0 && <EmptyState title="No hay mesas abiertas" text="Crea una mesa para iniciar consumos." />}
        {tables.map((table) => (
          <TableCard key={table.id} api={api} run={run} table={table} products={available} loading={loading} />
        ))}
      </div>
    </section>
  );
}

function TableCard({
  api,
  run,
  table,
  products,
  loading,
}: {
  api: <T>(url: string, options?: RequestInit) => Promise<T>;
  run: (action: () => Promise<void>, success?: string) => Promise<void>;
  table: OpenTable;
  products: Product[];
  loading: boolean;
}) {
  const [productId, setProductId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [cash, setCash] = React.useState(dollars(table.totalCents));

  React.useEffect(() => {
    setCash(dollars(table.totalCents));
  }, [table.totalCents]);

  return (
    <article className="tableCard">
      <header>
        <div>
          <h3>{table.name}</h3>
          <span>{table.items.length} lineas</span>
        </div>
        <strong>{money(table.totalCents)}</strong>
      </header>

      <form
        className="addItem"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            async () => {
              await api(`/api/tables/${table.id}/items`, {
                method: "POST",
                body: JSON.stringify({ productId: Number(productId), quantity: Number(quantity) }),
              });
              setQuantity("1");
            },
            "Producto agregado.",
          );
        }}
      >
        <select value={productId} onChange={(event) => setProductId(event.target.value)}>
          <option value="">Producto</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} - {money(product.priceCents)} - stock {product.stock}
            </option>
          ))}
        </select>
        <input min="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        <button disabled={loading || !productId}>Agregar</button>
      </form>

      <div className="itemList">
        {table.items.map((item) => (
          <div key={item.id} className="lineItem">
            <div>
              <strong>{item.productName}</strong>
              <span>{money(item.unitPriceCents)} c/u</span>
            </div>
            <div className="qtyControls">
              <button
                className="square"
                disabled={loading}
                onClick={() =>
                  run(async () => {
                    await api(`/api/tables/${table.id}/items/${item.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ quantity: item.quantity - 1 }),
                    });
                  })
                }
              >
                -
              </button>
              <span>{item.quantity}</span>
              <button
                className="square"
                disabled={loading}
                onClick={() =>
                  run(async () => {
                    await api(`/api/tables/${table.id}/items/${item.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ quantity: item.quantity + 1 }),
                    });
                  })
                }
              >
                +
              </button>
            </div>
            <strong>{money(item.totalCents)}</strong>
          </div>
        ))}
      </div>

      <footer className="closeBox">
        <label>
          Efectivo recibido
          <input type="number" min={dollars(table.totalCents)} step="0.01" value={cash} onChange={(event) => setCash(event.target.value)} />
        </label>
        <button
          className="primary"
          disabled={loading || table.items.length === 0}
          onClick={() =>
            run(
              async () => {
                await api(`/api/tables/${table.id}/close`, {
                  method: "POST",
                  body: JSON.stringify({ cashReceivedCents: cents(cash) }),
                });
              },
              "Cuenta cerrada.",
            )
          }
        >
          Cerrar cuenta
        </button>
      </footer>
    </article>
  );
}

function ProductsView({
  api,
  run,
  products,
  loading,
}: {
  api: <T>(url: string, options?: RequestInit) => Promise<T>;
  run: (action: () => Promise<void>, success?: string) => Promise<void>;
  products: Product[];
  loading: boolean;
}) {
  const [form, setForm] = React.useState(emptyProduct);
  const editing = form.id > 0;

  function edit(product: Product) {
    setForm({
      id: product.id,
      name: product.name,
      category: product.category,
      price: dollars(product.priceCents),
      stock: String(product.stock),
      minStock: String(product.minStock),
      active: Boolean(product.active),
    });
  }

  return (
    <section className="workspace twoColumn">
      <div className="panel">
        <h2>{editing ? "Editar producto" : "Nuevo producto"}</h2>
        <form
          className="stackForm"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              async () => {
                const payload = {
                  name: form.name,
                  category: form.category || "cerveza",
                  priceCents: cents(form.price),
                  stock: Number(form.stock || 0),
                  minStock: Number(form.minStock || 0),
                  active: form.active,
                };
                if (editing) {
                  await api(`/api/products/${form.id}`, { method: "PUT", body: JSON.stringify(payload) });
                } else {
                  await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
                }
                setForm(emptyProduct);
              },
              editing ? "Producto actualizado." : "Producto creado.",
            );
          }}
        >
          <label>
            Nombre
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            Categoria
            <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
          </label>
          <div className="formRow">
            <label>
              Precio USD
              <input type="number" step="0.01" min="0" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
            </label>
            <label>
              Stock minimo
              <input type="number" min="0" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: event.target.value })} />
            </label>
          </div>
          {!editing && (
            <label>
              Stock inicial
              <input type="number" min="0" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} />
            </label>
          )}
          <label className="checkLine">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Activo para venta
          </label>
          <div className="buttonRow">
            <button disabled={loading || !form.name.trim()}>{editing ? "Guardar" : "Crear"}</button>
            {editing && (
              <button type="button" className="ghost" onClick={() => setForm(emptyProduct)}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="dataTableWrap">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoria</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className={product.stock <= product.minStock ? "warnRow" : undefined}>
                <td>{product.name}</td>
                <td>{product.category}</td>
                <td>{money(product.priceCents)}</td>
                <td>{product.stock}</td>
                <td>{product.active ? "Activo" : "Inactivo"}</td>
                <td>
                  <button className="ghost smallButton" onClick={() => edit(product)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InventoryView({
  api,
  run,
  products,
  movements,
  loading,
}: {
  api: <T>(url: string, options?: RequestInit) => Promise<T>;
  run: (action: () => Promise<void>, success?: string) => Promise<void>;
  products: Product[];
  movements: InventoryMovement[];
  loading: boolean;
}) {
  const [productId, setProductId] = React.useState("");
  const [delta, setDelta] = React.useState("1");
  const [note, setNote] = React.useState("");

  return (
    <section className="workspace">
      <div className="toolbarPanel">
        <form
          className="inlineForm"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              async () => {
                await api("/api/inventory/adjust", {
                  method: "POST",
                  body: JSON.stringify({ productId: Number(productId), delta: Number(delta), note }),
                });
                setDelta("1");
                setNote("");
              },
              "Inventario ajustado.",
            );
          }}
        >
          <select value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">Producto</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} - stock {product.stock}
              </option>
            ))}
          </select>
          <input type="number" value={delta} onChange={(event) => setDelta(event.target.value)} />
          <input placeholder="Nota" value={note} onChange={(event) => setNote(event.target.value)} />
          <button disabled={loading || !productId || Number(delta) === 0}>Ajustar</button>
        </form>
        <div className="exportButtons">
          <a href="/api/exports/inventory.xls">Excel</a>
          <a href="/api/exports/inventory.pdf">PDF</a>
        </div>
      </div>

      <div className="inventoryGrid">
        {products.map((product) => (
          <article key={product.id} className={classNames("stockTile", product.stock <= product.minStock && "low")}>
            <span>{product.category}</span>
            <h3>{product.name}</h3>
            <strong>{product.stock}</strong>
            <small>Minimo {product.minStock} · {money(product.priceCents)}</small>
          </article>
        ))}
      </div>

      <div className="dataTableWrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Cambio</th>
              <th>Stock</th>
              <th>Usuario</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id}>
                <td>{dateTime(movement.createdAt)}</td>
                <td>{movement.productName}</td>
                <td>{movement.type}</td>
                <td>{movement.quantity}</td>
                <td>
                  {movement.stockBefore} {"->"} {movement.stockAfter}
                </td>
                <td>{movement.userName || ""}</td>
                <td>{movement.note || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SalesView({ sales }: { sales: Sale[] }) {
  const total = sales.reduce((sum, sale) => sum + sale.totalCents, 0);
  return (
    <section className="workspace">
      <div className="toolbarPanel">
        <div className="summaryStrip inlineSummary">
          <Metric label="Ventas" value={String(sales.length)} />
          <Metric label="Total historico" value={money(total)} />
        </div>
        <div className="exportButtons">
          <a href="/api/exports/sales.xls">Excel</a>
          <a href="/api/exports/sales.pdf">PDF</a>
        </div>
      </div>
      <div className="salesList">
        {sales.length === 0 && <EmptyState title="Sin ventas cerradas" text="Las cuentas cerradas apareceran aqui." />}
        {sales.map((sale) => (
          <article key={sale.id} className="saleRow">
            <header>
              <div>
                <h3>Venta #{sale.id} · {sale.tableName}</h3>
                <span>{dateTime(sale.closedAt)} · {sale.closedByName || "Usuario"}</span>
              </div>
              <strong>{money(sale.totalCents)}</strong>
            </header>
            <div className="saleItems">
              {sale.items.map((item) => (
                <span key={item.id}>
                  {item.quantity}x {item.productName} ({money(item.totalCents)})
                </span>
              ))}
            </div>
            <footer>
              <span>Efectivo {money(sale.cashReceivedCents)} · Cambio {money(sale.changeCents)}</span>
              <a href={`/api/sales/${sale.id}/ticket.pdf`}>Ticket PDF</a>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function AuditView({ audit }: { audit: AuditEntry[] }) {
  return (
    <section className="workspace">
      <div className="dataTableWrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Accion</th>
              <th>Entidad</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((entry) => (
              <tr key={entry.id}>
                <td>{dateTime(entry.createdAt)}</td>
                <td>{entry.userName || ""}</td>
                <td>{entry.action}</td>
                <td>
                  {entry.entity} {entry.entityId || ""}
                </td>
                <td>{JSON.stringify(entry.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UsersView({
  api,
  run,
  users,
  loading,
}: {
  api: <T>(url: string, options?: RequestInit) => Promise<T>;
  run: (action: () => Promise<void>, success?: string) => Promise<void>;
  users: User[];
  loading: boolean;
}) {
  const [name, setName] = React.useState("");
  const [pin, setPin] = React.useState("");

  return (
    <section className="workspace twoColumn narrowLeft">
      <div className="panel">
        <h2>Nuevo usuario</h2>
        <form
          className="stackForm"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              async () => {
                await api("/api/users", { method: "POST", body: JSON.stringify({ name, pin }) });
                setName("");
                setPin("");
              },
              "Usuario creado.",
            );
          }}
        >
          <label>
            Nombre
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            PIN
            <input inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} />
          </label>
          <button disabled={loading || !name.trim() || !pin.trim()}>Crear</button>
        </form>
      </div>

      <div className="dataTableWrap">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {users.map((nextUser) => (
              <tr key={nextUser.id}>
                <td>{nextUser.name}</td>
                <td>{nextUser.active ? "Activo" : "Inactivo"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="emptyState">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
