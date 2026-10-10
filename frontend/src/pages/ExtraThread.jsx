import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, qs } from "../api";
import {
  Card, Field, Input, NumInput, DateInput, Select, Btn, Table, ExportBar, Choice, Badge, Stat, CalcBox,
  useData, useAction, confirmDelete, ErrorBox,
} from "../ui";
import { kg, num, dt, today, n } from "../format";

const LAST_COMB_WEIGHT = "last-comb-weight";
const readCombWeight = () => { try { return localStorage.getItem(LAST_COMB_WEIGHT) || ""; } catch { return ""; } };

const blank = (keep = {}) => ({
  date: keep.date || today(), weaver_id: keep.weaver_id || "", machine_id: "", thread_type: keep.thread_type || "",
  color: keep.color || "", combs: "", gross_weight: "", comb_weight: keep.comb_weight || readCombWeight(),
  kind: keep.kind || "given", notes: "",
});

/** Form: give loose / extra thread to a weaver (or note thread taken back). */
export function ExtraThreadForm({ fixedWeaverId, onSaved }) {
  const { data: weavers, reload: reloadWeavers } = useData("/weavers");
  const { data: stock, reload: reloadStock } = useData("/thread-stock");
  const { data: settings } = useData("/settings");
  const [f, setF] = useState(blank({ weaver_id: fixedWeaverId }));
  useEffect(() => {
    if (settings?.default_comb_weight) setF((x) => ({ ...x, comb_weight: x.comb_weight || settings.default_comb_weight }));
  }, [settings]);
  const [run, busy] = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const weaver = (weavers || []).find((w) => String(w.id) === String(f.weaver_id));
  const match = (stock || []).find((s) =>
    s.thread_type.toLowerCase() === f.thread_type.trim().toLowerCase() && s.color.toLowerCase() === f.color.trim().toLowerCase());
  const available = (stock || []).filter((s) => s.stock_kg > 0);
  const giving = f.kind === "given";
  const plastic = n(f.combs) * n(f.comb_weight);
  const net = n(f.gross_weight) - plastic;
  const netBad = f.gross_weight !== "" && net <= 0;
  const netKg = net > 0 ? net : 0;

  const save = async () => {
    const body = { ...f, weaver_id: Number(f.weaver_id) || 0, machine_id: Number(f.machine_id) || null,
      combs: n(f.combs), gross_weight: f.gross_weight === "" ? undefined : n(f.gross_weight), comb_weight: n(f.comb_weight) };
    const out = await run(() => api.post("/thread-issues", body),
      (t) => t.warning || `${giving ? "Given" : "Taken back"}: ${kg(t.quantity_kg)} ${t.thread_type} ${t.color} ${giving ? "to" : "from"} ${t.weaver_name}`);
    if (out) {
      try { localStorage.setItem(LAST_COMB_WEIGHT, f.comb_weight); } catch { /* ignore */ }
      setF(blank({ ...f, weaver_id: fixedWeaverId || f.weaver_id })); reloadStock(); reloadWeavers(); onSaved?.();
    }
  };

  return (
    <Card title={fixedWeaverId ? "Give extra thread" : "Give extra thread to a weaver"}>
      <p className="hint" style={{ marginTop: -8 }}>For loose thread given in addition to the rods. It is taken out of thread stock and added to what the weaver is holding.</p>
      <Choice value={f.kind} onChange={set("kind")} options={[{ value: "given", label: "➜ Giving thread" }, { value: "returned", label: "↩ Taking thread back" }]} />

      {giving && available.length > 0 && (
        <div className="pick" style={{ marginTop: 16 }}>
          <div className="field-label">Choose thread from stock (or type below)</div>
          <div className="chips">
            {available.map((s) => (
              <button key={s.thread_type + s.color} type="button" className={`chip big ${match === s ? "on" : ""}`}
                onClick={() => setF((x) => ({ ...x, thread_type: s.thread_type, color: s.color }))}>
                {s.thread_type} · {s.color} <small>({kg(s.stock_kg)})</small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="form" style={{ marginTop: 16 }}>
        {!fixedWeaverId && (
          <Field label="Weaver" required>
            <Select value={f.weaver_id} onChange={(v) => setF((x) => ({ ...x, weaver_id: v, machine_id: "" }))}
              options={(weavers || []).filter((w) => w.active).map((w) => ({ value: w.id, label: `${w.name}${w.extra_thread_kg ? ` (has ${kg(w.extra_thread_kg)})` : ""}` }))} />
          </Field>
        )}
        <Field label="Machine" hint="Optional">
          <Select value={f.machine_id} onChange={set("machine_id")} placeholder="— Any / not specific —"
            options={(weaver?.machines || []).map((m) => ({ value: m.id, label: `Machine ${m.number}${m.current_color ? ` (now: ${m.current_color})` : ""}` }))} />
        </Field>
        <Field label="Date" required><DateInput value={f.date} onChange={set("date")} /></Field>
        <Field label="Thread type" required><Input value={f.thread_type} onChange={set("thread_type")} /></Field>
        <Field label="Colour" required hint={giving && match ? `In stock: ${kg(match.stock_kg)}` : ""}><Input value={f.color} onChange={set("color")} /></Field>
        <Field label="Notes"><Input value={f.notes} onChange={set("notes")} placeholder="Optional, e.g. for weft / border" /></Field>
      </div>

      <div className="sub-head">Combs (plastic cones)</div>
      <div className="form">
        <Field label={giving ? "Number of combs given" : "Number of combs taken back"} required>
          <NumInput value={f.combs} onChange={set("combs")} step="1" />
        </Field>
        <Field label="Total weight of all combs (kg)" required hint="Weigh all combs together, with thread">
          <NumInput value={f.gross_weight} onChange={set("gross_weight")} />
        </Field>
        <Field label="Weight of 1 empty plastic comb (kg)" required hint="Remembered for next time">
          <NumInput value={f.comb_weight} onChange={set("comb_weight")} />
        </Field>
      </div>
      <CalcBox label="Net thread weight (calculated)" tone={netBad ? "red" : "blue"}
        formula={`${num(f.gross_weight, 3)} kg − (${num(f.combs, 0)} combs × ${num(f.comb_weight, 3)} kg) = ${num(f.gross_weight, 3)} − ${num(plastic, 3)}`}
        result={netBad ? "Total weight must be more than the plastic weight" : kg(netKg)} />
      {weaver && (
        <div className="calc green">
          <div className="calc-label">Extra thread with {weaver.name} after this</div>
          <div className="calc-formula">Now {kg(weaver.extra_thread_kg)} {giving ? "+" : "−"} {kg(netKg)}</div>
          <div className="calc-result">{kg(weaver.extra_thread_kg + (giving ? 1 : -1) * netKg)}</div>
        </div>
      )}
      <div className="form-actions">
        <Btn big onClick={save} disabled={busy}>✓ {giving ? "Save — thread given" : "Save — thread taken back"}</Btn>
      </div>
    </Card>
  );
}

/** List of extra-thread entries (optionally for one weaver). */
export function ExtraThreadList({ weaverId, refreshKey, onChanged }) {
  const { data, error, reload } = useData(`/thread-issues${qs({ weaver_id: weaverId, _: refreshKey })}`);
  const [run] = useAction();
  const del = async (t) => {
    if (!confirmDelete(`this entry (${kg(t.quantity_kg)} ${t.thread_type} ${t.color}, ${t.weaver_name})`)) return;
    if (await run(() => api.del(`/thread-issues/${t.id}`), "Entry deleted")) { reload(); onChanged?.(); }
  };
  const cols = [
    { label: "Date", key: "date", render: (r) => dt(r.date), csv: (r) => dt(r.date) },
    ...(weaverId ? [] : [{ label: "Weaver", key: "weaver_name", render: (r) => <Link className="link" to={`/weavers/${r.weaver_id}`}>{r.weaver_name}</Link> }]),
    { label: "Machine", render: (r) => (r.machine_number ? `M${r.machine_number}` : "—"), csv: (r) => r.machine_number || "" },
    { label: "Thread", render: (r) => `${r.thread_type} · ${r.color}`, csv: (r) => `${r.thread_type} ${r.color}` },
    { label: "Combs", key: "combs", render: (r) => (r.combs ? r.combs : "—"), align: "right" },
    { label: "Total kg", key: "gross_weight", render: (r) => (r.gross_weight ? num(r.gross_weight, 3) : "—"), align: "right" },
    { label: "Plastic kg", key: "plastic", render: (r) => (r.combs ? num(r.combs * r.comb_weight, 3) : "—"), align: "right",
      csv: (r) => (r.combs ? (r.combs * r.comb_weight).toFixed(3) : "") },
    { label: "", key: "kind", render: (r) => <Badge cls={r.kind === "given" ? "b-amber" : "b-green"}>{r.kind === "given" ? "Given" : "Taken back"}</Badge>,
      csv: (r) => (r.kind === "given" ? "Given" : "Taken back") },
    { label: "Net thread", key: "quantity_kg", render: (r) => <b>{r.kind === "given" ? "" : "−"}{kg(r.quantity_kg)}</b>, align: "right",
      csv: (r) => (r.kind === "given" ? r.quantity_kg : -r.quantity_kg) },
    { label: "Notes", key: "notes" },
    { label: "", noExport: true, render: (r) => <Btn kind="danger-ghost" onClick={() => del(r)}>Delete</Btn> },
  ];
  const net = (data || []).reduce((s, r) => s + (r.kind === "given" ? r.quantity_kg : -r.quantity_kg), 0);
  return (
    <Card title={weaverId ? "Extra thread given to this weaver" : "Extra thread history"}
      actions={<ExportBar rows={data} columns={cols} filename="extra-thread" />}>
      <ErrorBox msg={error} />
      <Table rows={data} columns={cols} empty="No extra thread given yet."
        footer={cols.map((c, i) => (i === 0 ? (weaverId ? "Net with this weaver" : "Net with weavers") : c.key === "quantity_kg" ? kg(net) : ""))} />
    </Card>
  );
}

/** Tab content on the Rods page. */
export default function ExtraThreadTab() {
  const [key, setKey] = useState(0);
  const { data: weavers } = useData(`/weavers?_=${key}`);
  const holding = (weavers || []).filter((w) => Math.abs(w.extra_thread_kg) > 0.0005);
  return (
    <>
      {holding.length > 0 && (
        <div className="stats">
          {holding.map((w) => <Stat key={w.id} label={`${w.name} is holding`} value={kg(w.extra_thread_kg)} tone="amber" />)}
        </div>
      )}
      <ExtraThreadForm onSaved={() => setKey((k) => k + 1)} />
      <ExtraThreadList refreshKey={key} onChanged={() => setKey((k) => k + 1)} />
    </>
  );
}
