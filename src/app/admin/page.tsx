"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

interface TimeEntry {
  id: string;
  clockIn: string;
  clockOut: string | null;
  description: string;
}

interface UserReport {
  id: string;
  name: string;
  email: string;
  totalHours: number;
  entries: TimeEntry[];
}

interface UserInfo {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
}

type Tab = "hours" | "users" | "settings";

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getSunday(monday: Date) {
  const date = new Date(monday);
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date;
}

function formatWeekLabel(monday: Date) {
  const sunday = getSunday(monday);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${monday.toLocaleDateString("en-US", opts)} - ${sunday.toLocaleDateString("en-US", opts)}, ${sunday.getFullYear()}`;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [report, setReport] = useState<UserReport[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("hours");
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ clockIn: "", clockOut: "", description: "" });
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({ name: "", email: "", role: "", password: "" });
  const [adminEmail, setAdminEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [reportMsg, setReportMsg] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  const fetchReport = useCallback(async (monday: Date) => {
    const from = monday.toISOString();
    const to = new Date(getSunday(monday).getTime() + 1).toISOString();
    const res = await fetch(`/api/admin/time-entries?from=${from}&to=${to}`);
    if (res.ok) {
      const data = await res.json();
      setReport(data);
    }
    setLoading(false);
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
      const admin = data.find((u: UserInfo) => u.role === "admin");
      if (admin) setAdminEmail(admin.email);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (status === "authenticated") {
      if (session?.user.role !== "admin") {
        router.push("/dashboard");
        return;
      }
      fetchReport(weekStart);
      fetchUsers();
    }
  }, [status, session, router, fetchReport, fetchUsers, weekStart]);

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  function toLocalDatetime(dateStr: string) {
    const d = new Date(dateStr);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  }

  function formatHoursMinutes(hours: number) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  }

  function goToPrevWeek() {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    setWeekStart(prev);
    setLoading(true);
  }

  function goToNextWeek() {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
    setLoading(true);
  }

  function goToCurrentWeek() {
    setWeekStart(getMonday(new Date()));
    setLoading(true);
  }

  const isCurrentWeek = getMonday(new Date()).getTime() === weekStart.getTime();

  async function handleDeleteEntry(entryId: string) {
    if (!confirm("Delete this time entry?")) return;
    const res = await fetch("/api/admin/time-entries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entryId }),
    });
    if (res.ok) fetchReport(weekStart);
  }

  async function handleSaveEntry(entryId: string) {
    const res = await fetch("/api/admin/time-entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: entryId,
        clockIn: new Date(editForm.clockIn).toISOString(),
        clockOut: editForm.clockOut ? new Date(editForm.clockOut).toISOString() : null,
        description: editForm.description,
      }),
    });
    if (res.ok) {
      setEditingEntry(null);
      fetchReport(weekStart);
    }
  }

  async function handleSaveUser(userId: string) {
    const body: Record<string, string> = { id: userId };
    if (userForm.name) body.name = userForm.name;
    if (userForm.email) body.email = userForm.email;
    if (userForm.role) body.role = userForm.role;
    if (userForm.password) body.password = userForm.password;

    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setEditingUser(null);
      fetchUsers();
      fetchReport(weekStart);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm("Delete this user and all their time entries?")) return;
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId }),
    });
    if (res.ok) {
      fetchUsers();
      fetchReport(weekStart);
    }
  }

  async function handleSaveAdminEmail() {
    if (!adminEmail.includes("@")) {
      setEmailMsg("Please enter a valid email address");
      return;
    }
    setEmailSaving(true);
    setEmailMsg("");
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: session?.user.id, email: adminEmail }),
    });
    setEmailSaving(false);
    if (res.ok) {
      setEmailMsg("Email saved! Reports will be sent to this address.");
    } else {
      setEmailMsg("Failed to save email");
    }
  }

  async function handleSendReport(type: "daily" | "weekly") {
    setReportSending(true);
    setReportMsg("");
    const res = await fetch("/api/admin/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    setReportSending(false);
    const data = await res.json();
    if (res.ok) {
      setReportMsg(`Report sent to ${data.sentTo}`);
    } else {
      setReportMsg(data.error || "Failed to send report");
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!session || session.user.role !== "admin") return null;

  const grandTotal = report.reduce((sum, u) => sum + u.totalHours, 0);
  const employeesWithEntries = report.filter((u) => u.entries.length > 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-1">Manage employees, hours, and reports</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1">
        {(["hours", "users", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t === "hours" ? "Hours" : t === "users" ? "Users" : "Settings & Reports"}
          </button>
        ))}
      </div>

      {/* HOURS TAB */}
      {tab === "hours" && (
        <>
          {/* Week Picker */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex items-center justify-between">
            <button
              onClick={goToPrevWeek}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              &larr; Previous Week
            </button>
            <div className="text-center">
              <div className="text-sm text-gray-500">Pay Period</div>
              <div className="font-semibold text-gray-900">{formatWeekLabel(weekStart)}</div>
              {isCurrentWeek && <div className="text-xs text-blue-600 font-medium">Current Week</div>}
            </div>
            <div className="flex gap-2">
              {!isCurrentWeek && (
                <button
                  onClick={goToCurrentWeek}
                  className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Today
                </button>
              )}
              <button
                onClick={goToNextWeek}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                Next Week &rarr;
              </button>
            </div>
          </div>

          {/* Weekly Totals */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="text-sm text-blue-600 font-medium">Total Hours This Pay Period</div>
            <div className="text-2xl font-bold text-blue-900">{formatHoursMinutes(grandTotal)}</div>
            <div className="text-sm text-blue-600 mt-1">
              {employeesWithEntries.length} employee{employeesWithEntries.length !== 1 ? "s" : ""} with logged time
            </div>
          </div>

          {/* Employee List */}
          <div className="space-y-4">
            {employeesWithEntries.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
                No time entries for this pay period.
              </div>
            ) : (
              employeesWithEntries.map((user) => (
                <div key={user.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-left">
                      <div className="font-semibold text-gray-900">{user.name}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">{formatHoursMinutes(user.totalHours)}</div>
                      <div className="text-sm text-gray-500">{user.entries.length} entries</div>
                    </div>
                  </button>

                  {expandedUser === user.id && (
                    <div className="border-t border-gray-100">
                      {user.entries.length === 0 ? (
                        <div className="px-6 py-4 text-sm text-gray-500">No entries</div>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {user.entries.map((entry) => (
                            <div key={entry.id} className="px-6 py-3">
                              {editingEntry === entry.id ? (
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-xs text-gray-500">Clock In</label>
                                      <input
                                        type="datetime-local"
                                        value={editForm.clockIn}
                                        onChange={(e) => setEditForm({ ...editForm, clockIn: e.target.value })}
                                        className="w-full px-2 py-1 border rounded text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-500">Clock Out</label>
                                      <input
                                        type="datetime-local"
                                        value={editForm.clockOut}
                                        onChange={(e) => setEditForm({ ...editForm, clockOut: e.target.value })}
                                        className="w-full px-2 py-1 border rounded text-sm"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">Description</label>
                                    <input
                                      type="text"
                                      value={editForm.description}
                                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                      className="w-full px-2 py-1 border rounded text-sm"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleSaveEntry(entry.id)}
                                      className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingEntry(null)}
                                      className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between text-sm">
                                  <div>
                                    <span className="text-gray-500">{formatDate(entry.clockIn)}</span>{" "}
                                    <span className="font-medium text-gray-900">
                                      {formatTime(entry.clockIn)}
                                      {entry.clockOut ? ` - ${formatTime(entry.clockOut)}` : " - ..."}
                                    </span>
                                    {entry.description && (
                                      <span className="text-gray-500 ml-2">&mdash; {entry.description}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {!entry.clockOut && (
                                      <span className="text-green-600 font-medium text-xs">Active</span>
                                    )}
                                    <button
                                      onClick={() => {
                                        setEditingEntry(entry.id);
                                        setEditForm({
                                          clockIn: toLocalDatetime(entry.clockIn),
                                          clockOut: entry.clockOut ? toLocalDatetime(entry.clockOut) : "",
                                          description: entry.description,
                                        });
                                      }}
                                      className="text-blue-600 hover:text-blue-800 text-xs"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteEntry(entry.id)}
                                      className="text-red-600 hover:text-red-800 text-xs"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* USERS TAB */}
      {tab === "users" && (
        <div className="space-y-4">
          {users.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
              No users registered yet.
            </div>
          ) : (
            users.map((user) => (
              <div key={user.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                {editingUser === user.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500">Name</label>
                        <input
                          type="text"
                          value={userForm.name}
                          onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                          className="w-full px-2 py-1.5 border rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Email</label>
                        <input
                          type="text"
                          value={userForm.email}
                          onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                          className="w-full px-2 py-1.5 border rounded text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500">Role</label>
                        <select
                          value={userForm.role}
                          onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                          className="w-full px-2 py-1.5 border rounded text-sm"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">New Password (leave blank to keep)</label>
                        <input
                          type="password"
                          value={userForm.password}
                          onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                          className="w-full px-2 py-1.5 border rounded text-sm"
                          placeholder="••••••"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveUser(user.id)}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingUser(null)}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{user.name || "No name"}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {user.role === "admin" ? (
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Admin</span>
                        ) : (
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">User</span>
                        )}
                        <span className="ml-2">Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingUser(user.id);
                          setUserForm({
                            name: user.name || "",
                            email: user.email,
                            role: user.role,
                            password: "",
                          });
                        }}
                        className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded text-sm"
                      >
                        Edit
                      </button>
                      {user.role !== "admin" && (
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded text-sm"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* SETTINGS & REPORTS TAB */}
      {tab === "settings" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Report Email</h2>
            <p className="text-sm text-gray-500 mb-4">Set the email address where hour reports will be sent.</p>
            <div className="flex gap-3">
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => {
                  setAdminEmail(e.target.value);
                  setEmailMsg("");
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="your@email.com"
              />
              <button
                onClick={handleSaveAdminEmail}
                disabled={emailSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {emailSaving ? "Saving..." : "Save"}
              </button>
            </div>
            {emailMsg && (
              <p className={`text-sm mt-2 ${emailMsg.includes("Failed") ? "text-red-600" : "text-green-600"}`}>
                {emailMsg}
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Send Reports</h2>
            <p className="text-sm text-gray-500 mb-4">
              Send an email report with employee hours to your email address.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleSendReport("daily")}
                disabled={reportSending}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {reportSending ? "Sending..." : "Send Daily Report"}
              </button>
              <button
                onClick={() => handleSendReport("weekly")}
                disabled={reportSending}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {reportSending ? "Sending..." : "Send Weekly Report"}
              </button>
            </div>
            {reportMsg && (
              <p className={`text-sm mt-2 ${reportMsg.includes("Failed") || reportMsg.includes("error") || reportMsg.includes("not configured") ? "text-red-600" : "text-green-600"}`}>
                {reportMsg}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
