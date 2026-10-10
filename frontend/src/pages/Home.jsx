import { Link, useNavigate } from "react-router-dom";
import { useData, Stat, Loading, ErrorBox, Table, Card } from "../ui";
import { rs, kg, mtr, num, dt } from "../format";

const STEPS = [
  { n: 1, icon: "🧵", title: "Buy thread", sub: "Enter a thread purchase", to: "/thread?tab=buy" },
  { n: 2, icon: "🧶", title: "Wind a rod", sub: "New rod / design", to: "/rods?tab=new" },
  { n: 3, icon: "🤝", title: "Give rod to weaver", sub: "Issue rods", to: "/rods?tab=issue" },
  { n: 4, icon: "🧵", title: "Give extra thread", sub: "Loose thread to weaver", to: "/rods?tab=thread" },
  { n: 5, icon: "📦", title: "Receive a lot", sub: "Cloth back from weaver", to: "/lots?tab=receive" },
  { n: 6, icon: "💰", title: "Pay a weaver", sub: "See who to pay", to: "/payments?tab=due" },
  { n: 7, icon: "✂️", title: "Cut & pack", sub: "Lot into pieces", to: "/cutting?tab=cut" },
  { n: 8, icon: "🧾", title: "Make a bill", sub: "Wholesale sale", to: "/sales?tab=bill" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const nav = useNavigate();
  const { data, error } = useData("/dashboard");
  const todayStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="page">
      <div className="hello">
        <h1>{greeting()} 🙏</h1>
        <p className="muted">{todayStr} · What do you want to do?</p>
      </div>

      <div className="steps">
        {STEPS.map((s) => (
          <Link key={s.n} to={s.to} className={`step-tile s${s.n}`}>
            <span className="step-num">{s.n}</span>
            <span className="step-icon" aria-hidden>{s.icon}</span>
            <span className="step-title">{s.title}</span>
            <span className="step-sub">{s.sub}</span>
          </Link>
        ))}
      </div>

      <h2 className="section-title">At a glance</h2>
      <ErrorBox msg={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="stats">
            <Stat label="Thread in stock" value={kg(data.thread_stock_kg)} onClick={() => nav("/thread?tab=stock")} />
            <Stat label="Rods ready to give" value={data.rods_in_stock} sub="Wound, not yet given" onClick={() => nav("/rods?tab=list&status=in_stock")} />
            <Stat label="Rods with weavers" value={data.rods_with_weavers} sub={`Being woven now · extra thread ${kg(data.extra_thread_with_weavers_kg)}`} tone="amber" onClick={() => nav("/rods?tab=list&status=with_weaver")} />
            <Stat label="Pieces waiting to cut" value={num(data.uncut_pieces, 0)} sub="From all lots received" tone={data.uncut_pieces ? "amber" : ""} onClick={() => nav("/cutting?tab=cut")} />
            <Stat label="Packed pieces ready" value={num(data.finished_pieces, 0)}
              sub={data.finished_by_product.map((p) => `${p.product}: ${num(p.pieces, 0)}`).join(" · ") || "—"}
              tone="green" onClick={() => nav("/cutting?tab=stock")} />
            <Stat label="To pay weavers" value={rs(data.weaver_dues)} tone="red" onClick={() => nav("/payments?tab=due")} />
            <Stat label="To receive from customers" value={rs(data.receivables)} tone="green" onClick={() => nav("/sales?tab=customers")} />
            <Stat label="This month" value={mtr(data.month.meters)}
              sub={`${data.month.lots} lots received · Sales ${rs(data.month.sales)}`} onClick={() => nav("/reports")} />
          </div>

          {data.thread_low.length > 0 && (
            <div className="notice">
              <b>Low thread stock:</b>{" "}
              {data.thread_low.map((t) => `${t.thread_type} ${t.color} (${kg(t.stock_kg)})`).join(", ")}
            </div>
          )}

          <Card title="Latest lots received" actions={<Link className="link" to="/lots?tab=list">See all →</Link>}>
            <Table rows={data.recent_lots} empty="No lots received yet."
              columns={[
                { label: "Lot", render: (r) => <b>{r.code}</b> },
                { label: "Date", render: (r) => dt(r.date) },
                { label: "Weaver", key: "weaver_name" },
                { label: "Product", render: (r) => `${r.product} · ${r.color}` },
                { label: "Pieces", key: "pieces", align: "right" },
                { label: "Meters", render: (r) => mtr(r.meters), align: "right" },
              ]} />
          </Card>
        </>
      )}
    </div>
  );
}
