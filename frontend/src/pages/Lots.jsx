import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, qs } from "../api";
import {
  PageHeader, Tabs, Card, Field, Input, NumInput, DateInput, Select, CalcBox, Btn, Table, ExportBar, Choice,
  DateRange, rangeFor, useData, useAction, useTab, confirmDelete, ErrorBox, Empty,
} from "../ui";
import { rs, kg, mtr, num, dt, today, n, PRODUCTS } from "../format";

export default function Lots() {
  const [tab, setTab] = useTab("receive");
  return (
    <div className="page">
      <PageHeader icon="📦" step={5} title="Lots received"
        help="When a weaver brings back cloth from a machine, weigh all the lots together, then note the pieces and meters of each lot." />
      <Tabs value={tab} onChange={setTab} tabs={[["receive", "+ Receive lots"], ["list", "Lot list"]]} />
      {tab === "receive" && <ReceiveForm />}
      {tab === "list" && <LotList />}
    </div>
  );
}

const blankLine = () => ({ pieces: "", meters: "" });
const blank = (keep = {}) => ({
  date: keep.date || today(), weaver_id: keep.weaver_id || "", machine_id: keep.machine_id || "",
  product: keep.product || "Towel", color: keep.color || "", design: keep.design || "", weight_kg: "", notes: "",
});

function ReceiveForm() {
  const { data: weavers } = useData("/weavers");
  const [f, setF] = useState(blank());
  const [lines, setLines] = useState([blankLine()]);
  const [rodIds, setRodIds] = useState([]);
  const [finishIds, setFinishIds] = useState([]);
  const [saved, setSaved] = useState(null);
  const { data: rods, reload: reloadRods } = useData(f.weaver_id ? `/rods?weaver_id=${f.weaver_id}&status=with_weaver` : null);
  const [run, busy] = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const setLine = (i, k, v) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const weaver = (weavers || []).find((w) => String(w.id) === String(f.weaver_id));
  const machines = weaver?.machines || [];

  // When a machine is chosen, tick its rods and fill colour/design from them.
  useEffect(() => {
    if (!rods) return;
    const onMachine = f.machine_id ? rods.filter((r) => String(r.machine_id) === String(f.machine_id)) : [];
    setRodIds(onMachine.map((r) => r.id));
    setFinishIds([]);
    const first = onMachine[0];
    const m = machines.find((x) => String(x.id) === String(f.machine_id));
    setF((x) => ({ ...x, color: first?.color || m?.current_color || x.color, design: first?.design || m?.current_design || x.design }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rods, f.machine_id]);

  const toggleRod = (id) => setRodIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleFinish = (id) => setFinishIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const rate = weaver?.rate_per_meter || 0;
  const filled = lines.filter((l) => l.pieces !== "" || l.meters !== "");
  const totPieces = lines.reduce((s, l) => s + n(l.pieces), 0);
  const totMeters = lines.reduce((s, l) => s + n(l.meters), 0);

  const save = async () => {
    if (!filled.length) return run(() => Promise.reject(new Error("Enter pieces and meters for at least one lot.")));
    const bad = filled.findIndex((l) => l.pieces === "" || l.meters === "" || n(l.meters) <= 0);
    if (bad >= 0) return run(() => Promise.reject(new Error(`Lot ${lines.indexOf(filled[bad]) + 1}: enter both pieces and meters.`)));
    const body = { ...f, weaver_id: Number(f.weaver_id) || 0, machine_id: Number(f.machine_id) || null, weight_kg: n(f.weight_kg),
      lots: filled.map((l) => ({ pieces: n(l.pieces), meters: n(l.meters) })),
      rod_ids: rodIds, finish_rod_ids: finishIds.filter((x) => rodIds.includes(x)) };
    const out = await run(() => api.post("/lots", body));
    if (out) {
      setSaved(out);
      setF(blank(f));
      setLines([blankLine()]);
      reloadRods();
      window.scrollTo(0, 0);
    }
  };

  return (
    <>
      {saved && (
        <div className="saved-banner">
          <div>
            <div className="saved-code">{saved.lots.map((l) => l.code).join(", ")}</div>
            <div>{saved.lots.length} lot{saved.lots.length > 1 ? "s" : ""} saved · {saved.weaver_name} · {saved.pieces} pieces · {mtr(saved.meters)} · weight {kg(saved.weight_kg)}</div>
            <div>Weaver earns <b>{rs(saved.amount)}</b> (added to his account).</div>
          </div>
          <Link className="btn ghost" to="/cutting?tab=cut">Go to cutting →</Link>
        </div>
      )}
      <Card title="Receive lots from a weaver">
        <div className="form">
          <Field label="Date received" required><DateInput value={f.date} onChange={set("date")} /></Field>
          <Field label="Weaver" required>
            <Select value={f.weaver_id} onChange={(v) => setF((x) => ({ ...x, weaver_id: v, machine_id: "" }))}
              options={(weavers || []).filter((w) => w.active).map((w) => ({ value: w.id, label: `${w.name} (${rs(w.rate_per_meter)}/m)` }))} />
          </Field>
          <Field label="Machine">
            <Select value={f.machine_id} onChange={set("machine_id")} placeholder="— Choose machine —"
              options={machines.map((m) => ({ value: m.id, label: `Machine ${m.number}${m.current_color ? ` · ${m.current_color} ${m.current_design}` : ""}` }))} />
          </Field>
        </div>

        <div className="field-label">Product</div>
        <Choice value={f.product} onChange={set("product")} options={PRODUCTS} />

        <div className="form" style={{ marginTop: 16 }}>
          <Field label="Colour" required><Input value={f.color} onChange={set("color")} /></Field>
          <Field label="Design"><Input value={f.design} onChange={set("design")} /></Field>
          <Field label="Total weight of all lots (kg)" hint="Weigh all the lots together">
            <NumInput value={f.weight_kg} onChange={set("weight_kg")} />
          </Field>
        </div>

        <div className="sub-head">Each lot separately</div>
        <div className="lot-lines">
          {lines.map((l, i) => {
            const odd = l.pieces !== "" && (n(l.pieces) < 35 || n(l.pieces) > 50);
            return (
              <div key={i} className="lot-line">
                <div className="lot-line-no">Lot {i + 1}</div>
                <Field label="Number of pieces" hint={odd ? "⚠ Usually 35–50 — please re-check" : ""}>
                  <NumInput value={l.pieces} onChange={(v) => setLine(i, "pieces", v)} step="1" />
                </Field>
                <Field label="Meters">
                  <NumInput value={l.meters} onChange={(v) => setLine(i, "meters", v)} />
                </Field>
                <div className="lot-line-amt">{rs(n(l.meters) * rate)}</div>
                {lines.length > 1 && <button type="button" className="x-btn" aria-label={`Remove lot ${i + 1}`}
                  onClick={() => setLines((xs) => xs.filter((_, j) => j !== i))}>✕</button>}
              </div>
            );
          })}
        </div>
        <Btn kind="ghost" onClick={() => setLines((xs) => [...xs, blankLine()])}>+ Add another lot from this machine</Btn>

        {f.weaver_id && (
          <div className="sub-block" style={{ marginTop: 18 }}>
            <div className="field-label">Which rod(s) were these lots made from?</div>
            {!rods?.length ? <Empty>No rods are recorded with {weaver?.name}. You can still save.</Empty> : (
              <div className="tick-grid">
                {rods.map((r) => (
                  <div key={r.id} className={`tick-card ${rodIds.includes(r.id) ? "on" : ""}`}>
                    <label className="tick-main">
                      <input type="checkbox" checked={rodIds.includes(r.id)} onChange={() => toggleRod(r.id)} />
                      <div>
                        <div className="tick-title">{r.code} {r.machine_number && <span className="muted small">· Machine {r.machine_number}</span>}</div>
                        <div>{r.thread_type} · <b>{r.color}</b>{r.design && ` · ${r.design}`}</div>
                        <div className="muted small">{kg(r.net_weight)} · woven so far {num(r.meters_woven)} m</div>
                      </div>
                    </label>
                    {rodIds.includes(r.id) && (
                      <label className="tick-finish">
                        <input type="checkbox" checked={finishIds.includes(r.id)} onChange={() => toggleFinish(r.id)} />
                        This rod is now empty (finished)
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <CalcBox label={filled.length ? `Total for ${filled.length} lot${filled.length === 1 ? "" : "s"} · weaver earns` : "Weaver earns"} tone="green"
          formula={`${num(totPieces, 0)} pieces · ${num(totMeters)} m × ${rs(rate)} per meter · weight ${kg(f.weight_kg)}`}
          result={rs(lines.reduce((t, l) => t + Math.round(n(l.meters) * rate * 100 + 1e-6) / 100, 0))} />
        <div className="form-actions"><Btn big onClick={save} disabled={busy}>✓ Save {filled.length > 1 ? `${filled.length} lots` : "lot"}</Btn></div>
      </Card>
    </>
  );
}

function LotList() {
  const [range, setRange] = useState(rangeFor("month"));
  const [weaverId, setWeaverId] = useState("");
  const { data: weavers } = useData("/weavers");
  const { data, error, reload } = useData(`/lots${qs({ ...range, weaver_id: weaverId })}`);
  const [run] = useAction();
  const del = async (l) => {
    if (!confirmDelete(`lot ${l.code} (${l.weaver_name}, ${l.pieces} pieces, ${mtr(l.meters)})`)) return;
    if (await run(() => api.del(`/lots/${l.id}`), `Lot ${l.code} deleted`)) reload();
  };
  const weightText = (r) => (r.batch_lot_count > 1 ? `${num(r.weight_kg, 3)} (${r.batch_lot_count} lots together)` : num(r.weight_kg, 3));
  const cols = [
    { label: "Lot", key: "code", render: (r) => <b>{r.code}</b>, className: "nowrap" },
    { label: "Date", key: "date", render: (r) => dt(r.date), csv: (r) => dt(r.date), className: "nowrap" },
    { label: "Weaver", key: "weaver_name" },
    { label: "Machine", render: (r) => (r.machine_number ? `M${r.machine_number}` : "—"), csv: (r) => r.machine_number },
    { label: "Product", render: (r) => `${r.product} · ${r.color}${r.design ? ` · ${r.design}` : ""}`, csv: (r) => `${r.product} ${r.color} ${r.design}` },
    { label: "Rods", render: (r) => r.rods.map((x) => x.code).join(", ") || "—", csv: (r) => r.rods.map((x) => x.code).join(" ") },
    { label: "Pieces", key: "pieces", align: "right" },
    { label: "Meters", key: "meters", render: (r) => num(r.meters), align: "right" },
    { label: "Amount", key: "amount", render: (r) => rs(r.amount), align: "right" },
    { label: "Weight kg", render: (r) => (r.first_in_batch ? weightText(r) : <span className="muted small">↑ weighed with above</span>), align: "right",
      csv: (r) => (r.first_in_batch ? r.weight_kg : "") },
    { label: "", noExport: true, render: (r) => <Btn kind="danger-ghost" onClick={() => del(r)}>Delete</Btn> },
  ];
  const t = (data || []).reduce((a, r) => ({ p: a.p + r.pieces, k: a.k + (r.first_in_batch ? r.weight_kg : 0), m: a.m + r.meters, amt: a.amt + r.amount }), { p: 0, k: 0, m: 0, amt: 0 });
  return (
    <Card title="Lot list" actions={<ExportBar rows={data} columns={cols} filename="lots" />}>
      <DateRange value={range} onChange={setRange} />
      <div className="filter-row">
        <Select value={weaverId} onChange={setWeaverId} placeholder="All weavers" options={(weavers || []).map((w) => ({ value: w.id, label: w.name }))} />
      </div>
      <ErrorBox msg={error} />
      <Table rows={data} columns={cols} empty="No lots in these dates."
        footer={[`${data?.length || 0} lots`, "", "", "", "", "", num(t.p, 0), num(t.m), rs(t.amt), num(t.k, 3), ""]} />
    </Card>
  );
}
