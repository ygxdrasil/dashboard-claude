import { NextResponse, connection } from "next/server";
import { db } from "@/lib/server/supabase";

// Hidden check that the database connection works. Not linked anywhere in the UI.
// Open /api/test-db while logged in.
export async function GET() {
  await connection(); // always run at request time, never at build time

  try {
    const { data, error } = await db().from("targets").select("*").order("metric");
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, targets: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[test-db]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
