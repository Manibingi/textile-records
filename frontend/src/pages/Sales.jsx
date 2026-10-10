import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, qs } from "../api";
import {
  PageHeader, Tabs, Card, Field, Input, NumInput, DateInput, Select, Btn, Table, ExportBar, Choice, Stat,
  DateRange, rangeFor, useData, useAction, useTab, confirmDelete, ErrorBox, Loading, Empty,
} from "../ui";
import { rs, num, dt, today, n, PAY_MODES } from "../format";
import Ledger from "../Ledger";

export default function Sales() {
  const [tab, setTab, sp] = useTab("bill");
  return (
    <div className="page">
      <PageHeader icon="🧾" step={8} title="Sales & customers"
        help="Make wholesale bills (stock goes down automatically) and note money received from customers." />
      <Tabs value={tab} onChange={setTab} tabs={[["bill", "+ New bill"], ["list", "Bills"], ["receive", "Money received"], ["customers", "Customers"]]} />
      {tab === "bill" && <BillForm onAddCustomer={() => setTab("customers")} />}
      {tab === "list" && <BillList />}
      {tab === "receive" && <Receive initialCustomer={sp.get("customer") || ""} />}
      {tab === "customers" && <Customers />}
    </div>
  );
}

const itemKey = (p, c) => `${p}|||${c}`;
const blankItem = () => ({ stock: "", quantity: "", rate: "" });

function BillForm({ onAddCustomer }) {
  const nav = useNavigate();
  const { data: customers } = useData("/customers");
  const { data: stock } = useData("/finished-stock");
  const [f, setF] = useState({ date: today(), customer_id: "", notes: "" });
  const [items, setItems] = useState([blankItem()]);
  const [run, busy] = useAction();
  const ready = (stock || []).filter((s) => s.in_stock > 0);
  const setItem = (i, k, v) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = items.reduce((s, it) => s + n(it.quantity) * n(it.rate), 0);
  const pieces = items.reduce((s, it) => s + n(it.quantity), 0);

  const save = async () => {
    const lines = items.filter((it) => it.stock && it.quantity !== "").map((it) => {
      const [product, color] = it.stock.split("|||");
      return { product, color, quantity: n(it.quantity), rate: n(it.rate) };
    });
    if (!f.customer_id) return run(() => Promise.reject(new Error("Please choose the customer.")));
    if (!lines.length) return run(() => Promise.reject(new Error("Add at least one item with quantity.")));
    const out = await run(() => api.post("/sales", { ...f, customer_id: Number(f.customer_id), items: lines }), (s) => `Bill ${s.invoice_no} saved · ${rs(s.total)}`);
    if (out) nav(`/sales/bill/${out.id}`);
  };

  return (
    <Card title="New wholesale bill">
      <div className="form">
        <Field label="Customer" required hint={<button type="button" className="link" onClick={onAddCustomer}>+ Add a new customer</button>}>
          <Select value={f.customer_id} onChange={(v) => setF((x) => ({ ...x, customer_id: v }))}
            options={(customers || []).map((c) => ({ value: c.id, label: `${c.name}${c.balance > 0 ? ` (owes ${rs(c.balance)})` : ""}` }))} />
        </Field>
        <Field label="Bill date" required><DateInput value={f.date} onChange={(v) => setF((x) => ({ ...x, date: v }))} /></Field>
      </div>

      <div className="field-label">Items</div>
      {stock && !ready.length && <Empty>No packed stock to sell. <Link to="/cutting?tab=cut">Cut & pack a lot</Link> first.</Empty>}
      <div className="bill-items">
        {items.map((it, i) => {
          const s = ready.find((x) => itemKey(x.product, x.color) === it.stock);
          return (
            <div key={i} className="bill-item">
              <Field label="Product & colour">
                <Select value={it.stock} onChange={(v) => setItem(i, "stock", v)}
                  options={ready.map((x) => ({ value: itemKey(x.product, x.color), label: `${x.product} · ${x.color || "—"} (${x.in_stock} ready)` }))} />
              </Field>
              <Field label="Pieces" hint={s && n(it.quantity) > s.in_stock ? `⚠ Only ${s.in_stock} ready` : ""}>
                <NumInput value={it.quantity} onChange={(v) => setItem(i, "quantity", v)} step="1" />
              </Field>
              <Field label="Rate per piece (₹)"><NumInput value={it.rate} onChange={(v) => setItem(i, "rate", v)} /></Field>
              <div className="bill-amount">{rs(n(it.quantity) * n(it.rate))}</div>
              {items.length > 1 && <button type="button" className="x-btn" aria-label="Remove item" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>✕</button>}
            </div>
          );
        })}
      </div>
      <Btn kind="ghost" onClick={() => setItems((xs) => [...xs, blankItem()])}>+ Add another item</Btn>
      <div className="form" style={{ marginTop: 12 }}>
        <Field label="Notes" wide><Input value={f.notes} onChange={(v) => setF((x) => ({ ...x, notes: v }))} placeholder="Optional, e.g. transport details" /></Field>
      </div>
      <div className="calc green">
        <div className="calc-label">Bill total</div>
        <div className="calc-formula">{pieces} pieces</div>
        <div className="calc-result">{rs(total)}</div>
      </div>
      <div className="form-actions"><Btn big onClick={save} disabled={busy}>✓ Save bill & print</Btn></div>
    </Card>
  );
}

function BillList() {
  const [range, setRange] = useState(rangeFor("month"));
  const { data, error, reload } = useData(`/sales${qs(range)}`);
  const [run] = useAction();
  const del = async (s) => {
    if (!confirmDelete(`bill ${s.invoice_no} (${s.customer_name}, ${rs(s.total)}). The pieces will go back into stock`)) return;
    if (await run(() => api.del(`/sales/${s.id}`), `Bill ${s.invoice_no} deleted`)) reload();
  };
  const cols = [
    { label: "Bill no", key: "invoice_no", render: (r) => <Link className="link" to={`/sales/bill/${r.id}`}><b>{r.invoice_no}</b></Link> },
    { label: "Date", key: "date", render: (r) => dt(r.date), csv: (r) => dt(r.date) },
    { label: "Customer", key: "customer_name" },
    { label: "Items", render: (r) => r.items.map((i) => `${i.product} ${i.color} × ${i.quantity}`).join(", "), csv: (r) => r.items.map((i) => `${i.product} ${i.color} x ${i.quantity}`).join("; ") },
    { label: "Pieces", key: "pieces", align: "right" },
    { label: "Total", key: "total", render: (r) => <b>{rs(r.total)}</b>, align: "right" },
    { label: "", noExport: true, render: (r) => <div className="row-actions"><Link className="btn ghost" to={`/sales/bill/${r.id}`}>🖨 Open</Link><Btn kind="danger-ghost" onClick={() => del(r)}>Delete</Btn></div> },
  ];
  const t = (data || []).reduce((a, r) => ({ p: a.p + r.pieces, s: a.s + r.total }), { p: 0, s: 0 });
  return (
    <Card title="Bills" actions={<ExportBar rows={data} columns={cols} filename="sales-bills" />}>
      <DateRange value={range} onChange={setRange} />
      <ErrorBox msg={error} />
      <Table rows={data} columns={cols} empty="No bills in these dates." footer={["Total", "", "", "", t.p, <b key="t">{rs(t.s)}</b>, ""]} />
    </Card>
  );
}

function Receive({ initialCustomer }) {
  const { data: customers, reload: reloadCustomers } = useData("/customers");
  const { data: list, reload } = useData("/customer-payments");
  const [f, setF] = useState({ date: today(), customer_id: initialCustomer, amount: "", mode: "Cash", notes: "" });
  const [run, busy] = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const c = (customers || []).find((x) => String(x.id) === String(f.customer_id));

  const save = async () => {
    const out = await run(() => api.post("/customer-payments", { ...f, customer_id: Number(f.customer_id) || 0, amount: f.amount === "" ? undefined : n(f.amount) }),
      (p) => `Received ${rs(p.amount)} from ${p.customer_name}`);
    if (out) { setF((x) => ({ ...x, amount: "", notes: "" })); reload(); reloadCustomers(); }
  };
  const del = async (p) => {
    if (!confirmDelete(`this entry (${rs(p.amount)} from ${p.customer_name})`)) return;
    if (await run(() => api.del(`/customer-payments/${p.id}`), "Entry deleted")) { reload(); reloadCustomers(); }
  };

  return (
    <>
      <Card title="Money received from a customer">
        <div className="form">
          <Field label="Customer" required>
            <Select value={f.customer_id} onChange={set("customer_id")} options={(customers || []).map((x) => ({ value: x.id, label: x.name }))} />
          </Field>
          <Field label="Date" required><DateInput value={f.date} onChange={set("date")} /></Field>
        </div>
        {c && <div className="stats"><Stat label={`${c.name} owes`} value={rs(c.balance)} tone={c.balance > 0 ? "red" : "green"} /></div>}
        <div className="form">
          <Field label="Amount received (₹)" required><NumInput value={f.amount} onChange={set("amount")} /></Field>
          <Field label="Received by"><Choice value={f.mode} onChange={set("mode")} options={PAY_MODES} /></Field>
          <Field label="Notes" wide><Input value={f.notes} onChange={set("notes")} placeholder="Optional, e.g. cheque number" /></Field>
        </div>
        <div className="form-actions"><Btn big onClick={save} disabled={busy}>✓ Save</Btn></div>
      </Card>
      <Card title="Recent money received">
        <Table rows={list?.slice(0, 50)} empty="Nothing received yet." columns={[
          { label: "Date", render: (r) => dt(r.date) },
          { label: "Customer", key: "customer_name" },
          { label: "Amount", render: (r) => <b>{rs(r.amount)}</b>, align: "right" },
          { label: "By", key: "mode" },
          { label: "Notes", key: "notes" },
          { label: "", render: (r) => <Btn kind="danger-ghost" onClick={() => del(r)}>Delete</Btn> },
        ]} />
      </Card>
    </>
  );
}

const blankCustomer = { name: "", phone: "", address: "", gstin: "", opening_balance: "" };

function CustomerForm({ initial, id, onDone, onCancel }) {
  const [f, setF] = useState(initial);
  const [run, busy] = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const body = { ...f, opening_balance: n(f.opening_balance) };
    const out = await run(() => (id ? api.put(`/customers/${id}`, body) : api.post("/customers", body)), id ? "Customer updated" : `Customer ${f.name} added`);
    if (out) onDone(out);
  };
  return (
    <>
      <div className="form">
        <Field label="Customer / shop name" required><Input value={f.name} onChange={set("name")} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
        <Field label="GST number"><Input value={f.gstin} onChange={set("gstin")} /></Field>
        <Field label="Amount they already owe (₹)" hint="From your old book, on the day you start">
          <input className="inp num" type="number" step="any" value={f.opening_balance} onChange={(e) => set("opening_balance")(e.target.value)} onWheel={(e) => e.target.blur()} />
        </Field>
        <Field label="Address" wide><Input value={f.address} onChange={set("address")} /></Field>
      </div>
      <div className="form-actions">
        <Btn big onClick={save} disabled={busy}>✓ {id ? "Save changes" : "Add customer"}</Btn>
        {onCancel && <Btn kind="ghost" onClick={onCancel}>Cancel</Btn>}
      </div>
    </>
  );
}

function Customers() {
  const { data, error, reload } = useData("/customers");
  const [key, setKey] = useState(0);
  const cols = [
    { label: "Name", key: "name", render: (r) => <Link className="link" to={`/customers/${r.id}`}><b>{r.name}</b></Link> },
    { label: "Phone", key: "phone" },
    { label: "Total billed", key: "billed", render: (r) => rs(r.billed), align: "right" },
    { label: "Received", key: "received", render: (r) => rs(r.received), align: "right" },
    { label: "Still to receive", key: "balance", render: (r) => <b className={r.balance > 0 ? "neg" : "pos"}>{rs(r.balance)}</b>, align: "right" },
  ];
  const total = (data || []).reduce((s, r) => s + Math.max(r.balance, 0), 0);
  return (
    <>
      <Card title="Add a customer">
        <CustomerForm key={key} initial={blankCustomer} onDone={() => { setKey((k) => k + 1); reload(); }} />
      </Card>
      <Card title="All customers" actions={<ExportBar rows={data} columns={cols} filename="customers" />}>
        <ErrorBox msg={error} />
        <Table rows={data} columns={cols} empty="No customers yet." footer={["Total", "", "", "", <b key="t">{rs(total)}</b>]} />
      </Card>
    </>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: c, error, reload } = useData(`/customers/${id}`);
  const { data: ledger, reload: reloadLedger } = useData(`/customers/${id}/ledger`);
  const [editing, setEditing] = useState(false);
  const [run] = useAction();
  if (error) return <div className="page"><ErrorBox msg={error} /></div>;
  if (!c) return <div className="page"><Loading /></div>;
  const del = async () => {
    if (!confirmDelete(`customer ${c.name}`)) return;
    if (await run(() => api.del(`/customers/${c.id}`), "Customer deleted")) nav("/sales?tab=customers");
  };
  return (
    <div className="page">
      <Link className="back no-print" to="/sales?tab=customers">← All customers</Link>
      <PageHeader icon="🏪" title={c.name} help={[c.phone, c.address, c.gstin && `GST ${c.gstin}`].filter(Boolean).join(" · ")}>
        <Btn kind="ghost" onClick={() => setEditing((e) => !e)}>✎ Edit</Btn>
        <Link className="btn primary" to={`/sales?tab=receive&customer=${c.id}`}>₹ Money received</Link>
      </PageHeader>
      {editing && (
        <Card title="Edit customer">
          <CustomerForm id={c.id} initial={{ name: c.name, phone: c.phone, address: c.address, gstin: c.gstin, opening_balance: c.opening_balance }}
            onCancel={() => setEditing(false)} onDone={() => { setEditing(false); reload(); reloadLedger(); }} />
          <div className="danger-zone"><Btn kind="danger-ghost" onClick={del}>Delete this customer</Btn></div>
        </Card>
      )}
      <div className="stats">
        <Stat label="Still to receive" value={rs(c.balance)} tone={c.balance > 0 ? "red" : "green"} />
        <Stat label="Total billed" value={rs(c.billed)} />
        <Stat label="Total received" value={rs(c.received)} />
      </div>
      <Card title="Account (bills and money received)">
        <Ledger data={ledger} plusLabel="Billed" minusLabel="Received" balanceLabel="To receive" filename={`customer-${c.name}`} />
      </Card>
    </div>
  );
}

export function Invoice({ settings }) {
  const { id } = useParams();
  const { data: s, error } = useData(`/sales/${id}`);
  if (error) return <div className="page"><ErrorBox msg={error} /></div>;
  if (!s) return <div className="page"><Loading /></div>;
  return (
    <div className="page">
      <div className="no-print doc-actions">
        <Link className="back" to="/sales?tab=list">← Bills</Link>
        <Btn big onClick={() => window.print()}>🖨 Print bill</Btn>
      </div>
      <div className="doc">
        <div className="doc-head">
          <div>
            <div className="doc-biz">{settings?.business_name || "Textile Records"}</div>
            <div className="muted">{settings?.address}{settings?.phone && ` · ${settings.phone}`}</div>
            {settings?.gstin && <div className="muted">GSTIN: {settings.gstin}</div>}
          </div>
          <div className="doc-title">Bill<div className="muted small">{s.invoice_no} · {dt(s.date)}</div></div>
        </div>
        <div className="doc-meta">
          <div><span>Bill to</span><b>{s.customer.name}</b></div>
          {s.customer.phone && <div><span>Phone</span><b>{s.customer.phone}</b></div>}
          {s.customer.address && <div><span>Address</span><b>{s.customer.address}</b></div>}
          {s.customer.gstin && <div><span>GSTIN</span><b>{s.customer.gstin}</b></div>}
        </div>
        <Table rows={s.items.map((x, i) => ({ ...x, no: i + 1 }))} rowKey="no" columns={[
          { label: "#", key: "no" },
          { label: "Item", render: (r) => `${r.product} — ${r.color}` },
          { label: "Pieces", key: "quantity", align: "right" },
          { label: "Rate", render: (r) => rs(r.rate), align: "right" },
          { label: "Amount", render: (r) => rs(r.amount), align: "right" },
        ]} footer={["", "Total", num(s.pieces, 0), "", <b key="t">{rs(s.total)}</b>]} />
        {s.notes && <p>Notes: {s.notes}</p>}
        <div className="signs"><div>Customer signature</div><div>For {settings?.business_name || "the business"}</div></div>
      </div>
    </div>
  );
}
