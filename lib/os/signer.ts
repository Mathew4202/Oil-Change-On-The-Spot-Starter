// Who signs our texts and emails: the person signed in to HQ who did it (Teagan replying, Harsh finishing a job).
// Automatic messages with nobody signed in (reminders, the evening run, answers to YES / NO) use DEFAULT_SIGNER, or Mathew.
// Messages carry a {signer} slot; sendSms and the emails fill it in just before they go out.
import { sbGet, enc } from "@/lib/os/db";

const DEFAULT = () => (process.env.DEFAULT_SIGNER || "Mathew").trim() || "Mathew";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function signerName(): Promise<string> {
  try {
    const { currentStaff } = await import("@/lib/os/auth");
    const s = currentStaff();   // only inside an HQ request; elsewhere this throws or is null
    if (!s) return DEFAULT();
    if (s.role === "owner") return cap(s.name);
    const [row] = await sbGet<{ display_name: string | null }>(`staff?select=display_name&username=eq.${enc(s.name)}`).catch(() => []);
    return (row?.display_name || cap(s.name)).trim().split(/\s+/)[0];
  } catch { return DEFAULT(); }
}

/** Fill the {signer} slot (and leave everything else as it is). */
export async function signed(text: string) {
  return text.includes("{signer}") ? text.replace(/\{signer\}/g, await signerName()) : text;
}
