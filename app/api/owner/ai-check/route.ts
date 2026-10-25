// HQ: is the AI set up and answering? Sends one tiny question to each and says what came back (never shows a key).
import { NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { askAI, aiLastError, paidSpend } from "@/lib/os/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const free = process.env.GEMINI_API_KEY ? await askAI({ prompt: "Reply with the single word: ready", maxTokens: 20 }) : null;
  const freeMsg = free?.provider === "gemini" ? "working" : aiLastError() ?? "not working";
  const paid = process.env.ANTHROPIC_API_KEY ? await askAI({ prompt: "Reply with the single word: ready", maxTokens: 20, private: true }) : null;
  return NextResponse.json({
    free: process.env.GEMINI_API_KEY ? freeMsg : "GEMINI_API_KEY isn't on this deployment (add it in Vercel, then redeploy)",
    paid: paid ? "working" : process.env.ANTHROPIC_API_KEY ? aiLastError() ?? "not working" : "no ANTHROPIC_API_KEY (backup off)",
    budget: await paidSpend().catch(() => null),
  });
}
