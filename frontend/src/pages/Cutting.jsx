import { useState } from "react";
import { Link } from "react-router-dom";
import { api, qs } from "../api";
import {
  PageHeader, Tabs, Card, Field, Input, NumInput, DateInput, CalcBox, Btn, Table, ExportBar, Choice,
  DateRange, rangeFor, useData, useAction, useTab, confirmDelete, ErrorBox, Stat, Empty,
} from "../ui";
import { num, dt, today, n, PRODUCTS } from "../format";

export default function Cutting() {
  const [tab, setTab] = useTab("cut");
  return (
    <div className="page">
      <PageHeader icon="✂️" step={7} title="Cutting, packing & stock"
        help="Cut the received cloth into pieces and pack them. Packed pieces become ready-to-sell stock, which goes down when you make a bill." />
      <Tabs value={tab} onChange={setTab} tabs={[["cut", "+ Cut & pack"], ["stock", "Ready stock"], ["history", "Cutting history"]]} />
      {tab === "cut" && <CutForm />}
      {tab === "stock" && <FinishedStock />}
      {tab === "history" && <History />}
    </div>
  );
}

function CutForm() {
  const { data: uncut, reload } = useData("/uncut-stock");
  const [opening, setOpening] = useState(false);
  const blank = (keep = {}) => ({ date: keep.date || today(), product: "", color: "", good_pieces: "", rejected_pieces: "", bundles: "", notes: "" });
  const [f, setF] = useState(blank());
  const [run, busy] = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const waitingList = (uncut || []).filter((u) => u.waiting > 0);
  const chosen = (uncut || []).find((u) => u.product === f.product && u.color === f.color);
  const total = n(f.good_pieces) + n(f.rejected_pieces);
  const pick = (u) => setF((x) => ({ ...x, product: u.product, color: u.color }));

  const save = async () => {
    if (!f.product) return run(() => Promise.reject(new Error(opening ? "Please choose Towel or Lungi." : "Please tap the colour you are cutting.")));
    const body = { ...f, source: opening ? "opening" : "woven",
      good_pieces: n(f.good_pieces), rejected_pieces: n(f.rejected_pieces), bundles: n(f.bundles) };
    const out = await run(() => api.post("/cutting", body),
      (c) => c.warning || `Saved: ${c.good_pieces} ${c.product} ${c.color} added to ready stock`);
    if (out) { setF(blank(f)); reload(); }
  };

  return (
    <Card title="Cut & pack">
      <Choice value={opening ? "open" : "woven"} onChange={(v) => { setOpening(v === "open"); setF((x) => ({ ...blank(x), product: v === "open" ? "Towel" : "" })); }}
        options={[{ value: "woven", label: "From lots received" }, { value: "open", label: "Opening stock / other" }]} />

      {!opening && (
        <div className="sub-block" style={{ marginTop: 18 }}>
          <div className="field-label">Tap the colour you are cutting — pieces waiting from all lots</div>
          {!uncut ? null : !waitingList.length ? (
            <Empty>No pieces waiting to be cut. <Link to="/lots?tab=receive">Receive lots</Link> first.</Empty>
          ) : (
            <div className="colour-grid">
              {waitingList.map((u) => (
                <button type="button" key={u.product + u.color} onClick={() => pick(u)}
                  className={`colour-card ${chosen === u ? "on" : ""}`}>
                  <span className="colour-product">{u.product}</span>
                  <span className="colour-name">{u.color || "—"}</span>
                  <span className="colour-pcs">{num(u.waiting, 0)}<small> pieces</small></span>
                  <span className="muted small">from {u.lots} lot{u.lots === 1 ? "" : "s"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="form" style={{ marginTop: 16 }}>
        <Field label="Date" required><DateInput value={f.date} onChange={set("date")} /></Field>
        {opening && (
          <>
            <Field label="Product" required><Choice value={f.product} onChange={set("product")} options={PRODUCTS} /></Field>
            <Field label="Colour"><Input value={f.color} onChange={set("color")} /></Field>
          </>
        )}
      </div>
      {!opening && chosen && (
        <div className="lot-strip"><span>Cutting: <b>{chosen.product} · {chosen.color}</b></span><span>{num(chosen.waiting, 0)} pieces waiting</span></div>
      )}
      <div className="form">
        <Field label={opening ? "Packed pieces in stock" : "Good pieces packed"} required><NumInput value={f.good_pieces} onChange={set("good_pieces")} step="1" /></Field>
        {!opening && <Field label="Rejected / waste pieces"><NumInput value={f.rejected_pieces} onChange={set("rejected_pieces")} step="1" /></Field>}
        <Field label="Bundles / cartons"><NumInput value={f.bundles} onChange={set("bundles")} step="1" /></Field>
        <Field label="Notes"><Input value={f.notes} onChange={set("notes")} placeholder="Optional" /></Field>
      </div>
      {!opening && chosen && total > 0 && (
        <CalcBox label="After this cutting" tone={total > chosen.waiting ? "amber" : "green"}
          formula={`${num(chosen.waiting, 0)} waiting − (${n(f.good_pieces)} good + ${n(f.rejected_pieces)} rejected)`}
          result={total > chosen.waiting ? `⚠ ${total - chosen.waiting} more than waiting — please check` : `${chosen.waiting - total} pieces still to cut`} />
      )}
      <div className="form-actions"><Btn big onClick={save} disabled={busy}>✓ Save</Btn></div>
    </Card>
  );
}

function FinishedStock() {
  const { data, error } = useData("/finished-stock");
  const cols = [
    { label: "Product", key: "product", render: (r) => <b>{r.product}</b> },
    { label: "Colour", key: "color" },
    { label: "Packed (total)", key: "packed", align: "right" },
    { label: "Sold", key: "sold", align: "right" },
    { label: "Ready to sell", key: "in_stock", align: "right", render: (r) => <b className={r.in_stock <= 0 ? "neg" : "pos"}>{num(r.in_stock, 0)}</b> },
  ];
  const byProduct = {};
  (data || []).forEach((r) => { byProduct[r.product] = (byProduct[r.product] || 0) + r.in_stock; });
  return (
    <>
      <div className="stats">
        {Object.entries(byProduct).map(([p, q]) => <Stat key={p} label={`${p} ready`} value={`${num(q, 0)} pcs`} tone="green" />)}
      </div>
      <Card title="Ready-to-sell stock" actions={<><ExportBar rows={data} columns={cols} filename="finished-stock" /><Link className="btn primary" to="/sales?tab=bill">🧾 Make a bill</Link></>}>
        <ErrorBox msg={error} />
        <Table rows={data} columns={cols} empty="No packed stock yet." />
      </Card>
    </>
  );
}

function History() {
  const [range, setRange] = useState(rangeFor("month"));
  const { data, error, reload } = useData(`/cutting${qs(range)}`);
  const [run] = useAction();
  const del = async (c) => {
    if (!confirmDelete(`this cutting entry (${c.product} ${c.color}, ${c.good_pieces} pieces)`)) return;
    if (await run(() => api.del(`/cutting/${c.id}`), "Entry deleted")) reload();
  };
  const cols = [
    { label: "Date", key: "date", render: (r) => dt(r.date), csv: (r) => dt(r.date) },
    { label: "From", key: "source_label", render: (r) => r.source_label + (r.lot_code ? ` (${r.lot_code})` : "") },
    { label: "Product", render: (r) => `${r.product} · ${r.color}`, csv: (r) => `${r.product} ${r.color}` },
    { label: "Good", key: "good_pieces", align: "right" },
    { label: "Rejected", key: "rejected_pieces", align: "right" },
    { label: "Bundles", key: "bundles", align: "right" },
    { label: "", noExport: true, render: (r) => <Btn kind="danger-ghost" onClick={() => del(r)}>Delete</Btn> },
  ];
  const t = (data || []).reduce((a, r) => ({ g: a.g + r.good_pieces, r: a.r + r.rejected_pieces, b: a.b + r.bundles }), { g: 0, r: 0, b: 0 });
  return (
    <Card title="Cutting history" actions={<ExportBar rows={data} columns={cols} filename="cutting" />}>
      <DateRange value={range} onChange={setRange} />
      <ErrorBox msg={error} />
      <Table rows={data} columns={cols} empty="No cutting entries in these dates." footer={["Total", "", "", t.g, t.r, t.b, ""]} />
    </Card>
  );
}
