import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const dateFilter = from && to
    ? { clockIn: { gte: new Date(from), lt: new Date(to) } }
    : undefined;

  const users = await prisma.user.findMany({
    include: {
      timeEntries: {
        where: dateFilter,
        orderBy: { clockIn: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const report = users
    .filter((user) => user.role !== "admin")
    .map((user) => {
      const totalMs = user.timeEntries.reduce((sum, entry) => {
        if (!entry.clockOut) return sum;
        return sum + (entry.clockOut.getTime() - entry.clockIn.getTime());
      }, 0);
      const totalHours = Math.round((totalMs / 3600000) * 100) / 100;

      return {
        id: user.id,
        name: user.name || user.email,
        email: user.email,
        totalHours,
        entries: user.timeEntries,
      };
    });

  return NextResponse.json(report);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, clockIn, clockOut, description } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "Entry ID required" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (clockIn !== undefined) updateData.clockIn = new Date(clockIn);
  if (clockOut !== undefined) updateData.clockOut = clockOut ? new Date(clockOut) : null;
  if (description !== undefined) updateData.description = description;

  const entry = await prisma.timeEntry.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(entry);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "Entry ID required" }, { status: 400 });
  }

  await prisma.timeEntry.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
