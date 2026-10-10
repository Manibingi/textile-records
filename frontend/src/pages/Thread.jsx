import { useState } from "react";
import { api, qs } from "../api";
import {
  PageHeader, Tabs, Card, Field, Input, NumInput, DateInput, Select, CalcBox, Btn, Table, ExportBar,
  DateRange, rangeFor, useData, useAction, useTab, confirmDelete, ErrorBox,
} from "../ui";
import { rs, kg, num, dt, today, n } from "../format";

export default function Thread() {
  const [tab, setTab] = useTab("stock");
  return (
    <div className="page">
      <PageHeader icon="🧵" step={1} title="Thread & suppliers"
        help="Record every thread purchase. Stock goes up when you buy and goes down automatically when a rod is wound." />
      <Tabs value={tab} onChange={setTab} tabs={[
        ["stock", "Thread stock"], ["buy", "+ Buy thread"], ["list", "Purchase list"], ["suppliers", "Suppliers"],
      ]} />
      {tab === "stock" && <Stock onBuy={() => setTab("buy")} />}
      {tab === "buy" && <BuyForm onAddSupplier={() => setTab("suppliers")} />}
      {tab === "list" && <PurchaseList />}
      {tab === "suppliers" && <Suppliers />}
    </div>
  );
}

function Stock({ onBuy }) {
  const { data, error } = useData("/thread-stock");
  const cols = [
    { label: "Thread type", key: "thread_type", render: (r) => <b>{r.thread_type}</b> },
    { label: "Colour", key: "color" },
    { label: "Bought", key: "purchased_kg", render: (r) => kg(r.purchased_kg), align: "right" },
    { label: "Used in rods", key: "used_kg", render: (r) => `${kg(r.used_kg)} (${r.rods} rods)`, align: "right" },
    { label: "Extra given to weavers", key: "given_kg", render: (r) => (r.given_kg ? kg(r.given_kg) : "—"), align: "right" },
    { label: "In stock now", key: "stock_kg", align: "right",
      render: (r) => <b className={r.stock_kg < 0 ? "neg" : r.stock_kg < 5 ? "warn" : "pos"}>{kg(r.stock_kg)}</b> },
  ];
  const total = (data || []).reduce((s, r) => s + r.stock_kg, 0);
  return (
    <Card title="Thread in stock" actions={<><ExportBar rows={data} columns={cols} filename="thread-stock" /><Btn onClick={onBuy}>+ Buy thread</Btn></>}>
      <ErrorBox msg={error} />
      <Table rows={data} columns={cols}
        empty="No thread yet. Press “Buy thread” to enter your first purchase (or opening stock)."
        footer={["Total", "", "", "", "", <b key="t">{kg(total)}</b>]} />
      <p className="hint">Red = stock is below zero (more used than bought — check purchases). Orange = less than 5 kg.</p>
    </Card>
  );
}

const blankPurchase = (keep = {}) => ({
  date: keep.date || today(), supplier_id: keep.supplier_id || "", bill_no: "", thread_type: "", color: "",
  quantity_kg: "", rate_per_kg: "", notes: "",
});

function BuyForm({ onAddSupplier }) {
  const [f, setF] = useState(blankPurchase());
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const { data: suppliers } = useData("/suppliers");
  const { data: stock, reload } = useData("/thread-stock");
  const [run, busy] = useAction();
  const amount = n(f.quantity_kg) * n(f.rate_per_kg);
  const types = [...new Set((stock || []).map((s) => s.thread_type))];
  const colors = [...new Set((stock || []).map((s) => s.color))];

  const save = async () => {
    const out = await run(() => api.post("/purchases", { ...f, supplier_id: f.supplier_id || null }),
      (p) => `Saved: ${kg(p.quantity_kg)} of ${p.thread_type} ${p.color}`);
    if (out) { setF(blankPurchase(f)); reload(); }
  };

  return (
    <Card title="Enter a thread purchase">
      <div className="form">
        <Field label="Date" required><DateInput value={f.date} onChange={set("date")} /></Field>
        <Field label="Supplier" hint={<button type="button" className="link" onClick={onAddSupplier}>+ Add a new supplier</button>}>
          <Select value={f.supplier_id} onChange={set("supplier_id")} placeholder="Opening stock (no supplier)"
            options={(suppliers || []).map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
        <Field label="Bill number"><Input value={f.bill_no} onChange={set("bill_no")} placeholder="Optional" /></Field>
        <Field label="Thread type" required hint="e.g. 40s Cotton, 2/60 Polyester">
          <Input value={f.thread_type} onChange={set("thread_type")} list="thread-types" placeholder="Type or choose" />
          <datalist id="thread-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Colour" required>
          <Input value={f.color} onChange={set("color")} list="thread-colors" placeholder="e.g. Red, White" />
          <datalist id="thread-colors">{colors.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Quantity (kg)" required><NumInput value={f.quantity_kg} onChange={set("quantity_kg")} /></Field>
        <Field label="Rate per kg (₹)"><NumInput value={f.rate_per_kg} onChange={set("rate_per_kg")} /></Field>
        <Field label="Notes" wide><Input value={f.notes} onChange={set("notes")} placeholder="Optional" /></Field>
      </div>
      <CalcBox label="Bill amount" formula={`${num(f.quantity_kg, 3)} kg × ${rs(f.rate_per_kg)}`} result={rs(amount)} />
      <div className="form-actions">
        <Btn big onClick={save} disabled={busy}>✓ Save purchase</Btn>
      </div>
    </Card>
  );
}

function PurchaseList() {
  const [range, setRange] = useState(rangeFor("month"));
  const { data, error, reload } = useData(`/purchases${qs(range)}`);
  const [run] = useAction();
  const del = async (p) => {
    if (!confirmDelete(`this purchase (${kg(p.quantity_kg)} ${p.thread_type} ${p.color})`)) return;
    if (await run(() => api.del(`/purchases/${p.id}`), "Purchase deleted")) reload();
  };
  const cols = [
    { label: "Date", key: "date", render: (r) => dt(r.date), csv: (r) => dt(r.date) },
    { label: "Supplier", key: "supplier_name" },
    { label: "Bill no", key: "bill_no" },
    { label: "Thread", key: "thread_type" },
    { label: "Colour", key: "color" },
    { label: "Kg", key: "quantity_kg", render: (r) => num(r.quantity_kg, 3), align: "right" },
    { label: "Rate", key: "rate_per_kg", render: (r) => rs(r.rate_per_kg), align: "right" },
    { label: "Amount", key: "amount", render: (r) => <b>{rs(r.amount)}</b>, align: "right" },
    { label: "", noExport: true, render: (r) => <Btn kind="danger-ghost" onClick={() => del(r)}>Delete</Btn> },
  ];
  const tot = (data || []).reduce((a, r) => ({ kg: a.kg + r.quantity_kg, amt: a.amt + r.amount }), { kg: 0, amt: 0 });
  return (
    <Card title="Purchase list" actions={<ExportBar rows={data} columns={cols} filename="thread-purchases" />}>
      <DateRange value={range} onChange={setRange} />
      <ErrorBox msg={error} />
      <Table rows={data} columns={cols} empty="No purchases in these dates."
        footer={["Total", "", "", "", "", num(tot.kg, 3), "", <b key="a">{rs(tot.amt)}</b>, ""]} />
    </Card>
  );
}

const blankSupplier = { name: "", phone: "", address: "", gstin: "", payment_terms: "" };

function Suppliers() {
  const { data, error, reload } = useData("/suppliers");
  const [f, setF] = useState(blankSupplier);
  const [editId, setEditId] = useState(null);
  const [run, busy] = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    const out = await run(() => (editId ? api.put(`/suppliers/${editId}`, f) : api.post("/suppliers", f)),
      editId ? "Supplier updated" : "Supplier added");
    if (out) { setF(blankSupplier); setEditId(null); reload(); }
  };
  const edit = (s) => { setEditId(s.id); setF({ name: s.name, phone: s.phone, address: s.address, gstin: s.gstin, payment_terms: s.payment_terms }); window.scrollTo(0, 0); };
  const del = async (s) => {
    if (!confirmDelete(`supplier ${s.name}`)) return;
    if (await run(() => api.del(`/suppliers/${s.id}`), "Supplier deleted")) reload();
  };

  return (
    <>
      <Card title={editId ? `Edit supplier` : "Add a supplier"}>
        <div className="form">
          <Field label="Supplier name" required><Input value={f.name} onChange={set("name")} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
          <Field label="GST number"><Input value={f.gstin} onChange={set("gstin")} /></Field>
          <Field label="Payment terms" hint="e.g. 30 days credit"><Input value={f.payment_terms} onChange={set("payment_terms")} /></Field>
          <Field label="Address" wide><Input value={f.address} onChange={set("address")} /></Field>
        </div>
        <div className="form-actions">
          <Btn big onClick={save} disabled={busy}>✓ {editId ? "Save changes" : "Add supplier"}</Btn>
          {editId && <Btn kind="ghost" onClick={() => { setEditId(null); setF(blankSupplier); }}>Cancel</Btn>}
        </div>
      </Card>
      <Card title="All suppliers">
        <ErrorBox msg={error} />
        <Table rows={data} empty="No suppliers added yet." columns={[
          { label: "Name", render: (r) => <b>{r.name}</b> },
          { label: "Phone", key: "phone" },
          { label: "GST", key: "gstin" },
          { label: "Terms", key: "payment_terms" },
          { label: "Total bought", render: (r) => `${kg(r.total_kg)} · ${rs(r.total_amount)}`, align: "right" },
          { label: "", render: (r) => <div className="row-actions"><Btn kind="ghost" onClick={() => edit(r)}>Edit</Btn><Btn kind="danger-ghost" onClick={() => del(r)}>Delete</Btn></div> },
        ]} />
      </Card>
    </>
  );
}
