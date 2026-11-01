"use client";

import { useEffect, useRef, useState } from "react";

/** The notice popup that must be dismissed before the page can be used (chaos mode). */
export function NoticeModal({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) button.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="notice_title" id="notice_modal">
        <h2 id="notice_title">Important Notice</h2>
        {children}
        <div className="actions">
          <button ref={button} id="notice_close" type="button" className="btn primary" onClick={() => setOpen(false)}>
            I have read the notice
          </button>
        </div>
      </div>
    </div>
  );
}

interface Option {
  code: string;
  name: string;
}

/** State -> district -> institution dropdowns, filled from the portal's API (slowly, in chaos mode). */
export function DependentSelects({
  states,
  initial,
}: {
  states: Option[];
  initial: { state?: string; district?: string; institution?: string };
}) {
  const [state, setState] = useState(initial.state ?? "");
  const [district, setDistrict] = useState(initial.district ?? "");
  // Each list remembers which selection it was loaded for; a stale list renders as empty.
  const [districtData, setDistrictData] = useState<{ key: string; list: Option[] }>({ key: "", list: [] });
  const [institutionData, setInstitutionData] = useState<{ key: string; list: string[] }>({ key: "", list: [] });
  const institutionKey = `${state}|${district}`;
  const districts = districtData.key === state ? districtData.list : [];
  const institutions = institutionData.key === institutionKey ? institutionData.list : [];
  const loading = state && districtData.key !== state ? "district" : district && institutionData.key !== institutionKey ? "institution" : "";

  useEffect(() => {
    if (!state) return;
    let cancelled = false;
    fetch(`/demo-portal/api/districts?state=${encodeURIComponent(state)}`)
      .then((r) => r.json())
      .then((d: { districts: Option[] }) => {
        if (!cancelled) setDistrictData({ key: state, list: d.districts });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    if (!state || !district) return;
    let cancelled = false;
    const key = `${state}|${district}`;
    fetch(`/demo-portal/api/institutions?state=${encodeURIComponent(state)}&district=${encodeURIComponent(district)}`)
      .then((r) => r.json())
      .then((d: { institutions: string[] }) => {
        if (!cancelled) setInstitutionData({ key, list: d.institutions });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [state, district]);

  return (
    <>
      <tr>
        <td className="l">
          <label htmlFor="state">
            State <span className="req">*</span>
          </label>
        </td>
        <td>
          <select id="state" name="state" value={state} onChange={(e) => { setState(e.target.value); setDistrict(""); }} required>
            <option value="">-- Select --</option>
            {states.map((s) => (
              <option key={s.code} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </td>
      </tr>
      <tr>
        <td className="l">
          <label htmlFor="district">
            District <span className="req">*</span>
          </label>
        </td>
        <td>
          <select id="district" name="district" value={district} onChange={(e) => setDistrict(e.target.value)} required>
            <option value="">{loading === "district" ? "Loading..." : "-- Select --"}</option>
            {districts.map((d) => (
              <option key={d.code} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </td>
      </tr>
      <tr>
        <td className="l">
          <label htmlFor="institution">
            Institution <span className="req">*</span>
          </label>
        </td>
        <td>
          <select id="institution" name="institution" defaultValue={initial.institution ?? ""} required key={`${state}-${district}-${institutions.length}`}>
            <option value="">{loading === "institution" ? "Loading..." : "-- Select --"}</option>
            {institutions.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </td>
      </tr>
    </>
  );
}
