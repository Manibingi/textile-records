import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, qs } from "../api";
import {
  PageHeader, Tabs, Card, Field, Input, NumInput, DateInput, Select, CalcBox, Btn, Table, ExportBar, Badge,
  useData, useAction, useTab, confirmDelete, ErrorBox, Empty,
} from "../ui";
import { kg, num, dt, today, n, ROD_STATUS } from "../format";
import ExtraThreadTab from "./ExtraThread";

const LAST_ROD_WEIGHT = "last-rod-weight";

export default function Rods() {
  const [tab, setTab] = useTab("new");
  return (
    <div className="page">
      <PageHeader icon="🧶" step="2 – 4" title="Rods & thread to weavers"
        help="Wind thread on a steel rod to make a design, give rods to weavers, and record any extra thread you give them." />
      <Tabs value={tab} onChange={setTab} tabs={[["new", "+ Wind new rod"], ["issue", "Give rods to weaver"], ["thread", "Give extra thread"], ["list", "All rods"]]} />
      {tab === "new" && <WindForm />}
      {tab === "issue" && <IssueForm />}
      {tab === "thread" && <ExtraThreadTab />}
      {tab === "list" && <RodList />}
    </div>
  );
}

function readLastWeight() {
  try { return localStorage.getItem(LAST_ROD_WEIGHT) || ""; } catch { return ""; }
}

const blankColor = () => ({ color: "", kg: "" });

function WindForm() {
  const { data: settings } = useData("/settings");
  const { data: stock, reload } = useData("/thread-stock");
  const blank = (keep = {}) => ({
    date: keep.date || today(), thread_type: keep.thread_type || "", design: keep.design || "",
    gross_weight: "", rod_weight: keep.rod_weight || readLastWeight(), length_m: keep.length_m || "", notes: "",
    // colour names of the last rod carry over (white plus one more is the usual design); weights are typed again
    colors: keep.colors ? keep.colors.map((c) => ({ color: c.color, kg: "" })) : [blankColor()],
  });
  const [f, setF] = useState(blank());
  const [saved, setSaved] = useState(null);
  const [run, busy] = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const setColor = (i, k, v) => setF((x) => ({ ...x, colors: x.colors.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
  const removeColor = (i) => setF((x) => ({ ...x, colors: x.colors.filter((_, j) => j !== i) }));
  const addColor = () => setF((x) => ({ ...x, colors: [...x.colors, blankColor()] }));
  // a stock colour chip fills the first empty colour line, or adds one, unless the colour is already on the rod
  const pickColor = (name) => setF((x) => {
    const same = (c) => c.color.trim().toLowerCase() === name.toLowerCase();
    if (x.colors.some(same)) return x;
    const empty = x.colors.findIndex((c) => !c.color.trim());
    if (empty >= 0) return { ...x, colors: x.colors.map((c, j) => (j === empty ? { ...c, color: name } : c)) };
    return { ...x, colors: [...x.colors, { color: name, kg: "" }] };
  });

  useEffect(() => {
    if (!settings) return;
    setF((x) => ({
      ...x,
      length_m: x.length_m || settings.default_rod_length || "549",
      rod_weight: x.rod_weight || settings.default_rod_weight || "",
    }));
  }, [settings]);

  const sameThread = (s) => s.thread_type.toLowerCase() === f.thread_type.trim().toLowerCase();
  const inStock = (name) => (stock || []).find((s) => sameThread(s) && s.color.toLowerCase() === name.trim().toLowerCase());
  const threads = [...new Set((stock || []).filter((s) => s.stock_kg > 0).map((s) => s.thread_type))];
  const colourChips = (stock || []).filter((s) => s.stock_kg > 0 && f.thread_type && sameThread(s));

  const net = n(f.gross_weight) - n(f.rod_weight);
  const colorRows = f.colors.filter((c) => c.color.trim() || c.kg !== "");
  const colorTotal = colorRows.reduce((s, c) => s + n(c.kg), 0);
  // the colour weights must equal the net thread to 3 decimals, the same test the server makes
  const colorsMatch = Math.round(colorTotal * 1000) === Math.round(net * 1000);

  const save = async () => {
    if (colorRows.some((c) => !c.color.trim() || !(n(c.kg) > 0))) {
      return run(() => Promise.reject(new Error("Each colour needs a name and a weight.")));
    }
    const colors = colorRows.map((c) => ({ color: c.color, kg: n(c.kg) }));
    const out = await run(() => api.post("/rods", { ...f, colors, length_m: f.length_m || 549 }));
    if (out) {
      try { localStorage.setItem(LAST_ROD_WEIGHT, f.rod_weight); } catch { /* ignore */ }
      setSaved(out);
      setF(blank(f));
      reload();
    }
  };

  return (
    <>
      {saved && (
        <div className="saved-banner">
          <div>
            <div className="saved-code">{saved.code}</div>
            <div>Rod saved · {saved.thread_type} {saved.color} {saved.design && `· ${saved.design}`} · Net thread <b>{kg(saved.net_weight)}</b></div>
            <div className="hint">Write <b>{saved.code}</b> on a tag and tie it to the rod.</div>
            {saved.warning && <div className="warn-text">⚠ {saved.warning}</div>}
          </div>
          <Link className="btn ghost" to="/rods?tab=issue">Give to weaver →</Link>
        </div>
      )}
      <Card title="Wind a new rod">
        {threads.length > 0 && (
          <div className="pick">
            <div className="field-label">Choose thread from stock (or type below)</div>
            <div className="chips">
              {threads.map((t) => (
                <button key={t} type="button"
                  className={`chip big ${sameThread({ thread_type: t }) ? "on" : ""}`}
                  onClick={() => set("thread_type")(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="form">
          <Field label="Date" required><DateInput value={f.date} onChange={set("date")} /></Field>
          <Field label="Thread type" required><Input value={f.thread_type} onChange={set("thread_type")} /></Field>
          <Field label="Design name" hint="e.g. Check, Plain, Border"><Input value={f.design} onChange={set("design")} /></Field>
          <Field label="Total weight (rod + thread) kg" required><NumInput value={f.gross_weight} onChange={set("gross_weight")} /></Field>
          <Field label="Steel rod weight kg" required hint="Remembered for next time"><NumInput value={f.rod_weight} onChange={set("rod_weight")} /></Field>
          <Field label="Thread length (meters)" hint="Normally 549 m — change only if different"><NumInput value={f.length_m} onChange={set("length_m")} /></Field>
          <Field label="Notes"><Input value={f.notes} onChange={set("notes")} placeholder="Optional" /></Field>
        </div>
        <CalcBox label="Net thread weight (calculated)"
          formula={`${num(f.gross_weight, 3)} kg − ${num(f.rod_weight, 3)} kg`}
          result={f.gross_weight && net <= 0 ? "Total weight must be more than rod weight" : kg(net > 0 ? net : 0)}
          tone={f.gross_weight && net <= 0 ? "red" : "blue"} />

        <div className="field-label" style={{ marginTop: 12 }}>Colours used in this rod</div>
        <div className="hint">White plus one colour, or white with two or three colours. Type each colour's weight.</div>
        {colourChips.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {colourChips.map((s) => (
              <button key={s.color} type="button"
                className={`chip ${f.colors.some((c) => c.color.trim().toLowerCase() === s.color.toLowerCase()) ? "on" : ""}`}
                onClick={() => pickColor(s.color)}>
                {s.color} <small>({kg(s.stock_kg)})</small>
              </button>
            ))}
          </div>
        )}
        <div className="bill-items">
          {f.colors.map((c, i) => {
            const m = c.color.trim() && f.thread_type && inStock(c.color);
            return (
              <div key={i} className="color-line">
                <Field label="Colour" hint={m ? `In stock: ${kg(m.stock_kg)}` : c.color.trim() && f.thread_type ? "Not found in stock" : ""}>
                  <Input value={c.color} onChange={(v) => setColor(i, "color", v)} placeholder="e.g. White" />
                </Field>
                <Field label="Thread weight kg"><NumInput value={c.kg} onChange={(v) => setColor(i, "kg", v)} /></Field>
                {f.colors.length > 1 && <button type="button" className="x-btn" aria-label="Remove colour" onClick={() => removeColor(i)}>✕</button>}
              </div>
            );
          })}
        </div>
        <Btn kind="ghost" onClick={addColor}>+ Add another colour</Btn>
        <CalcBox label="Colours add up to (calculated)"
          formula={colorRows.length ? `${colorRows.map((c) => `${c.color.trim() || "?"} ${num(c.kg, 3)} kg`).join(" + ")} = ${num(colorTotal, 3)} kg` : "Type each colour and its weight"}
          result={!colorRows.length || net <= 0 ? "" : colorsMatch ? `Matches net thread ${kg(net)} ✓` : `Must add up to ${kg(net)}`}
          tone={!colorRows.length || net <= 0 ? "blue" : colorsMatch ? "green" : "red"} />
        <div className="form-actions"><Btn big onClick={save} disabled={busy}>✓ Save rod</Btn></div>
      </Card>
    </>
  );
}

const machineBusy = (m) => (m.running_rods || []).length > 0;
const busyLabel = (m) => {
  const r = m.running_rods || [];
  return `Machine ${m.number} · busy: rod${r.length > 1 ? "s" : ""} ${r.join(", ")} not finished`;
};

function IssueForm() {
  const { data: weavers, reload: reloadWeavers } = useData("/weavers");
  const { data: rods, reload } = useData("/rods?status=in_stock");
  const [weaverId, setWeaverId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [date, setDate] = useState(today());
  const [picked, setPicked] = useState([]);
  const [run, busy] = useAction();
  const weaver = (weavers || []).find((w) => String(w.id) === String(weaverId));
  const machines = (weaver?.machines || []).filter((m) => m.active);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = async () => {
    const out = await run(() => api.post("/rods/issue", { rod_ids: picked, weaver_id: Number(weaverId) || 0, machine_id: Number(machineId) || null, date }),
      (r) => `${r.length} rod(s) given to ${weaver?.name}`);
    if (out) { setPicked([]); setMachineId(""); reload(); reloadWeavers(); }
  };
  const allBusy = machines.length > 0 && machines.every(machineBusy);
  const machineHint = weaver && !machines.length ? "This weaver has no machines yet"
    : allBusy ? 'All machines of this weaver have a rod that is not finished. Mark a rod finished in "All rods" first.' : "";

  return (
    <Card title="Give rods to a weaver">
      <div className="form">
        <Field label="Weaver" required>
          <Select value={weaverId} onChange={(v) => { setWeaverId(v); setMachineId(""); }}
            options={(weavers || []).filter((w) => w.active).map((w) => ({ value: w.id, label: w.name }))} />
        </Field>
        <Field label="Machine" hint={machineHint}>
          <Select value={machineId} onChange={setMachineId} placeholder="— Choose machine —"
            options={machines.map((m) => (machineBusy(m)
              ? { value: m.id, label: busyLabel(m), disabled: true }
              : { value: m.id, label: `Machine ${m.number}${m.current_color ? ` (now: ${m.current_color} ${m.current_design})` : ""}` }))} />
        </Field>
        <Field label="Date given" required><DateInput value={date} onChange={setDate} /></Field>
      </div>
      {weavers && !weavers.length && <div className="notice">Add your weavers first in <Link to="/weavers">Weavers & machines</Link>.</div>}

      <div className="field-label" style={{ marginTop: 8 }}>Tick the rods you are giving</div>
      {!rods ? null : !rods.length ? (
        <Empty>No rods in stock. <Link to="/rods?tab=new">Wind a new rod</Link> first.</Empty>
      ) : (
        <div className="tick-grid">
          {rods.map((r) => (
            <label key={r.id} className={`tick-card ${picked.includes(r.id) ? "on" : ""}`}>
              <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />
              <div>
                <div className="tick-title">{r.code}</div>
                <div>{r.thread_type} · <b>{r.color}</b>{r.design && ` · ${r.design}`}</div>
                <div className="muted small">{kg(r.net_weight)} · {num(r.length_m, 0)} m · {dt(r.date)}</div>
              </div>
            </label>
          ))}
        </div>
      )}
      <div className="form-actions">
        <Btn big onClick={save} disabled={busy || !picked.length || !weaverId}>
          🤝 Give {picked.length || ""} rod{picked.length === 1 ? "" : "s"}{weaver ? ` to ${weaver.name}` : ""}
        </Btn>
      </div>
    </Card>
  );
}

function RodList() {
  const [, , sp] = useTab("list");
  const [status, setStatus] = useState(sp.get("status") || "");
  const { data, error, reload } = useData(`/rods${qs({ status })}`);
  const [run] = useAction();
  const act = async (r, what) => {
    if (what === "delete") {
      if (!confirmDelete(`rod ${r.code}`)) return;
      if (await run(() => api.del(`/rods/${r.id}`), `Rod ${r.code} deleted`)) reload();
    } else if (what === "finish") {
      if (!window.confirm(`Mark rod ${r.code} as finished (thread used up)?`)) return;
      if (await run(() => api.post(`/rods/${r.id}/finish`, { date: today() }), `Rod ${r.code} marked finished`)) reload();
    } else if (what === "return") {
      if (!window.confirm(`Take rod ${r.code} back from ${r.weaver_name} into stock?`)) return;
      if (await run(() => api.post(`/rods/${r.id}/return`), `Rod ${r.code} is back in stock`)) reload();
    } else if (what === "reopen") {
      if (await run(() => api.post(`/rods/${r.id}/reopen`), `Rod ${r.code} is with the weaver again`)) reload();
    }
  };
  const cols = [
    { label: "Rod", key: "code", render: (r) => <b>{r.code}</b> },
    { label: "Wound on", key: "date", render: (r) => dt(r.date), csv: (r) => dt(r.date) },
    { label: "Thread", render: (r) => `${r.thread_type} · ${r.color}`, csv: (r) => `${r.thread_type} ${r.color}` },
    { label: "Design", key: "design" },
    { label: "Net kg", key: "net_weight", render: (r) => num(r.net_weight, 3), align: "right" },
    { label: "Status", key: "status", render: (r) => <Badge cls={ROD_STATUS[r.status].cls}>{ROD_STATUS[r.status].label}</Badge>, csv: (r) => ROD_STATUS[r.status].label },
    { label: "Weaver / machine", render: (r) => (r.weaver_name ? `${r.weaver_name}${r.machine_number ? ` · M${r.machine_number}` : ""}` : "—"),
      csv: (r) => r.weaver_name ? `${r.weaver_name} M${r.machine_number || ""}` : "" },
    { label: "Given on", render: (r) => dt(r.issue_date), csv: (r) => dt(r.issue_date) },
    { label: "Cloth woven", render: (r) => (r.lots.length ? `${num(r.meters_woven)} m (${r.lots.length} lots)` : "—"), align: "right", csv: (r) => r.meters_woven },
    {
      label: "", noExport: true, render: (r) => (
        <div className="row-actions">
          {r.status === "with_weaver" && <Btn kind="ghost" onClick={() => act(r, "finish")}>Finished</Btn>}
          {r.status === "with_weaver" && !r.lots.length && <Btn kind="ghost" onClick={() => act(r, "return")}>Back to stock</Btn>}
          {r.status === "finished" && <Btn kind="ghost" onClick={() => act(r, "reopen")}>Undo finish</Btn>}
          {!r.lots.length && r.status === "in_stock" && <Btn kind="danger-ghost" onClick={() => act(r, "delete")}>Delete</Btn>}
        </div>
      ),
    },
  ];
  const totalKg = useMemo(() => (data || []).reduce((s, r) => s + r.net_weight, 0), [data]);
  return (
    <Card title="All rods" actions={<ExportBar rows={data} columns={cols} filename="rods" />}>
      <div className="chips" style={{ marginBottom: 12 }}>
        {[["", "All"], ["in_stock", "In stock"], ["with_weaver", "With weavers"], ["finished", "Finished"]].map(([v, l]) => (
          <button key={v} type="button" className={`chip ${status === v ? "on" : ""}`} onClick={() => setStatus(v)}>{l}</button>
        ))}
      </div>
      <ErrorBox msg={error} />
      <Table rows={data} columns={cols} empty="No rods here." footer={[`${data?.length || 0} rods`, "", "", "", num(totalKg, 3), "", "", "", "", ""]} />
    </Card>
  );
}
