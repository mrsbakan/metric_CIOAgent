"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

interface ApprovalRow {
  id:           string;
  session_id:   string;
  action_type:  string;
  payload:      Record<string, unknown>;
  status:       "pending" | "approved" | "rejected";
  requested_at: string;
  resolved_at:  string | null;
  resolved_by:  string | null;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const h    = Math.floor(diff / 3_600_000);
  if (h < 1)  return `${Math.floor(diff / 60_000)}m ago`;
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function expiresIn(requestedAt: string): string {
  const deadline = new Date(requestedAt).getTime() + 48 * 3_600_000;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return "Expired";
  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  return `${h}h ${m}m left`;
}

export default function ApprovalsPage() {
  const router      = useRouter();
  const accessToken = useAuth((s) => s.accessToken);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [filter,    setFilter]    = useState<"" | "pending" | "approved" | "rejected">("");
  const [actioning, setActioning] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) { router.replace("/login"); return; }
    void fetchApprovals();
  }, [accessToken, filter]);

  async function fetchApprovals() {
    setLoading(true);
    setError(null);
    try {
      const qs    = filter ? `?status=${filter}` : "";
      const data  = await api.get<ApprovalRow[]>(`/v1/approvals${qs}`);
      setApprovals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string) {
    setActioning(id);
    try {
      await api.post(`/v1/approvals/${id}/approve`, {});
      await fetchApprovals();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActioning(null);
    }
  }

  async function handleReject(id: string) {
    setActioning(id);
    try {
      await api.post(`/v1/approvals/${id}/reject`, {});
      await fetchApprovals();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActioning(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Pending Approvals</h1>
        <nav className="flex gap-4 text-sm text-gray-500">
          <a href="/chat"      className="hover:text-gray-900">Chat</a>
          <a href="/dashboard" className="hover:text-gray-900">Dashboard</a>
          <a href="/admin"     className="hover:text-gray-900">Admin</a>
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Filter */}
        <div className="flex gap-2 mb-4">
          {(["", "pending", "approved", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "px-3 py-1 rounded-full text-sm font-medium border transition-colors",
                filter === s
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
              )}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {loading && <p className="text-center text-gray-400 py-12">Loading…</p>}
        {error   && <p className="text-center text-red-500 py-12">{error}</p>}

        {!loading && !error && approvals.length === 0 && (
          <p className="text-center text-gray-400 py-12">No approvals found.</p>
        )}

        <div className="space-y-3">
          {approvals.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{a.action_type}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Requested {timeAgo(a.requested_at)}
                    {a.status === "pending" && (
                      <span className={cn(
                        "ml-2",
                        Date.now() - new Date(a.requested_at).getTime() > 42 * 3_600_000
                          ? "text-red-500 font-medium"
                          : "text-gray-400",
                      )}>
                        · {expiresIn(a.requested_at)}
                      </span>
                    )}
                  </p>
                  {Object.keys(a.payload).length > 0 && (
                    <pre className="mt-2 text-xs bg-gray-50 rounded p-2 overflow-x-auto text-gray-600">
                      {JSON.stringify(a.payload, null, 2)}
                    </pre>
                  )}
                </div>

                <StatusBadge status={a.status} />
              </div>

              {a.status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleApprove(a.id)}
                    disabled={actioning === a.id}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    {actioning === a.id ? "…" : "Approve"}
                  </button>
                  <button
                    onClick={() => handleReject(a.id)}
                    disabled={actioning === a.id}
                    className="flex-1 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: ApprovalRow["status"] }) {
  const map = {
    pending:  "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };
  return (
    <span className={cn("shrink-0 px-2 py-0.5 rounded-full text-xs font-medium", map[status])}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
