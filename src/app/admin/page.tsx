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

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [report, setReport] = useState<UserReport[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    const res = await fetch("/api/admin/time-entries");
    if (res.ok) {
      const data = await res.json();
      setReport(data);
    }
    setLoading(false);
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
      fetchReport();
    }
  }, [status, session, router, fetchReport]);

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-1">View all employee hours</p>
      </div>

      {/* Grand Total */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="text-sm text-blue-600 font-medium">
          Total Hours (All Employees)
        </div>
        <div className="text-2xl font-bold text-blue-900">
          {grandTotal.toFixed(2)} hours
        </div>
      </div>

      {/* Employee List */}
      <div className="space-y-4">
        {report.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
            No employees have logged time yet.
          </div>
        ) : (
          report.map((user) => (
            <div
              key={user.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              <button
                onClick={() =>
                  setExpandedUser(expandedUser === user.id ? null : user.id)
                }
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="text-left">
                  <div className="font-semibold text-gray-900">{user.name}</div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">
                    {user.totalHours} hrs
                  </div>
                  <div className="text-sm text-gray-500">
                    {user.entries.length} entries
                  </div>
                </div>
              </button>

              {expandedUser === user.id && (
                <div className="border-t border-gray-100">
                  {user.entries.length === 0 ? (
                    <div className="px-6 py-4 text-sm text-gray-500">
                      No entries
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {user.entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="px-6 py-3 flex items-center justify-between text-sm"
                        >
                          <div>
                            <span className="text-gray-500">
                              {formatDate(entry.clockIn)}
                            </span>{" "}
                            <span className="font-medium text-gray-900">
                              {formatTime(entry.clockIn)}
                              {entry.clockOut
                                ? ` - ${formatTime(entry.clockOut)}`
                                : " - ..."}
                            </span>
                            {entry.description && (
                              <span className="text-gray-500 ml-2">
                                &mdash; {entry.description}
                              </span>
                            )}
                          </div>
                          {!entry.clockOut && (
                            <span className="text-green-600 font-medium">
                              Active
                            </span>
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
    </div>
  );
}
