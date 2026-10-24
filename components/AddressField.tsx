"use client";
// Address box with Google suggestions. Picking one works out the driving distance and the travel fee right away.
import { useEffect, useRef, useState } from "react";

export type Place = { address: string; placeId: string | null; km: number | null; minutes: number | null; fee: number | null; freeKm: number };
type Sug = { placeId: string; main: string; secondary: string };

const newSession = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export default function AddressField({ value, onChange, onPlace, label, placeholder, inputClass, inputStyle, labelClass, owner = false }: {
  value: string; onChange: (v: string) => void; onPlace: (p: Place | null) => void;
  label: string; placeholder?: string; inputClass: string; inputStyle?: React.CSSProperties; labelClass?: string; owner?: boolean;
}) {
  const [sugs, setSugs] = useState<Sug[]>([]); const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null); const [looking, setLooking] = useState(false); const [ready, setReady] = useState(true);
  const session = useRef(newSession()); const picked = useRef(false); const lastLooked = useRef("");

  // suggestions while typing
  useEffect(() => {
    if (picked.current || value.trim().length < 3) { setSugs([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/os/address?q=${encodeURIComponent(value)}&s=${session.current}`).then((r) => r.json())
        .then((j) => { setReady(j.ready !== false); setSugs(j.suggestions || []); setOpen(true); }).catch(() => setSugs([]));
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  async function look(q: string) {
    setLooking(true);
    const j = await fetch(`/api/os/address?${q}&s=${session.current}`).then((r) => r.json()).catch(() => null);
    setLooking(false);
    if (!j || j.ready === false) { setReady(false); onPlace(null); return; }
    const p: Place = { address: j.address || value, placeId: j.placeId ?? null, km: j.km ?? null, minutes: j.minutes ?? null, fee: j.fee ?? null, freeKm: j.freeKm ?? 30 };
    setPlace(p); onPlace(p);
    return p;
  }

  async function pick(s: Sug) {
    picked.current = true; setOpen(false); setSugs([]);
    const text = [s.main, s.secondary].filter(Boolean).join(", ");
    onChange(text);
    const p = await look(`place=${encodeURIComponent(s.placeId)}`);
    if (p?.address) { onChange(p.address); lastLooked.current = p.address; }
    session.current = newSession();
  }

  // a saved / known address: check its distance as soon as the box shows
  useEffect(() => {
    const v = value.trim();
    if (v.length >= 8) { lastLooked.current = v; picked.current = true; look(`addr=${encodeURIComponent(v)}`); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // typed but didn't pick: check the distance when they leave the box
  function blur() {
    setTimeout(() => setOpen(false), 150);
    const v = value.trim();
    if (!picked.current && ready && v.length >= 8 && v !== lastLooked.current) { lastLooked.current = v; look(`addr=${encodeURIComponent(v)}`); }
  }

  const status = looking ? "Checking the distance…"
    : !place ? null
    : place.km == null ? "We couldn't find that address on the map. Pick one from the list if you can, otherwise we'll confirm any travel fee with you."
    : place.fee ? `${place.km} km away. Travel fee $${place.fee} (free within ${place.freeKm} km).`
    : `${place.km} km away. No travel fee.`;

  return (
    <div className="relative">
      <label className={labelClass}>{label}
        <input value={value} placeholder={placeholder} autoComplete="street-address" className={inputClass} style={inputStyle}
          onChange={(e) => { picked.current = false; setPlace(null); onPlace(null); onChange(e.target.value); }}
          onFocus={() => sugs.length && setOpen(true)} onBlur={blur}
          role="combobox" aria-expanded={open && sugs.length > 0} aria-autocomplete="list" aria-controls="address-suggestions" />
      </label>
      {open && sugs.length > 0 && (
        <ul id="address-suggestions" role="listbox" className="absolute z-30 left-0 right-0 mt-1 bg-white rounded-xl border shadow-lg overflow-hidden" style={{ borderColor: "#c8d0e0" }}>
          {sugs.map((s) => (
            <li key={s.placeId} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)} className="w-full text-left px-3 py-2.5 border-t first:border-t-0 active:bg-[#f4f6fa]" style={{ borderColor: "#eef1f6" }}>
                <span className="block font-semibold text-[15px] text-[#0d1b3e]">{s.main}</span>
                <span className="block text-xs text-[#4a5878]">{s.secondary}</span>
              </button>
            </li>
          ))}
          <li className="px-3 py-1 text-[10px] text-right text-[#8a94ab]">powered by Google</li>
        </ul>
      )}
      {status && <p className={`mt-1.5 text-sm ${place?.fee ? "font-semibold text-[#8a5a00]" : "text-[#4a5878]"}`} aria-live="polite">{status}{owner && place?.minutes ? ` About ${place.minutes} min drive.` : ""}</p>}
    </div>
  );
}
