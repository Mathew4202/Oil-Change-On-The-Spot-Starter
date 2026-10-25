// A photo of the VIN or the engine label: keep it with the booking, and try to read the VIN so we know the exact engine.
import { askAI } from "@/lib/os/ai";
import crypto from "crypto";
import { sbHeaders } from "@/lib/os/db";
import { cleanVin, vinOk } from "@/lib/os/vin";

const base = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const BUCKET = "booking-photos";
export const PHOTO_PATH = /^\d{4}-\d{2}\/[0-9a-f-]{36}\.jpg$/;

export async function storeBookingPhoto(bytes: Buffer): Promise<string | null> {
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.jpg`;
  const res = await fetch(`${base()}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST", headers: sbHeaders({ "Content-Type": "image/jpeg", "x-upsert": "true" }), body: new Uint8Array(bytes),
  }).catch(() => null);
  return res?.ok ? path : null;
}

export async function bookingPhotoLink(path: string): Promise<string | null> {
  if (!PHOTO_PATH.test(path)) return null;
  const res = await fetch(`${base()}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST", headers: sbHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: 3600 }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const j = await res.json().catch(() => ({}));
  return j.signedURL ? `${base()}/storage/v1${j.signedURL}` : null;
}

const PROMPT = `This photo should show a vehicle's VIN (on the dashboard through the windshield, the driver's door jamb sticker, or a registration/insurance card) or the emissions label under the hood.
Reply with ONLY this JSON: {"vin":"17 characters or null","engine_size_l":"e.g. 2.0 from the emissions label, or null"}
A VIN never contains I, O or Q. If you can't read all 17 characters clearly, use null.`;

/** Read the VIN from the photo (free AI, see ai.ts). null if it isn't set up or can't read it. The check digit catches misreads. */
export async function readVin(jpegBase64: string): Promise<{ vin: string | null; engineL: string | null }> {
  const a = await askAI({ prompt: PROMPT, file: { mime: "image/jpeg", base64: jpegBase64 }, maxTokens: 200, big: true });
  if (!a) return { vin: null, engineL: null };
  const text = a.text;
  try {
    const o = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const vin = vinOk(o.vin) ? cleanVin(o.vin) : null;
    const engineL = /^\d\.\d$/.test(String(o.engine_size_l ?? "")) ? String(o.engine_size_l) : null;
    return { vin, engineL };
  } catch { return { vin: null, engineL: null }; }
}

export type Decoded = { year: number | null; make: string | null; model: string | null; engineL: string | null; fuel: string | null; cylinders: string | null };

/** Free NHTSA decoder: year, make, model and engine size from a VIN. */
export async function decodeVin(vin: string): Promise<Decoded | null> {
  if (!vinOk(vin)) return null;
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${cleanVin(vin)}?format=json`).catch(() => null);
  if (!res?.ok) return null;
  const r = (await res.json().catch(() => ({})))?.Results?.[0];
  if (!r) return null;
  const d = Number(r.DisplacementL);
  return { year: Number(r.ModelYear) || null, make: r.Make || null, model: r.Model || null, engineL: d ? d.toFixed(1) : null,
    fuel: r.FuelTypePrimary || null, cylinders: r.EngineCylinders || null };
}
