import { useEffect, useState } from "react";
import { api } from "../api";
import { PageHeader, Card, Field, Input, NumInput, Btn, useData, useAction, Loading } from "../ui";

export default function Settings() {
  const { data } = useData("/settings");
  const [f, setF] = useState(null);
  const [run, busy] = useAction();
  useEffect(() => { if (data) setF(data); }, [data]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (await run(() => api.put("/settings", f), "Settings saved")) setTimeout(() => window.location.reload(), 600);
  };

  return (
    <div className="page">
      <PageHeader icon="⚙️" title="Settings & backup" />
      <Card title="Business details" >
        <p className="hint">Printed on bills and weaver payment slips.</p>
        {!f ? <Loading /> : (
          <>
            <div className="form">
              <Field label="Business name"><Input value={f.business_name} onChange={set("business_name")} /></Field>
              <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
              <Field label="GST number"><Input value={f.gstin} onChange={set("gstin")} /></Field>
              <Field label="Address" wide><Input value={f.address} onChange={set("address")} /></Field>
              <Field label="Standard thread length per rod (m)"><NumInput value={f.default_rod_length} onChange={set("default_rod_length")} /></Field>
              <Field label="Standard steel rod weight (kg)" hint="Filled in automatically on the rod form"><NumInput value={f.default_rod_weight} onChange={set("default_rod_weight")} /></Field>
              <Field label="Weight of 1 empty plastic comb (kg)" hint="Filled in automatically on the extra thread form"><NumInput value={f.default_comb_weight} onChange={set("default_comb_weight")} /></Field>
            </div>
            <div className="form-actions"><Btn big onClick={save} disabled={busy}>✓ Save settings</Btn></div>
          </>
        )}
      </Card>

      <Card title="Backup — keep your records safe">
        <p>Every time the app starts, it keeps a copy of all records for that day (last 30 days) in the <code>backend/data/backups</code> folder.</p>
        <p>Also download a backup once a week and keep it on a pen drive or in Google Drive / email, so nothing is lost even if the computer breaks.</p>
        <a className="btn primary big" href="/api/backup" download>⬇ Download backup now</a>
        <details className="help">
          <summary>How to bring back records from a backup</summary>
          <ol>
            <li>Close the app (close the black window).</li>
            <li>Open the folder <code>backend/data</code>.</li>
            <li>Rename the backup file to <code>textile.db</code> and put it there, replacing the old file.</li>
            <li>Start the app again.</li>
          </ol>
        </details>
      </Card>
    </div>
  );
}
