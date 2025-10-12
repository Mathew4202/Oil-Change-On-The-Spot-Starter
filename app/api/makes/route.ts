import { NextResponse } from "next/server";
import { CANADA_MAKES } from "@/data/canadaMakes";

export async function GET() {
  return NextResponse.json({ makes: CANADA_MAKES });
}
