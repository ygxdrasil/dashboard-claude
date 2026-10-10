import { NextResponse, connection } from "next/server";
import { TargetUpdates, getTargets, setTargets } from "@/lib/server/targets";

export async function GET() {
  await connection();
  try {
    return NextResponse.json({ targets: await getTargets() });
  } catch (e) {
    console.error("[targets GET]", e);
    return NextResponse.json({ error: "Could not load targets." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const parsed = TargetUpdates.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid targets.", details: parsed.error.issues }, { status: 400 });
  }
  try {
    await setTargets(parsed.data);
    return NextResponse.json({ targets: await getTargets() });
  } catch (e) {
    console.error("[targets PUT]", e);
    return NextResponse.json({ error: "Could not save targets." }, { status: 500 });
  }
}
