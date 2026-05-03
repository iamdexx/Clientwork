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

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [isClockedIn, setIsClockedIn] = useState(false);

  const fetchEntries = useCallback(async () => {
    const res = await fetch("/api/time-entries");
    if (res.ok) {
      const data = await res.json();
      setEntries(data);
      setIsClockedIn(data.some((e: TimeEntry) => !e.clockOut));
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (status === "authenticated") {
      fetchEntries();
    }
  }, [status, router, fetchEntries]);

  async function handleClockAction(action: "clock-in" | "clock-out") {
    setLoading(true);
    await fetch("/api/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, description }),
    });
    setDescription("");
    await fetchEntries();
    setLoading(false);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function calcHours(clockIn: string, clockOut: string | null): string {
    if (!clockOut) return "In progress";
    const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  }

  const totalMs = entries.reduce((sum, e) => {
    if (!e.clockOut) return sum;
    return sum + (new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime());
  }, 0);
  const totalHours = Math.floor(totalMs / 3600000);
  const totalMins = Math.floor((totalMs % 3600000) / 60000);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Welcome back, {session.user.name || session.user.email}
        </p>
      </div>

      {/* Clock In/Out Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Time Clock</h2>
          <div
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              isClockedIn
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {isClockedIn ? "Clocked In" : "Clocked Out"}
          </div>
        </div>

        <div className="space-y-3">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              isClockedIn
                ? "Describe what you worked on..."
                : "Describe what you'll be working on..."
            }
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
          />
          <div className="flex gap-3">
            {!isClockedIn ? (
              <button
                onClick={() => handleClockAction("clock-in")}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-medium text-lg transition-colors disabled:opacity-50"
              >
                {loading ? "..." : "Clock In"}
              </button>
            ) : (
              <button
                onClick={() => handleClockAction("clock-out")}
                disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-medium text-lg transition-colors disabled:opacity-50"
              >
                {loading ? "..." : "Clock Out"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Total Hours */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="text-sm text-blue-600 font-medium">Total Hours</div>
        <div className="text-2xl font-bold text-blue-900">
          {totalHours}h {totalMins}m
        </div>
      </div>

      {/* Time Entries Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Time Entries</h2>
        </div>
        {entries.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            No time entries yet. Clock in to get started!
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <div key={entry.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500">
                      {formatDate(entry.clockIn)}
                    </div>
                    <div className="font-medium text-gray-900">
                      {formatTime(entry.clockIn)}
                      {entry.clockOut
                        ? ` - ${formatTime(entry.clockOut)}`
                        : " - ..."}
                    </div>
                    {entry.description && (
                      <div className="text-sm text-gray-600 mt-1">
                        {entry.description}
                      </div>
                    )}
                  </div>
                  <div
                    className={`text-sm font-medium ${
                      entry.clockOut ? "text-gray-900" : "text-green-600"
                    }`}
                  >
                    {calcHours(entry.clockIn, entry.clockOut)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
