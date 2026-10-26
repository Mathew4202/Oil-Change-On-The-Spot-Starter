// Staff logins (HQ → Team). Owners make them; each person types their name and password to sign in.
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { hashPassword, newPassword, ownerList } from "@/lib/os/auth";
import { cleanUsername, isRole } from "@/lib/os/roles";

export type StaffView = { username: string; display_name: string; role: string; active: boolean; phone: string | null; last_login_at: string | null; created_at: string };
const COLS = "username,display_name,role,active,phone,last_login_at,created_at";

export async function listStaff() {
  const staff = await sbGet<StaffView>(`staff?select=${COLS}&order=active.desc,display_name`).catch(() => null);
  return { staff: staff ?? [], ready: staff !== null, owners: ownerList().map((o) => o.name) };
}

export async function addStaff(input: { name?: unknown; username?: unknown; role?: unknown; phone?: unknown; password?: unknown }, by: string) {
  const display = String(input.name ?? "").trim().slice(0, 60);
  if (!display) return { ok: false as const, error: "Type their name" };
  const username = cleanUsername(input.username || display.split(/\s+/)[0]);
  if (username.length < 2) return { ok: false as const, error: "The login name needs at least 2 letters" };
  if (ownerList().some((o) => o.name === username)) return { ok: false as const, error: `"${username}" is an owner's login. Pick another name.` };
  if (!isRole(input.role) || input.role === "owner") return { ok: false as const, error: "Pick what they do" };
  const typed = String(input.password ?? "").trim();
  if (typed && typed.length < 8) return { ok: false as const, error: "Make the password at least 8 characters, or leave it empty and we'll make one" };
  const password = typed || newPassword();
  const r = await sbInsert("staff", { username, display_name: display, role: input.role, pass_hash: hashPassword(password),
    phone: String(input.phone ?? "").trim().slice(0, 20) || null, created_by: by });
  if (!r.ok) return { ok: false as const, error: r.status === 409 ? `There's already a login called "${username}"` : "Couldn't save it (run migration 0032 first)" };
  return { ok: true as const, username, password };
}

/** Change what they do, turn the login off or on, or give them a new password. Any change signs them out everywhere. */
export async function updateStaff(usernameRaw: unknown, input: { role?: unknown; active?: unknown; reset?: unknown; name?: unknown }) {
  const username = cleanUsername(usernameRaw);
  const [s] = await sbGet<{ session_ver: number }>(`staff?select=session_ver&username=eq.${enc(username)}`);
  if (!s) return { ok: false as const, error: "Login not found" };
  const patch: Record<string, unknown> = { session_ver: (s.session_ver ?? 0) + 1 };
  if (input.role !== undefined) { if (!isRole(input.role) || input.role === "owner") return { ok: false as const, error: "Pick what they do" }; patch.role = input.role; }
  if (input.active !== undefined) patch.active = !!input.active;
  if (typeof input.name === "string" && input.name.trim()) patch.display_name = input.name.trim().slice(0, 60);
  let password: string | null = null;
  if (input.reset) { password = newPassword(); patch.pass_hash = hashPassword(password); }
  await sbPatch("staff", `username=eq.${enc(username)}`, patch);
  return { ok: true as const, password };
}
