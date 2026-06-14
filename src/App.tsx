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

type SalePayment = {
  id?: number;
  label: string;
  amountCents: number;
  receivedCents?: number;
  changeCents?: number;
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
  payments: SalePayment[];
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
  const parsed = Number(String(value || 0).replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function dollars(value: number) {
  return (value / 100).toFixed(2);
}

function productUnits(value: string | number) {
  const parsed = Number(String(value || 0).replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
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

  const lowStockProducts = products
    .filter((product) => product.active && product.minStock > 0 && product.stock <= product.minStock)
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));

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

      {lowStockProducts.length > 0 && (
        <LowStockAlert products={lowStockProducts} onOpenInventory={() => setActiveTab("inventory")} />
      )}

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

function LowStockAlert({ products, onOpenInventory }: { products: Product[]; onOpenInventory: () => void }) {
  const visibleProducts = products.slice(0, 3);
  const extraCount = products.length - visibleProducts.length;

  return (
    <section className="stockAlert" role="status" aria-live="polite">
      <div>
        <strong>Alerta de stock minimo</strong>
        <p>
          {visibleProducts.map((product) => `${product.name}: ${product.stock}/${product.minStock}`).join(" · ")}
          {extraCount > 0 ? ` · ${extraCount} mas` : ""}
        </p>
      </div>
      <button onClick={onOpenInventory}>Revisar inventario</button>
    </section>
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
  const openProductUnits = tables.reduce(
    (sum, table) => sum + table.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );

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
        <Metric label="Productos en mesas" value={String(openProductUnits)} />
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
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [cash, setCash] = React.useState(dollars(table.totalCents));
  const [splitPayment, setSplitPayment] = React.useState(false);
  const [paymentParts, setPaymentParts] = React.useState<Array<{ label: string; units: string; amount: string; received: string }>>([
    { label: "Parte 1", units: "", amount: "", received: "" },
  ]);
  const totalProductUnits = table.items.reduce((sum, item) => sum + item.quantity, 0);
  const averageProductCents = totalProductUnits > 0 ? Math.round(table.totalCents / totalProductUnits) : 0;
  const fullCashCents = cents(cash);
  const splitChargedCents = paymentParts.reduce((sum, payment) => sum + cents(payment.amount), 0);
  const splitReceivedCents = paymentParts.reduce((sum, payment) => sum + cents(payment.received), 0);
  const receivedCents = splitPayment ? splitReceivedCents : fullCashCents;
  const changeCents = Math.max(0, fullCashCents - table.totalCents);
  const missingCents = splitPayment ? Math.max(0, table.totalCents - splitChargedCents) : Math.max(0, table.totalCents - fullCashCents);
  const overchargedCents = splitPayment ? Math.max(0, splitChargedCents - table.totalCents) : 0;
  const partWithMissingCash = splitPayment && paymentParts.some((payment) => cents(payment.amount) > 0 && cents(payment.received) < cents(payment.amount));
  const assignedUnits = paymentParts.reduce((sum, payment) => sum + productUnits(payment.units), 0);
  const unitsOverAssigned = assignedUnits > totalProductUnits;
  const paymentReady = missingCents === 0 && overchargedCents === 0 && !partWithMissingCash && !unitsOverAssigned;
  const remainingUnits = Math.max(0, totalProductUnits - assignedUnits);

  React.useEffect(() => {
    setCash(dollars(table.totalCents));
    setPaymentParts([{ label: "Parte 1", units: "", amount: "", received: "" }]);
  }, [table.totalCents]);

  function amountForUnits(units: number) {
    if (units <= 0 || totalProductUnits === 0) return "";
    if (units >= totalProductUnits) return dollars(table.totalCents);
    return dollars(Math.round((table.totalCents / totalProductUnits) * units));
  }

  function addPaymentPart(amount = "", units = "") {
    setPaymentParts((parts) => [...parts, { label: `Parte ${parts.length + 1}`, units, amount, received: amount }]);
  }

  function updatePaymentPart(index: number, field: "label" | "units" | "amount" | "received", value: string) {
    setPaymentParts((parts) =>
      parts.map((part, partIndex) => {
        if (partIndex !== index) return part;
        if (field === "units") {
          const usedByOtherParts = parts.reduce((sum, nextPart, nextIndex) => (nextIndex === index ? sum : sum + productUnits(nextPart.units)), 0);
          const maxForThisPart = Math.max(0, totalProductUnits - usedByOtherParts);
          const units = Math.min(productUnits(value), maxForThisPart);
          const nextUnits = units > 0 ? String(units) : "";
          const amount = amountForUnits(units);
          const shouldUpdateReceived = !part.received || cents(part.received) === cents(part.amount);
          return { ...part, units: nextUnits, amount, received: shouldUpdateReceived ? amount : part.received };
        }
        if (field === "amount") return { ...part, units: "", amount: value };
        return { ...part, [field]: value };
      }),
    );
  }

  function removePaymentPart(index: number) {
    setPaymentParts((parts) => {
      const next = parts.filter((_, partIndex) => partIndex !== index);
      return next.length > 0 ? next : [{ label: "Parte 1", units: "", amount: "", received: "" }];
    });
  }

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
        <div className="tableActions">
          <button
            className="danger"
            disabled={loading}
            onClick={() => {
              if (!window.confirm(`Cancelar la mesa ${table.name} y devolver sus productos al inventario?`)) return;
              run(
                async () => {
                  await api(`/api/tables/${table.id}/cancel`, { method: "POST" });
                },
                "Mesa cancelada e inventario devuelto.",
              );
            }}
          >
            Cancelar mesa
          </button>
          <button
            className="primary"
            disabled={loading || table.items.length === 0}
            onClick={() => setPaymentOpen(true)}
          >
            Cerrar cuenta
          </button>
        </div>
      </footer>

      {paymentOpen && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby={`payment-title-${table.id}`}>
          <section className="paymentModal">
            <header>
              <div>
                <p className="eyebrow">Cobro en efectivo</p>
                <h2 id={`payment-title-${table.id}`}>{table.name}</h2>
              </div>
              <button className="ghost square" onClick={() => setPaymentOpen(false)} aria-label="Cerrar cobro">
                x
              </button>
            </header>

            <div className="paymentTotals">
              <Metric label="Total a cobrar" value={money(table.totalCents)} />
              {splitPayment ? (
                <>
                  <Metric label="Cubierto por partes" value={money(splitChargedCents)} />
                  <Metric
                    label={missingCents > 0 ? "Falta por asignar" : overchargedCents > 0 ? "Exceso asignado" : "Mesa lista"}
                    value={missingCents > 0 ? money(missingCents) : overchargedCents > 0 ? money(overchargedCents) : "OK"}
                  />
                </>
              ) : (
                <>
                  <Metric label="Efectivo recibido" value={money(receivedCents)} />
                  <Metric label={missingCents > 0 ? "Faltante" : "Cambio"} value={money(missingCents > 0 ? missingCents : changeCents)} />
                </>
              )}
            </div>

            <div className="paymentMode">
              <button className={!splitPayment ? "active" : undefined} onClick={() => setSplitPayment(false)}>
                Pago completo
              </button>
              <button className={splitPayment ? "active" : undefined} onClick={() => setSplitPayment(true)}>
                Por partes
              </button>
            </div>

            {!splitPayment ? (
              <label>
                Efectivo recibido
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step="0.01"
                  value={cash}
                  onChange={(event) => setCash(event.target.value)}
                />
              </label>
            ) : (
              <div className="splitPayments">
                <div className="splitHint">
                  <span>Asigna el total de la mesa en partes. El cambio se calcula dentro de cada cobro.</span>
                  <span>
                    Productos en mesa: <strong>{totalProductUnits}</strong> · Valor por producto: <strong>{money(averageProductCents)}</strong>
                  </span>
                  <span>
                    Productos asignados: <strong>{assignedUnits}/{totalProductUnits}</strong>
                  </span>
                </div>
                <div className="splitPaymentHeader">
                  <span>Parte</span>
                  <span>Productos</span>
                  <span>Cobrar</span>
                  <span>Recibido</span>
                  <span>Cambio</span>
                  <span></span>
                </div>
                {paymentParts.map((payment, index) => (
                  <div className="splitPaymentRow" key={`${payment.label}-${index}`}>
                    <input
                      aria-label={`Nombre parte ${index + 1}`}
                      value={payment.label}
                      onChange={(event) => updatePaymentPart(index, "label", event.target.value)}
                    />
                    <input
                      aria-label={`Productos parte ${index + 1}`}
                      type="number"
                      min="0"
                      max={totalProductUnits - (assignedUnits - productUnits(payment.units))}
                      step="1"
                      placeholder="Productos"
                      value={payment.units}
                      onChange={(event) => updatePaymentPart(index, "units", event.target.value)}
                    />
                    <input
                      aria-label={`Monto a cobrar parte ${index + 1}`}
                      autoFocus={index === 0}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Cobrar"
                      value={payment.amount}
                      onChange={(event) => updatePaymentPart(index, "amount", event.target.value)}
                    />
                    <input
                      aria-label={`Efectivo recibido parte ${index + 1}`}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Recibido"
                      value={payment.received}
                      onChange={(event) => updatePaymentPart(index, "received", event.target.value)}
                    />
                    <strong className={classNames("partChange", cents(payment.received) < cents(payment.amount) && "missing")}>
                      {cents(payment.received) < cents(payment.amount)
                        ? `Falta ${money(cents(payment.amount) - cents(payment.received))}`
                        : `Cambio ${money(cents(payment.received) - cents(payment.amount))}`}
                    </strong>
                    <button className="ghost square" onClick={() => removePaymentPart(index)} aria-label={`Quitar parte ${index + 1}`}>
                      x
                    </button>
                  </div>
                ))}
                <div className="buttonRow">
                  <button className="ghost" onClick={() => addPaymentPart()}>
                    Agregar parte
                  </button>
                  <button
                    className="ghost"
                    onClick={() => addPaymentPart(dollars(missingCents), remainingUnits > 0 ? String(remainingUnits) : "")}
                    disabled={missingCents === 0}
                  >
                    Agregar resto
                  </button>
                </div>
              </div>
            )}

            <div className="paymentItems">
              {table.items.map((item) => (
                <span key={item.id}>
                  {item.quantity}x {item.productName} · {money(item.totalCents)}
                </span>
              ))}
            </div>

            <footer>
              <button className="ghost" onClick={() => setPaymentOpen(false)}>
                Volver
              </button>
              <button
                className="primary"
                disabled={loading || !paymentReady}
                onClick={() =>
                  run(
                    async () => {
                      await api(`/api/tables/${table.id}/close`, {
                        method: "POST",
                        body: JSON.stringify(
                          splitPayment
                            ? {
                                payments: paymentParts.map((payment, index) => ({
                                  label: payment.label.trim() || `Parte ${index + 1}`,
                                  amountCents: cents(payment.amount),
                                  receivedCents: cents(payment.received),
                                })),
                              }
                            : { cashReceivedCents: fullCashCents },
                        ),
                      });
                      setPaymentOpen(false);
                    },
                    "Cuenta cerrada.",
                  )
                }
              >
                Confirmar cobro
              </button>
            </footer>
          </section>
        </div>
      )}
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
          <label>
            {editing ? "Stock actual" : "Stock inicial"}
            <input type="number" min="0" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} />
          </label>
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
              <span>
                Efectivo {money(sale.cashReceivedCents)} · Cambio {money(sale.changeCents)}
                {sale.payments?.length > 1
                  ? ` · ${sale.payments
                      .map(
                        (payment) =>
                          `${payment.label}: cobra ${money(payment.amountCents)}, recibe ${money(payment.receivedCents || payment.amountCents)}, cambio ${money(payment.changeCents || 0)}`,
                      )
                      .join(" · ")}`
                  : ""}
              </span>
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
