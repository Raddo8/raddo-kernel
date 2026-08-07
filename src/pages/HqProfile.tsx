/** PROFILE · /hq/profile
 *
 * Who you are here, and one thing you can change: what you call your COB.
 * The name has one owner, tenants.cob_name. We read it with my_cob() and set
 * it with set_my_cob_name(), which normalizes server side. This page shows the
 * normalized result back so nothing is a surprise.
 */
import { useEffect, useState } from "react";

import { HqShell } from "@/components/hq/HqShell";
import { useCob } from "@/lib/cob-identity";
import { supabase } from "@/integrations/supabase/client";
import "@/hq-next/styles/hq-lanes.css";

const DOT = "\u00b7";

type SaveResult = { ok?: boolean; cob_name?: string; previous?: string; reason?: string };

function ProfileBody() {
  const { cid, cobName, displayName, principal, status, loading, refresh } = useCob();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (cobName) setValue(cobName);
  }, [cobName]);

  const save = async () => {
    setBusy(true);
    setNote(null);
    setErr(null);
    const { data, error } = await supabase.rpc("set_my_cob_name", { p_name: value });
    setBusy(false);
    if (error) {
      setErr("That did not save. Try again in a moment.");
      return;
    }
    const res = (Array.isArray(data) ? data[0] : data) as SaveResult;
    if (!res?.ok) {
      setErr(
        res?.reason === "name-too-short"
          ? "Give the name at least two characters."
          : res?.reason === "not-enrolled"
            ? "This account is not enrolled yet."
            : "That name was not accepted.",
      );
      return;
    }
    setValue(res.cob_name ?? value);
    setNote(
      res.previous && res.previous !== res.cob_name
        ? `Saved as ${res.cob_name}. It was ${res.previous}.`
        : `Saved as ${res.cob_name}.`,
    );
    await refresh();
  };

  return (
    <div className="wld">
      <div className="crumb">HQ {DOT} profile</div>
      <h1>Profile</h1>

      <div className="article">
        <div>
          <p className="lead">
            This is who you are here, and the one thing on this page you can change yourself.
          </p>

          <div className="secname">Your account</div>
          <table className="wtab">
            <tbody>
              <tr>
                <td>
                  <b>Signed in as</b>
                </td>
                <td>{loading ? "" : (principal ?? "not resolved")}</td>
              </tr>
              <tr>
                <td>
                  <b>Company</b>
                </td>
                <td>{loading ? "" : (displayName ?? "not set")}</td>
              </tr>
              <tr>
                <td>
                  <b>Account number</b>
                </td>
                <td>{loading ? "" : (cid ?? "not resolved")}</td>
              </tr>
              <tr>
                <td>
                  <b>Status</b>
                </td>
                <td>{loading ? "" : (status ?? "unknown")}</td>
              </tr>
            </tbody>
          </table>

          <div className="secname">What you call your COB</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <label className="sr-only" htmlFor="cobname">
              The name you use
            </label>
            <input
              id="cobname"
              value={value}
              maxLength={40}
              onChange={(e) => setValue(e.target.value)}
              style={{
                flex: "1 1 220px",
                minWidth: 0,
                padding: "10px 13px",
                border: "1px solid var(--edge)",
                borderRadius: 8,
                fontFamily: "inherit",
                fontSize: 15,
                fontWeight: 700,
              }}
            />
            <button type="button" className="ask" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving" : "Save the name"}
            </button>
          </div>
          <p className="plain" style={{ marginTop: 8, fontSize: 12.5 }}>
            Letters, numbers, spaces, apostrophes and hyphens. Up to 40 characters. It is saved in
            capitals.
          </p>
          <p className="plain" style={{ marginTop: 6, fontSize: 12.5 }}>
            Naming your COB is something you can also just say to them in the dock.
          </p>
          {note && <p className="plain" style={{ marginTop: 8 }}>{note}</p>}
          {err && <p className="plain" style={{ marginTop: 8, color: "#8C2F2F" }}>{err}</p>}
        </div>

        <aside className="infobox">
          <div className="ih">Name in use</div>
          <div className="irow">
            <div className="k">Now</div>
            <div className="v">
              <b>{cobName ?? ""}</b>
            </div>
          </div>
          <div className="irow">
            <div className="k">Shows up</div>
            <div className="v">In the menu, in the dock, and anywhere they speak to you.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function HqProfile() {
  return (
    <HqShell>
      <ProfileBody />
    </HqShell>
  );
}
