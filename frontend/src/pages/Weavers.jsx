import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import {
  PageHeader, Card, Field, Input, NumInput, Btn, Table, Badge, Choice,
  useData, useAction, confirmDelete, ErrorBox, Loading, Empty, Stat,
} from "../ui";
import { rs, kg, mtr, num, dt, today, ROD_STATUS } from "../format";
import Ledger from "../Ledger";
import { ExtraThreadForm, ExtraThreadList } from "./ExtraThread";

const blankWeaver = { name: "", phone: "", address: "", rate_per_meter: "", opening_balance: "", machine_count: "6", active: true };

function WeaverForm({ initial, onSaved, onCancel, isNew }) {
  const [f, setF] = useState(initial);
  const [run, busy] = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const body = { ...f, rate_per_meter: f.rate_per_meter === "" ? -1 : Number(f.rate_per_meter),
      opening_balance: Number(f.opening_balance || 0), machine_count: Number(f.machine_count || 0) };
    if (body.rate_per_meter < 0) body.rate_per_meter = undefined;
    const out = await run(() => (isNew ? api.post("/weavers", body) : api.put(`/weavers/${initial.id}`, body)),
      isNew ? `Weaver ${f.name} added` : "Weaver updated");
    if (out) onSaved(out);
  };
  return (
    <>
      <div className="form">
        <Field label="Weaver name" required><Input value={f.name} onChange={set("name")} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
        <Field label="Rate per meter (₹)" required hint="What you pay for 1 meter of cloth"><NumInput value={f.rate_per_meter} onChange={set("rate_per_meter")} /></Field>
        {isNew && <Field label="Number of machines" hint="Machines 1, 2, 3… are created for you"><NumInput value={f.machine_count} onChange={set("machine_count")} step="1" /></Field>}
        <Field label="Amount already owed to this weaver (₹)" hint="From your old book, on the day you start. Leave 0 if nothing.">
          <input className="inp num" type="number" inputMode="decimal" step="any" value={f.opening_balance} onChange={(e) => set("opening_balance")(e.target.value)} onWheel={(e) => e.target.blur()} />
        </Field>
        <Field label="Address"><Input value={f.address} onChange={set("address")} /></Field>
        {!isNew && <Field label="Status"><Choice value={f.active ? "y" : "n"} onChange={(v) => set("active")(v === "y")} options={[{ value: "y", label: "Working" }, { value: "n", label: "Not working" }]} /></Field>}
      </div>
      <div className="form-actions">
        <Btn big onClick={save} disabled={busy}>✓ {isNew ? "Add weaver" : "Save changes"}</Btn>
        {onCancel && <Btn kind="ghost" onClick={onCancel}>Cancel</Btn>}
      </div>
    </>
  );
}

export default function Weavers() {
  const { data, error, reload } = useData("/weavers");
  const [adding, setAdding] = useState(false);
  const nav = useNavigate();
  return (
    <div className="page">
      <PageHeader icon="👷" title="Weavers & machines" help="Each weaver, their machines and their pay rate. Tap a weaver to see everything about them.">
        {!adding && <Btn onClick={() => setAdding(true)}>+ Add weaver</Btn>}
      </PageHeader>
      {adding && (
        <Card title="Add a new weaver">
          <WeaverForm isNew initial={blankWeaver} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />
        </Card>
      )}
      <ErrorBox msg={error} />
      {!data ? <Loading /> : !data.length ? <Empty>No weavers yet. Press “+ Add weaver”.</Empty> : (
        <div className="person-grid">
          {data.map((w) => (
            <button key={w.id} type="button" className={`person ${w.active ? "" : "inactive"}`} onClick={() => nav(`/weavers/${w.id}`)}>
              <div className="person-top">
                <div className="avatar">{w.name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <div className="person-name">{w.name}</div>
                  <div className="muted small">{w.phone || "No phone"} · {rs(w.rate_per_meter)}/m {!w.active && "· Not working"}</div>
                </div>
              </div>
              <div className="person-facts">
                <span><b>{w.machines.length}</b> machines</span>
                <span><b>{w.rods_with_weaver}</b> rods with him</span>
                {w.extra_thread_kg !== 0 && <span><b>{kg(w.extra_thread_kg)}</b> extra thread</span>}
              </div>
              <div className={`person-due ${w.balance > 0 ? "due" : ""}`}>
                {w.balance > 0 ? `To pay: ${rs(w.balance)}` : w.balance < 0 ? `Advance given: ${rs(-w.balance)}` : "Fully paid"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function WeaverDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: w, error, reload } = useData(`/weavers/${id}`);
  const { data: ledger, reload: reloadLedger } = useData(`/weavers/${id}/ledger`);
  const { data: rods, reload: reloadRods } = useData(`/rods?weaver_id=${id}&status=with_weaver`);
  const [editing, setEditing] = useState(false);
  const [machineForm, setMachineForm] = useState(null);
  const [giving, setGiving] = useState(false);
  const [threadKey, setThreadKey] = useState(0);
  const [run, busy] = useAction();

  if (error) return <div className="page"><ErrorBox msg={error} /></div>;
  if (!w) return <div className="page"><Loading /></div>;

  const saveMachine = async () => {
    const m = machineForm;
    const body = { number: m.number, current_design: m.current_design, current_color: m.current_color, active: m.active };
    const out = await run(() => (m.id ? api.put(`/machines/${m.id}`, body) : api.post(`/weavers/${id}/machines`, body)),
      m.id ? "Machine updated" : "Machine added");
    if (out) { setMachineForm(null); reload(); }
  };
  const delMachine = async (m) => {
    if (!confirmDelete(`Machine ${m.number}`)) return;
    if (await run(() => api.del(`/machines/${m.id}`), "Machine deleted")) reload();
  };
  const delWeaver = async () => {
    if (!confirmDelete(`weaver ${w.name}`)) return;
    if (await run(() => api.del(`/weavers/${w.id}`), "Weaver deleted")) nav("/weavers");
  };
  const nextNo = String(w.machines.reduce((mx, m) => Math.max(mx, parseInt(m.number, 10) || 0), 0) + 1);

  return (
    <div className="page">
      <Link className="back no-print" to="/weavers">← All weavers</Link>
      <PageHeader icon="👷" title={w.name} help={`${w.phone || "No phone"} · ${rs(w.rate_per_meter)} per meter${w.active ? "" : " · Not working"}`}>
        <Btn kind="ghost" onClick={() => setEditing((e) => !e)}>✎ Edit</Btn>
        <Btn kind="ghost" onClick={() => setGiving((g) => !g)}>🧵 Give thread</Btn>
        <Link className="btn primary" to={`/payments?tab=pay&weaver=${w.id}`}>💰 Pay</Link>
      </PageHeader>

      {editing && (
        <Card title="Edit weaver">
          <WeaverForm initial={{ ...w, machine_count: 0 }} onCancel={() => setEditing(false)}
            onSaved={() => { setEditing(false); reload(); reloadLedger(); }} />
          <div className="danger-zone"><Btn kind="danger-ghost" onClick={delWeaver}>Delete this weaver</Btn>
            <span className="hint">Only possible if no rods, lots or payments are recorded. Otherwise set status to “Not working”.</span></div>
        </Card>
      )}

      <div className="stats">
        <Stat label="To pay now" value={rs(w.balance)} tone={w.balance > 0 ? "red" : "green"} />
        <Stat label="Since last payment" value={mtr(w.since_last_payment.meters)}
          sub={`${w.since_last_payment.lots} lots · ${rs(w.since_last_payment.amount)} · last paid ${dt(w.since_last_payment.last_payment_date)}`} />
        <Stat label="Rods with this weaver" value={w.rods_with_weaver} tone="amber" />
        <Stat label="Extra thread with him" value={kg(w.extra_thread_kg)} tone="amber" sub="Given − taken back" onClick={() => setGiving(true)} />
      </div>

      <Card title="Machines" actions={<Btn kind="ghost" onClick={() => setMachineForm({ number: nextNo, current_design: "", current_color: "", active: true })}>+ Add machine</Btn>}>
        {machineForm && (
          <div className="inline-form">
            <div className="form">
              <Field label="Machine number" required><Input value={machineForm.number} onChange={(v) => setMachineForm((m) => ({ ...m, number: v }))} /></Field>
              <Field label="Colour running now"><Input value={machineForm.current_color} onChange={(v) => setMachineForm((m) => ({ ...m, current_color: v }))} /></Field>
              <Field label="Design running now"><Input value={machineForm.current_design} onChange={(v) => setMachineForm((m) => ({ ...m, current_design: v }))} /></Field>
              <Field label="Status"><Choice value={machineForm.active ? "y" : "n"} onChange={(v) => setMachineForm((m) => ({ ...m, active: v === "y" }))} options={[{ value: "y", label: "Working" }, { value: "n", label: "Stopped" }]} /></Field>
            </div>
            <div className="form-actions"><Btn onClick={saveMachine} disabled={busy}>✓ Save machine</Btn><Btn kind="ghost" onClick={() => setMachineForm(null)}>Cancel</Btn></div>
          </div>
        )}
        <Table rows={w.machines} empty="No machines. Press “+ Add machine”." columns={[
          { label: "Machine", render: (m) => <b>Machine {m.number}</b> },
          { label: "Colour now", render: (m) => m.current_color || "—" },
          { label: "Design now", render: (m) => m.current_design || "—" },
          { label: "Status", render: (m) => <Badge cls={m.active ? "b-green" : "b-grey"}>{m.active ? "Working" : "Stopped"}</Badge> },
          { label: "", render: (m) => <div className="row-actions"><Btn kind="ghost" onClick={() => setMachineForm(m)}>Edit</Btn><Btn kind="danger-ghost" onClick={() => delMachine(m)}>Delete</Btn></div> },
        ]} />
        <p className="hint">The colour/design updates by itself when you give a rod to a machine.</p>
      </Card>

      <Card title="Rods with this weaver now">
        <Table rows={rods} empty="No rods with this weaver right now." columns={[
          { label: "Rod", render: (r) => <b>{r.code}</b> },
          { label: "Machine", render: (r) => (r.machine_number ? `Machine ${r.machine_number}` : "—") },
          { label: "Thread", render: (r) => `${r.thread_type} · ${r.color}` },
          { label: "Design", key: "design" },
          { label: "Net kg", render: (r) => kg(r.net_weight), align: "right" },
          { label: "Given on", render: (r) => dt(r.issue_date) },
          { label: "Woven so far", render: (r) => `${num(r.meters_woven)} m`, align: "right" },
          { label: "Status", render: (r) => <Badge cls={ROD_STATUS[r.status].cls}>{ROD_STATUS[r.status].label}</Badge> },
          { label: "", render: (r) => <Btn kind="ghost" onClick={async () => {
              if (window.confirm(`Mark rod ${r.code} as finished?`) &&
                await run(() => api.post(`/rods/${r.id}/finish`, { date: today() }), "Rod marked finished")) { reloadRods(); reload(); }
            }}>Finished</Btn> },
        ]} />
      </Card>

      {giving && <ExtraThreadForm fixedWeaverId={w.id} onSaved={() => { setThreadKey((k) => k + 1); reload(); }} />}
      <ExtraThreadList weaverId={w.id} refreshKey={threadKey} onChanged={reload} />

      <Card title="Account (lots and payments)">
        <Ledger data={ledger} plusLabel="Earned" minusLabel="Paid" balanceLabel="To pay" filename={`weaver-${w.name}`} />
      </Card>
    </div>
  );
}
