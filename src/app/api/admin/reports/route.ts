import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

function formatDuration(ms: number) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type } = await req.json();

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Email service not configured. Set RESEND_API_KEY in environment variables." },
      { status: 500 }
    );
  }

  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
    select: { email: true, name: true },
  });

  if (!admin?.email || !admin.email.includes("@")) {
    return NextResponse.json(
      { error: "Admin account needs a valid email address. Update it in the Users tab." },
      { status: 400 }
    );
  }

  const now = new Date();
  let startDate: Date;
  let reportTitle: string;

  if (type === "weekly") {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);
    reportTitle = `Weekly Hours Report (${formatDate(startDate)} - ${formatDate(now)})`;
  } else {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    reportTitle = `Daily Shift Report - ${formatDate(now)}`;
  }

  const users = await prisma.user.findMany({
    where: { role: "user" },
    include: {
      timeEntries: {
        where: { clockIn: { gte: startDate } },
        orderBy: { clockIn: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  let totalAllMs = 0;
  const employeeRows = users
    .filter((u) => u.timeEntries.length > 0)
    .map((user) => {
      const totalMs = user.timeEntries.reduce((sum, entry) => {
        if (!entry.clockOut) return sum;
        return sum + (entry.clockOut.getTime() - entry.clockIn.getTime());
      }, 0);
      totalAllMs += totalMs;

      const entryRows = user.timeEntries
        .map(
          (e) =>
            `<tr style="border-bottom:1px solid #eee">
              <td style="padding:6px 12px">${formatDate(e.clockIn)}</td>
              <td style="padding:6px 12px">${formatTime(e.clockIn)}</td>
              <td style="padding:6px 12px">${e.clockOut ? formatTime(e.clockOut) : "In progress"}</td>
              <td style="padding:6px 12px">${e.clockOut ? formatDuration(e.clockOut.getTime() - e.clockIn.getTime()) : "-"}</td>
              <td style="padding:6px 12px">${e.description || "-"}</td>
            </tr>`
        )
        .join("");

      return `
        <div style="margin-bottom:24px">
          <h3 style="margin:0 0 8px;color:#1e40af">${user.name || user.email}</h3>
          <p style="margin:0 0 8px;color:#6b7280;font-size:14px">Total: <strong>${formatDuration(totalMs)}</strong> | Entries: ${user.timeEntries.length}</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f3f4f6">
                <th style="padding:6px 12px;text-align:left">Date</th>
                <th style="padding:6px 12px;text-align:left">In</th>
                <th style="padding:6px 12px;text-align:left">Out</th>
                <th style="padding:6px 12px;text-align:left">Duration</th>
                <th style="padding:6px 12px;text-align:left">Description</th>
              </tr>
            </thead>
            <tbody>${entryRows}</tbody>
          </table>
        </div>`;
    });

  const html = `
    <div style="font-family:sans-serif;max-width:700px;margin:0 auto">
      <h1 style="color:#1e40af;border-bottom:2px solid #3b82f6;padding-bottom:12px">${reportTitle}</h1>
      <p style="color:#374151;font-size:16px;margin-bottom:24px">
        <strong>Grand Total:</strong> ${formatDuration(totalAllMs)} across ${users.filter((u) => u.timeEntries.length > 0).length} employee(s)
      </p>
      ${employeeRows.length > 0 ? employeeRows.join("") : "<p style='color:#9ca3af'>No time entries found for this period.</p>"}
      <hr style="margin-top:32px;border:none;border-top:1px solid #e5e7eb">
      <p style="color:#9ca3af;font-size:12px">Sent from TimeTracker</p>
    </div>
  `;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: "TimeTracker <onboarding@resend.dev>",
    to: admin.email,
    subject: reportTitle,
    html,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, sentTo: admin.email });
}
