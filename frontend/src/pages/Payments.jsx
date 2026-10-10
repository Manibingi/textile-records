import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, qs } from "../api";
import {
  PageHeader, Tabs, Card, Field, Input, NumInput, DateInput, Select, Btn, Table, ExportBar, Choice, Stat,
  DateRange, rangeFor, useData, useAction, useTab, confirmDelete, ErrorBox, Loading,
} from "../ui";
import { rs, mtr, num, dt, today, n, PAY_MODES } from "../format";

export default function Payments() {
  const [tab, setTab, sp] = useTab("due");
  return (
    <div className="page">
      <PageHeader icon="💰" step={6} title="Weaver payments"
        help="The amount to pay is worked out from the meters each weaver has delivered. Every payment gets a printable slip." />
      <Tabs value={tab} onChange={setTab} tabs={[["due", "Who to pay"], ["pay", "+ Pay a weaver"], ["history", "Payment history"]]} />
      {tab === "due" && <Dues onPay={(id) => setTab("pay", { weaver: id })} />}
      {tab === "pay" && <PayForm initialWeaver={sp.get("weaver") || ""} />}
      {tab === "history" && <History />}
    </div>
  );
}

function Dues({ onPay }) {
  const { data, error } = useData("/weaver-dues");
  const cols = [
    { label: "Weaver", key: "weaver_name", render: (r) => <Link className="link" to={`/weavers/${r.weaver_id}`}><b>{r.weaver_name}</b></Link> },
    { label: "Last paid on", render: (r) => dt(r.last_payment_date), csv: (r) => dt(r.last_payment_date) },
    { label: "Lots since then", key: "lots", align: "right" },
    { label: "Meters since then", key: "meters", render: (r) => mtr(r.meters), align: "right" },
    { label: "Earned since then", key: "amount", render: (r) => rs(r.amount), align: "right" },
    { label: "Total to pay now", key: "balance", render: (r) => <b className={r.balance > 0 ? "neg" : "pos"}>{rs(r.balance)}</b>, align: "right" },
    { label: "", noExport: true, render: (r) => <Btn onClick={() => onPay(r.weaver_id)}>Pay</Btn> },
  ];
  const total = (data || []).reduce((s, r) => s + Math.max(r.balance, 0), 0);
  return (
    <Card title="Amount to pay each weaver" actions={<ExportBar rows={data} columns={cols} filename="weaver-dues" />}>
      <ErrorBox msg={error} />
      <Table rows={data} columns={cols} rowKey="weaver_id" empty="No weavers yet."
        footer={["Total", "", "", "", "", <b key="t">{rs(total)}</b>, ""]} />
      <p className="hint">“Total to pay now” = amount owed at start + all lots − all payments. A negative amount means you paid an advance.</p>
    </Card>
  );
}

function PayForm({ initialWeaver }) {
  const nav = useNavigate();
  const { data: weavers } = useData("/weavers");
  const [f, setF] = useState({ date: today(), weaver_id: initialWeaver, amount: "", mode: "Cash", notes: "" });
  const [run, busy] = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const w = (weavers || []).find((x) => String(x.id) === String(f.weaver_id));

  useEffect(() => {
    if (w && f.amount === "" && w.balance > 0) setF((x) => ({ ...x, amount: String(w.balance) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w?.id]);

  const save = async () => {
    const out = await run(() => api.post("/weaver-payments", { ...f, weaver_id: Number(f.weaver_id) || 0, amount: f.amount === "" ? undefined : n(f.amount) }),
      (p) => `Paid ${rs(p.amount)} to ${p.weaver_name}`);
    if (out) nav(`/payments/slip/${out.id}`);
  };

  return (
    <Card title="Pay a weaver">
      <div className="form">
        <Field label="Weaver" required>
          <Select value={f.weaver_id} onChange={(v) => setF((x) => ({ ...x, weaver_id: v, amount: "" }))}
            options={(weavers || []).map((x) => ({ value: x.id, label: x.name }))} />
        </Field>
        <Field label="Date" required><DateInput value={f.date} onChange={set("date")} /></Field>
      </div>
      {w && (
        <div className="stats">
          <Stat label="Total to pay now" value={rs(w.balance)} tone={w.balance > 0 ? "red" : "green"} />
          <Stat label="Since last payment" value={mtr(w.since_last_payment.meters)}
            sub={`${w.since_last_payment.lots} lots × ${rs(w.rate_per_meter)}/m = ${rs(w.since_last_payment.amount)}`} />
          <Stat label="Last paid on" value={dt(w.since_last_payment.last_payment_date)} />
        </div>
      )}
      <div className="form">
        <Field label="Amount paying now (₹)" required
          hint={w && w.balance > 0 ? <button type="button" className="link" onClick={() => set("amount")(String(w.balance))}>Pay full {rs(w.balance)}</button> : ""}>
          <NumInput value={f.amount} onChange={set("amount")} />
        </Field>
        <Field label="Paid by"><Choice value={f.mode} onChange={set("mode")} options={PAY_MODES} /></Field>
        <Field label="Notes" wide><Input value={f.notes} onChange={set("notes")} placeholder="Optional, e.g. advance for festival" /></Field>
      </div>
      {w && f.amount !== "" && (
        <div className="calc green">
          <div className="calc-label">After this payment</div>
          <div className="calc-result">
            {w.balance - n(f.amount) >= 0 ? `Still to pay: ${rs(w.balance - n(f.amount))}` : `Advance given: ${rs(n(f.amount) - w.balance)}`}
          </div>
        </div>
      )}
      <div className="form-actions"><Btn big onClick={save} disabled={busy}>✓ Save payment & show slip</Btn></div>
    </Card>
  );
}

function History() {
  const [range, setRange] = useState(rangeFor("month"));
  const { data, error, reload } = useData(`/weaver-payments${qs(range)}`);
  const [run] = useAction();
  const del = async (p) => {
    if (!confirmDelete(`payment of ${rs(p.amount)} to ${p.weaver_name}`)) return;
    if (await run(() => api.del(`/weaver-payments/${p.id}`), "Payment deleted")) reload();
  };
  const cols = [
    { label: "Date", key: "date", render: (r) => dt(r.date), csv: (r) => dt(r.date) },
    { label: "Weaver", key: "weaver_name" },
    { label: "Amount", key: "amount", render: (r) => <b>{rs(r.amount)}</b>, align: "right" },
    { label: "Paid by", key: "mode" },
    { label: "Notes", key: "notes" },
    { label: "", noExport: true, render: (r) => <div className="row-actions"><Link className="btn ghost" to={`/payments/slip/${r.id}`}>🖨 Slip</Link><Btn kind="danger-ghost" onClick={() => del(r)}>Delete</Btn></div> },
  ];
  const total = (data || []).reduce((s, r) => s + r.amount, 0);
  return (
    <Card title="Payment history" actions={<ExportBar rows={data} columns={cols} filename="weaver-payments" />}>
      <DateRange value={range} onChange={setRange} />
      <ErrorBox msg={error} />
      <Table rows={data} columns={cols} empty="No payments in these dates." footer={["Total", "", <b key="t">{rs(total)}</b>, "", "", ""]} />
    </Card>
  );
}

export function PaymentSlip({ settings }) {
  const { id } = useParams();
  const { data, error } = useData(`/weaver-payments/${id}/slip`);
  if (error) return <div className="page"><ErrorBox msg={error} /></div>;
  if (!data) return <div className="page"><Loading /></div>;
  const p = data.payment;
  return (
    <div className="page">
      <div className="no-print doc-actions">
        <Link className="back" to="/payments?tab=history">← Payments</Link>
        <Btn big onClick={() => window.print()}>🖨 Print slip</Btn>
      </div>
      <div className="doc">
        <div className="doc-head">
          <div>
            <div className="doc-biz">{settings?.business_name || "Textile Records"}</div>
            <div className="muted">{settings?.address}{settings?.phone && ` · ${settings.phone}`}</div>
          </div>
          <div className="doc-title">Weaver Payment Slip<div className="muted small">No. P-{String(p.id).padStart(4, "0")}</div></div>
        </div>
        <div className="doc-meta">
          <div><span>Weaver</span><b>{data.weaver.name}</b></div>
          <div><span>Payment date</span><b>{dt(p.date)}</b></div>
          <div><span>Work period</span><b>{data.period_from ? `After ${dt(data.period_from)}` : "From start"} to {dt(data.period_to)}</b></div>
          <div><span>Rate</span><b>{rs(data.weaver.rate_per_meter)} / meter</b></div>
        </div>
        <Table rows={data.lots} rowKey="code" empty="No new lots in this period." columns={[
          { label: "Lot", key: "code" },
          { label: "Date", render: (r) => dt(r.date) },
          { label: "Machine", render: (r) => r.machine && `M${r.machine}` },
          { label: "Product", render: (r) => `${r.product} ${r.color}` },
          { label: "Pieces", key: "pieces", align: "right" },
          { label: "Meters", render: (r) => num(r.meters), align: "right" },
          { label: "Amount", render: (r) => rs(r.amount), align: "right" },
        ]} footer={["Total", "", "", "", "", num(data.total_meters), rs(data.total_amount)]} />
        <div className="doc-totals">
          <div><span>Total amount due before this payment</span><b>{rs(data.due_before)}</b></div>
          <div className="big"><span>Paid now ({p.mode})</span><b>{rs(p.amount)}</b></div>
          <div><span>{data.balance_after >= 0 ? "Balance still to pay" : "Advance given"}</span><b>{rs(Math.abs(data.balance_after))}</b></div>
        </div>
        {p.notes && <p>Notes: {p.notes}</p>}
        <div className="signs"><div>Received by (weaver)</div><div>Paid by</div></div>
      </div>
    </div>
  );
}
