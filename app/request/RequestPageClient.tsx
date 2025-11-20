'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  computeQuote,
  type VehicleClass,
  type ServiceType,
  ADDON_PRICES,
} from '@/lib/pricing';
import { detectClassFromModel } from '@/data/vehicleClass';
import { getVariants } from '@/data/variants';
import { track } from '@/lib/analytics';

// slots
type Slot = { value: string; label: string };

function m(h: number, min: number) {
  return h * 60 + min;
}

function buildSlotsForDate(dateStr: string): Slot[] {
  if (!dateStr) return [];
  const STEP_MIN = 30;
  const d = new Date(`${dateStr}T12:00:00`);
  const dow = d.getDay();
  let start = m(17, 0);
  let end = m(21, 0);
  if (dow === 2) start = m(16, 0);

  const out: Slot[] = [];
  for (let t = start; t <= end; t += STEP_MIN) {
    const hh = Math.floor(t / 60);
    const mm = t % 60;
    const label = new Date(0, 0, 0, hh, mm).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    const value = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    out.push({ value, label });
  }
  return out;
}

// postal
const CA_POSTAL_RE =
  /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i;

const HRM_FSAS = [
  'B2T',
  'B2V',
  'B2W',
  'B2X',
  'B2Y',
  'B2Z',
  'B3E',
  'B3G',
  'B3H',
  'B3J',
  'B3K',
  'B3L',
  'B3M',
  'B3N',
  'B3P',
  'B3R',
  'B3S',
  'B3T',
  'B3V',
  'B3W',
  'B3X',
  'B3Y',
  'B3Z',
  'B4A',
  'B4B',
  'B4C',
  'B4E',
];

type FormState = {
  service: ServiceType;

  year: number | '';
  make: string;
  model: string;
  vehicleClass: VehicleClass | '';

  makes: string[];
  models: string[];
  loadingMakes: boolean;
  loadingModels: boolean;

  engines: string[];
  trims: string[];
  engine: string;
  trim: string;
  engineFree: string;
  trimFree: string;

  date: string;
  time: string;
  timeSlots: Slot[];

  postal: string;
  outOfArea: boolean;

  addonCabin: boolean;
  addonWipers: boolean;
  addonTirePressure: boolean;
};

const YEARS = Array.from({ length: 25 }, (_, i) => new Date().getFullYear() - i);

export default function RequestQuotePage() {
  const searchParams = useSearchParams();

  const [f, setF] = useState<FormState>({
    service: 'oil_change',

    year: '',
    make: '',
    model: '',
    vehicleClass: '',

    makes: [],
    models: [],
    loadingMakes: false,
    loadingModels: false,

    engines: [],
    trims: [],
    engine: '',
    trim: '',
    engineFree: '',
    trimFree: '',

    date: '',
    time: '',
    timeSlots: [],

    postal: '',
    outOfArea: false,

    addonCabin: false,
    addonWipers: false,
    addonTirePressure: false,
  });

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [fullyBooked, setFullyBooked] = useState(false);

  const [ts, setTs] = useState('');
  useEffect(() => setTs(String(Date.now())), []);

  const formRef = useRef<HTMLDivElement>(null);

  // prefill from URL
  useEffect(() => {
    const svcParam = (searchParams.get('service') || '').toLowerCase() as ServiceType;
    const validServices: ServiceType[] = [
      'oil_change',
      'tire_change',
      'serpentine_belt',
      'spark_plugs',
      'ignition_coil',
      'battery',
      // 'fluid_changes',
    ];
    if (validServices.includes(svcParam)) {
      setF(p => ({ ...p, service: svcParam }));
    }

    const c = (searchParams.get('class') || '').toLowerCase();
    const classMap: Record<string, VehicleClass> = {
      sedan: 'Sedan',
      suv: 'SUV/Crossover',
      crossover: 'SUV/Crossover',
      large: 'Large SUV',
      truck: 'Truck',
      euro: 'Sports Car',
    };
    const mapped = classMap[c];
    if (mapped && !f.vehicleClass) {
      setF(p => ({ ...p, vehicleClass: mapped }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // makes
  useEffect(() => {
    (async () => {
      setF(p => ({ ...p, loadingMakes: true }));
      try {
        const r = await fetch('/api/makes');
        const j = await r.json().catch(() => ({} as any));
        setF(p => ({
          ...p,
          makes: Array.isArray(j?.makes) ? j.makes : [],
          loadingMakes: false,
        }));
      } catch {
        setF(p => ({ ...p, makes: [], loadingMakes: false }));
      }
    })();
  }, []);

  // models
  useEffect(() => {
    (async () => {
      if (!f.make || !f.year) {
        setF(p => ({
          ...p,
          models: [],
          model: '',
        }));
        return;
      }
      setF(p => ({ ...p, loadingModels: true, models: [], model: '' }));
      try {
        const r = await fetch(
          `/api/models?make=${encodeURIComponent(f.make)}&year=${encodeURIComponent(
            String(f.year),
          )}`,
        );
        const j = await r.json().catch(() => ({} as any));
        setF(p => ({
          ...p,
          models: Array.isArray(j?.models) ? j.models : [],
          loadingModels: false,
        }));
      } catch {
        setF(p => ({ ...p, models: [], loadingModels: false }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.make, f.year]);

  // model → detect class, variants
  useEffect(() => {
    if (!f.model) return;
    const cls = detectClassFromModel(f.model) as VehicleClass | '' | undefined;
    const v = getVariants(f.make, f.model, Number(f.year) || undefined);
    setF(p => ({
      ...p,
      vehicleClass: (cls || p.vehicleClass) as VehicleClass | '',
      engines: Array.isArray(v?.engines) ? v!.engines : [],
      trims: Array.isArray(v?.trims) ? v!.trims : [],
      engine: '',
      trim: '',
      engineFree: '',
      trimFree: '',
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.model]);

  // availability
  useEffect(() => {
    async function checkAvailability() {
      if (!f.date) {
        setF(p => ({ ...p, timeSlots: [], time: '' }));
        setFullyBooked(false);
        return;
      }

      let slots = buildSlotsForDate(f.date);
      const addMin = (d: Date, mins: number) =>
        new Date(d.getTime() + mins * 60000);

      const now = new Date();
      const todayLocal = new Date().toISOString().slice(0, 10) === f.date;
      if (todayLocal) {
        const cutoff = addMin(now, 120);
        slots = slots.filter(slot => {
          const slotStart = new Date(`${f.date}T${slot.value}:00`);
          return slotStart >= cutoff;
        });
      }

      try {
        const res = await fetch(
          `/api/availability?date=${encodeURIComponent(f.date)}`,
          { cache: 'no-store' },
        );
        const j = await res.json().catch(() => ({} as any));
        const busy: Array<{ start: string; end: string }> = Array.isArray(j?.busy)
          ? j.busy
          : [];

        const free = slots.filter(slot => {
          const slotStart = new Date(`${f.date}T${slot.value}:00`);
          const slotEnd = addMin(slotStart, 30);
          return !busy.some(b => {
            const evStart = new Date(b.start);
            const evEnd = new Date(b.end);
            const blockStart = addMin(evStart, -75);
            const blockEnd = addMin(evEnd, 75);
            return slotStart < blockEnd && slotEnd > blockStart;
          });
        });

        setF(p => ({ ...p, timeSlots: free, time: '' }));
        setFullyBooked(free.length === 0);
      } catch {
        setF(p => ({ ...p, timeSlots: slots, time: '' }));
        setFullyBooked(slots.length === 0);
      }
    }

    checkAvailability();
  }, [f.date]);

  // price
  const quote = useMemo(() => {
    const q = computeQuote({
      service: f.service,
      make: f.make,
      vehicleClass: f.vehicleClass || undefined,
    });

    const addons =
      (f.addonCabin ? ADDON_PRICES.cabin : 0) +
      (f.addonWipers ? ADDON_PRICES.wipers : 0) +
      (f.addonTirePressure ? ADDON_PRICES.tire : 0);

    const base = q.base;
    const total = base + addons;

    return { ...q, base, addons, total };
  }, [
    f.service,
    f.make,
    f.vehicleClass,
    f.addonCabin,
    f.addonWipers,
    f.addonTirePressure,
  ]);
  

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF(p => ({ ...p, [k]: v }));

  const onPostalChange = (v: string) => {
    const cleaned = v.toUpperCase().replace(/\s+/g, '');
    let out = false;
    if (CA_POSTAL_RE.test(cleaned)) {
      const fsa = cleaned.slice(0, 3);
      out = !HRM_FSAS.includes(fsa);
    }
    setF(p => ({ ...p, postal: v, outOfArea: out }));
  };

  async function submitRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const fd = new FormData(form);

    fd.set('postal', f.postal);
    fd.set('outOfArea', f.outOfArea ? 'true' : 'false');
    fd.set('service', f.service);
    fd.set('price_base', String(quote.base));
    fd.set('price_addons', String(quote.addons));
    fd.set('price_total', String(quote.total));

    try {
      const r = await fetch('/api/quote-email', { method: 'POST', body: fd });
      const isJson = r.headers.get('content-type')?.includes('application/json');
      const j = isJson ? await r.json() : { error: await r.text() };
      if (!r.ok || j?.error) throw new Error(j?.error || 'Could not send request');

      setDone(true);
      try {
        track('quote_request_submitted', {
          service: f.service,
          make: f.make,
          vehicleClass: f.vehicleClass || '',
          price: quote.total,
          outOfArea: f.outOfArea,
        });
      } catch {}
      form.reset();
      setTs(String(Date.now()));
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    }
  }

  if (done) {
    return (
      <div className="container py-16 text-center">
        <h1 className="text-3xl font-bold">Quote Pending</h1>
        <p className="mt-3 text-slate-600">
          Thanks. We emailed your request to our team. We will confirm your time soon.
        </p>
        <a
          href="/"
          className="inline-flex mt-6 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light"
        >
          Back to Home
        </a>
      </div>
    );
  }

  return (
    <div className="container py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Request Quote</h1>
        <p className="text-slate-600">
          Pick your service and time. We will confirm with the final price and lock it in.
        </p>
      </div>

      {/* Service picker */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium mb-2">Service</label>
        <select
          className="w-full border rounded px-3 py-2 bg-white max-w-md"
          value={f.service}
          onChange={e => update('service', e.target.value as ServiceType)}
        >
          <option value="oil_change">Oil Change</option>
          <option value="tire_change">Tire Change</option>
          <option value="serpentine_belt">Serpentine Belt Replacement</option>
          <option value="spark_plugs">Spark Plug Replacement</option>
          <option value="ignition_coil">Ignition Coil Replacement</option>
          <option value="battery">Battery Test and Replacement</option>
          {/* <option value="fluid_changes">Fluid Changes</option> */}
        </select>
      </div>

      {/* Vehicle section - always visible */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Your Vehicle</h2>


        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium">Year</label>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={f.year}
              onChange={e =>
                update('year', e.target.value ? Number(e.target.value) : '')
              }
            >
              <option value="">Select year</option>
              {YEARS.map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Make</label>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={f.make}
              onChange={e => update('make', e.target.value)}
              disabled={f.loadingMakes || !f.makes.length}
            >
              <option value="">
                {f.loadingMakes ? 'Loading makes…' : 'Select make'}
              </option>
              {f.makes.map(mk => (
                <option key={mk} value={mk}>
                  {mk}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Model</label>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={f.model}
              onChange={e => update('model', e.target.value)}
              disabled={!f.make || !f.year || f.loadingModels || !f.models.length}
            >
              <option value="">
                {!f.make || !f.year
                  ? 'Choose year and make first'
                  : f.loadingModels
                  ? 'Loading models…'
                  : f.models.length
                  ? 'Select model'
                  : 'No models found'}
              </option>
              {f.models.map(md => (
                <option key={md} value={md}>
                  {md}
                </option>
              ))}
            </select>
          </div>
        </div>

        {f.model && (
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium">Engine</label>
              {f.engines.length ? (
                <select
                  className="w-full border rounded px-3 py-2 bg-white"
                  value={f.engine}
                  onChange={e => update('engine', e.target.value)}
                >
                  <option value="">Select engine</option>
                  {f.engines.map(x => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., 1.8L I4"
                  value={f.engineFree}
                  onChange={e => update('engineFree', e.target.value)}
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium">Sub model or Trim</label>
              {f.trims.length ? (
                <select
                  className="w-full border rounded px-3 py-2 bg-white"
                  value={f.trim}
                  onChange={e => update('trim', e.target.value)}
                >
                  <option value="">Select trim</option>
                  {f.trims.map(x => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., S, XRS, XLE"
                  value={f.trimFree}
                  onChange={e => update('trimFree', e.target.value)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Estimate */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Estimate</h2>

        <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="text-slate-700 space-y-1">
              <div>
                Vehicle:{' '}
                <strong>
                  {f.year || '—'} {f.make || '—'} {f.model || '—'}
                </strong>
              </div>
              <div>
                Type: <strong>{f.vehicleClass || '—'}</strong>
              </div>
              <div className="text-sm text-slate-500">
                Base: ${quote.base.toFixed(2)}
                {quote.addons > 0 && <> · Add ons: ${quote.addons.toFixed(2)}</>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Estimated Total
              </div>
              <div className="text-2xl font-extrabold">
                ${quote.total.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Add ons */}
        <div className="mt-3">
          <label className="block text-sm font-medium">Add ons</label>
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="addonCabin"
                checked={f.addonCabin}
                onChange={e => update('addonCabin', e.target.checked)}
              />
              Cabin filter (+${ADDON_PRICES.cabin})
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="addonWipers"
                checked={f.addonWipers}
                onChange={e => update('addonWipers', e.target.checked)}
              />
              Wiper blades (+${ADDON_PRICES.wipers})
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="addonTirePressure"
                checked={f.addonTirePressure}
                onChange={e => update('addonTirePressure', e.target.checked)}
              />
              Tire pressure check (+${ADDON_PRICES.tire})
            </label>
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="w-full md:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light"
          >
            Book this quote
          </button>
        </div>
      </div>

      {/* Contact section */}
      <div
        ref={formRef}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-xl font-semibold mb-4">Your Details</h2>
        {error && <p className="text-red-600 mb-4">{error}</p>}

        <form
          onSubmit={submitRequest}
          encType="multipart/form-data"
          className="space-y-4 max-w-xl"
        >
          <input type="hidden" name="service" value={f.service} />
          <input type="hidden" name="year" value={String(f.year || '')} />
          <input type="hidden" name="make" value={f.make} />
          <input type="hidden" name="model" value={f.model} />
          <input type="hidden" name="vehicleClass" value={f.vehicleClass || ''} />
          <input type="hidden" name="price" value={String(quote.base)} />
          <input type="hidden" name="price_base" value={String(quote.base)} />
          <input type="hidden" name="price_addons" value={String(quote.addons)} />
          <input type="hidden" name="price_total" value={String(quote.total)} />
          <input
            type="hidden"
            name="engine"
            value={f.engines.length ? f.engine : f.engineFree}
          />
          <input
            type="hidden"
            name="trim"
            value={f.trims.length ? f.trim : f.trimFree}
          />
          <input type="hidden" name="ts" value={ts} />

          <div className="hidden" aria-hidden="true">
            <label>Company</label>
            <input type="text" name="company" autoComplete="off" />
          </div>

          <div>
            <label className="block text-sm font-medium">Full name</label>
            <input name="name" required className="w-full border rounded px-3 py-2" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Phone</label>
              <input name="phone" required className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">Email</label>
              <input
                type="email"
                name="email"
                required
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Service address</label>
            <input name="address" required className="w-full border rounded px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm font-medium">Postal code</label>
            <input
              name="postal"
              value={f.postal}
              onChange={e => onPostalChange(e.target.value)}
              placeholder="e.g., B3K 1A1"
              className="w-full border rounded px-3 py-2"
              required
            />
            {f.postal && CA_POSTAL_RE.test(f.postal) && f.outOfArea && (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                Out of area. Text us and we will try to work something out.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Preferred date</label>
              <input
                type="date"
                name="preferred_date"
                required
                className="w-full border rounded px-3 py-2"
                value={f.date}
                onChange={e => update('date', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Preferred time</label>
              <select
                name="preferred_time"
                required
                className="w-full border rounded px-3 py-2 bg-white"
                value={f.time}
                onChange={e => update('time', e.target.value)}
                disabled={!f.date}
              >
                <option value="">{!f.date ? 'Pick a date first' : 'Select time'}</option>
                {f.timeSlots.map(s => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              {fullyBooked && (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                  Fully booked for this date. Pick another date or call or text us.
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Notes (optional)</label>
            <textarea name="notes" rows={3} className="w-full border rounded px-3 py-2" />
          </div>

          <button className="w-full px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light">
            Submit request
          </button>
        </form>
      </div>
    </div>
  );
}
