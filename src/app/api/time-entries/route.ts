import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.timeEntry.findMany({
    where: { userId: session.user.id },
    orderBy: { clockIn: "desc" },
  });

  return NextResponse.json(entries);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, description, entryId } = await req.json();

  if (action === "clock-in") {
    const openEntry = await prisma.timeEntry.findFirst({
      where: { userId: session.user.id, clockOut: null },
    });
    if (openEntry) {
      return NextResponse.json(
        { error: "Already clocked in" },
        { status: 400 }
      );
    }

    const entry = await prisma.timeEntry.create({
      data: {
        userId: session.user.id,
        clockIn: new Date(),
        description: description || "",
      },
    });
    return NextResponse.json(entry, { status: 201 });
  }

  if (action === "clock-out") {
    const openEntry = await prisma.timeEntry.findFirst({
      where: { userId: session.user.id, clockOut: null },
    });
    if (!openEntry) {
      return NextResponse.json(
        { error: "Not currently clocked in" },
        { status: 400 }
      );
    }

    const entry = await prisma.timeEntry.update({
      where: { id: openEntry.id },
      data: {
        clockOut: new Date(),
        description: description || openEntry.description,
      },
    });
    return NextResponse.json(entry);
  }

  if (action === "update-description" && entryId) {
    const entry = await prisma.timeEntry.update({
      where: { id: entryId },
      data: { description: description || "" },
    });
    return NextResponse.json(entry);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
