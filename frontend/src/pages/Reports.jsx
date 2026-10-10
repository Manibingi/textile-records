import { useState } from "react";
import { qs } from "../api";
import { PageHeader, Tabs, Card, Table, ExportBar, DateRange, rangeFor, useData, useTab, ErrorBox, Stat, Loading } from "../ui";
import { rs, kg, mtr, num, dt } from "../format";

const REPORTS = {
  weavers: {
    title: "Weaver-wise production", path: "/reports/weavers", columns: [
      { label: "Weaver", key: "weaver", render: (r) => <b>{r.weaver}</b> },
      { label: "Machines", key: "machines", align: "right" },
      { label: "Lots", key: "lots", align: "right" },
      { label: "Pieces", key: "pieces", align: "right" },
      { label: "Meters", key: "meters", render: (r) => num(r.meters), align: "right", sum: true },
      { label: "Extra thread (kg)", key: "extra_thread_kg", render: (r) => num(r.extra_thread_kg, 3), align: "right", sum: true },
      { label: "Earned", key: "earned", render: (r) => rs(r.earned), align: "right", sum: true, money: true },
      { label: "Paid", key: "paid", render: (r) => rs(r.paid), align: "right", sum: true, money: true },
      { label: "To pay now", key: "balance_now", render: (r) => rs(r.balance_now), align: "right" },
    ],
  },
  machines: {
    title: "Machine-wise output", path: "/reports/machines", columns: [
      { label: "Weaver", key: "weaver" },
      { label: "Machine", key: "machine", render: (r) => <b>{r.machine}</b> },
      { label: "Lots", key: "lots", align: "right", sum: true },
      { label: "Pieces", key: "pieces", align: "right", sum: true },
      { label: "Meters", key: "meters", render: (r) => num(r.meters), align: "right", sum: true },
    ],
  },
  suppliers: {
    title: "Thread purchases by supplier", path: "/reports/suppliers", columns: [
      { label: "Supplier", key: "supplier", render: (r) => <b>{r.supplier}</b> },
      { label: "Purchases", key: "purchases", align: "right" },
      { label: "Kg", key: "kg", render: (r) => num(r.kg, 3), align: "right", sum: true },
      { label: "Amount", key: "amount", render: (r) => rs(r.amount), align: "right", sum: true, money: true },
      { label: "Average rate/kg", key: "avg_rate", render: (r) => rs(r.avg_rate), align: "right" },
    ],
  },
  sales: {
    title: "Sales by customer", path: "/reports/sales", columns: [
      { label: "Customer", key: "customer", render: (r) => <b>{r.customer}</b> },
      { label: "Bills", key: "bills", align: "right" },
      { label: "Pieces", key: "pieces", align: "right", sum: true },
      { label: "Billed", key: "amount", render: (r) => rs(r.amount), align: "right", sum: true, money: true },
      { label: "Received", key: "received", render: (r) => rs(r.received), align: "right", sum: true, money: true },
      { label: "Still to receive (now)", key: "balance_now", render: (r) => rs(r.balance_now), align: "right" },
    ],
  },
  wastage: {
    title: "Wastage / rejects in cutting (by colour)", path: "/reports/wastage", columns: [
      { label: "Product", key: "product", render: (r) => <b>{r.product}</b> },
      { label: "Colour", key: "color" },
      { label: "Cutting entries", key: "entries", align: "right" },
      { label: "Good", key: "good", align: "right", sum: true },
      { label: "Rejected", key: "rejected", align: "right", sum: true },
      { label: "Reject %", key: "reject_percent", render: (r) => <b className={r.reject_percent > 5 ? "neg" : ""}>{r.reject_percent}%</b>, align: "right" },
    ],
  },
};

export default function Reports() {
  const [tab, setTab] = useTab("summary");
  const [range, setRange] = useState(rangeFor("month"));
  const label = range.from || range.to ? `${range.from ? dt(range.from) : "start"} to ${range.to ? dt(range.to) : "today"}` : "All time";
  return (
    <div className="page">
      <PageHeader icon="📊" title="Reports" help="Choose the dates, then the report. Every report can be downloaded for Excel or printed / saved as PDF." />
      <Card><DateRange value={range} onChange={setRange} /></Card>
      <Tabs value={tab} onChange={setTab} tabs={[["summary", "Summary"], ["weavers", "Weavers"], ["machines", "Machines"], ["suppliers", "Suppliers"], ["sales", "Sales"], ["wastage", "Wastage"]]} />
      <div className="print-only print-range">Period: {label}</div>
      {tab === "summary" ? <Summary range={range} /> : <Report key={tab} def={REPORTS[tab]} range={range} name={tab} />}
    </div>
  );
}

function Summary({ range }) {
  const { data, error } = useData(`/reports/summary${qs(range)}`);
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <h2 className="section-title">Production</h2>
      <div className="stats">
        <Stat label="Thread bought" value={kg(data.thread_purchase_kg)} sub={rs(data.thread_purchase_amount)} />
        <Stat label="Lots received" value={data.lots} sub={`${num(data.pieces_received, 0)} pieces`} />
        <Stat label="Cloth received" value={mtr(data.meters)} sub={`Weaving cost ${rs(data.weaving_cost)}`} />
        <Stat label="Pieces packed" value={num(data.pieces_packed, 0)} sub={`${num(data.pieces_rejected, 0)} rejected`} />
      </div>
      <h2 className="section-title">Money</h2>
      <div className="stats">
        <Stat label="Sales" value={rs(data.sales_amount)} sub={`${num(data.pieces_sold, 0)} pieces sold`} tone="green" />
        <Stat label="Money received from customers" value={rs(data.money_received)} />
        <Stat label="Paid to weavers" value={rs(data.weaver_paid)} />
        <Stat label="Rough profit" value={rs(data.rough_profit)} tone={data.rough_profit >= 0 ? "green" : "red"}
          sub="Sales − thread bought − weaving cost" />
      </div>
      <p className="hint">Rough profit does not include electricity, salaries, transport, packing material or rent. Thread bought in this period may be used later, so check over a longer period (e.g. full year) for a better picture.</p>
    </>
  );
}

function Report({ def, range, name }) {
  const { data, error } = useData(`${def.path}${qs(range)}`);
  const footer = def.columns.map((c, i) => {
    if (i === 0) return "Total";
    if (!c.sum || !data) return "";
    const t = data.reduce((s, r) => s + (r[c.key] || 0), 0);
    return c.money ? rs(t) : num(t, c.key === "kg" ? 3 : 2);
  });
  return (
    <Card title={def.title} actions={<ExportBar rows={data} columns={def.columns} filename={`report-${name}`} />}>
      <ErrorBox msg={error} />
      <Table rows={data} columns={def.columns} empty="No records in these dates." footer={footer} />
    </Card>
  );
}
