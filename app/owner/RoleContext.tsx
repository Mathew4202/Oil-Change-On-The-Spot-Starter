"use client";
// What the signed-in person can see (from their login). Screens use it to leave out what isn't theirs.
// The server checks the same rules (middleware.ts), so this only decides what's shown.
import { createContext, useContext } from "react";
import { canOf, type Can, type Role } from "@/lib/os/roles";

const Ctx = createContext<{ name: string | null; role: Role; can: Can }>({ name: null, role: "owner", can: canOf("owner") });

export function RoleProvider({ name, role, children }: { name: string | null; role: Role; children: React.ReactNode }) {
  return <Ctx.Provider value={{ name, role, can: canOf(role) }}>{children}</Ctx.Provider>;
}
export const useRole = () => useContext(Ctx);
