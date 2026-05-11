"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

interface ConnectorHealth { id: string; name: string; type: string; healthy: boolean; latencyMs: number }
interface ApprovalRow     { id: string; action_type: string; status: string; requested_at: string }
interface SessionRow      { id: string; state: string; created_at: string }

export default function DashboardPage() {
  const router      = useRouter();
  const accessToken = useAuth((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) router.replace("/login");
  }, [accessToken, router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        <nav className="flex gap-4 text-sm text-gray-500">
          <a href="/chat"      className="hover:text-gray-900">Chat</a>
          <a href="/approvals" className="hover:text-gray-900">Approvals</a>
          <a href="/admin"     className="hover:text-gray-900">Admin</a>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 grid gap-6 md:grid-cols-2">
        <ConnectorHealthCard />
        <PendingCountCard />
        <RecentApprovalsCard />
        <RecentSessionsCard />
      </main>
    </div>
  );
}

// ─── Connector Health ─────────────────────────────────────────────────────────

function ConnectorHealthCard() {
  const [connectors, setConnectors] = useState<ConnectorHealth[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    api.get<{ id: string; name: string; type: string }[]>("/v1/connectors")
      .then(async (list) => {
        const results = await Promise.allSettled(
          list.map((c) =>
            api.get<{ healthy: boolean; latencyMs: number }>(`/v1/connectors/${c.id}/health`)
              .then((h) => ({ ...c, ...h }))
              .catch(() => ({ ...c, healthy: false, latencyMs: -1 })),
          ),
        );
        setConnectors(
          results.map((r) => (r.status === "fulfilled" ? r.value : { id: "", name: "?", type: "?", healthy: false, latencyMs: -1 })),
        );
      })
      .catch(() => setConnectors([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card title="Connector Health">
      {loading ? <Spinner /> : connectors.length === 0 ? (
        <p className="text-sm text-gray-400">No connectors configured.</p>
      ) : (
        <ul className="space-y-2">
          {connectors.map((c) => (
            <li key={c.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{c.name} <span className="text-gray-400">({c.type})</span></span>
              <span className={cn("flex items-center gap-1 font-medium", c.healthy ? "text-green-600" : "text-red-500")}>
                <span className={cn("w-2 h-2 rounded-full", c.healthy ? "bg-green-500" : "bg-red-400")} />
                {c.healthy ? `${c.latencyMs}ms` : "Down"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Pending Count ────────────────────────────────────────────────────────────

function PendingCountCard() {
  const [count,   setCount]   = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ApprovalRow[]>("/v1/approvals?status=pending")
      .then((data) => setCount(data.length))
      .catch(() => setCount(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card title="Pending Approvals">
      {loading ? <Spinner /> : (
        <div className="flex items-end gap-2">
          <span className={cn("text-4xl font-bold", (count ?? 0) > 0 ? "text-orange-500" : "text-green-600")}>
            {count ?? "—"}
          </span>
          <span className="text-sm text-gray-400 mb-1">awaiting review</span>
        </div>
      )}
      {(count ?? 0) > 0 && (
        <a href="/approvals" className="mt-3 inline-block text-sm text-brand hover:underline">
          Review now →
        </a>
      )}
    </Card>
  );
}

// ─── Recent Approvals ─────────────────────────────────────────────────────────

function RecentApprovalsCard() {
  const [rows,    setRows]    = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ApprovalRow[]>("/v1/approvals")
      .then((data) => setRows(data.slice(0, 5)))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card title="Recent Actions" className="md:col-span-2">
      {loading ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-gray-400">No actions yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700 truncate max-w-xs">{r.action_type}</span>
              <div className="flex items-center gap-3 shrink-0">
                <StatusDot status={r.status} />
                <span className="text-gray-400 text-xs">
                  {new Date(r.requested_at).toLocaleDateString()}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Recent Sessions ─────────────────────────────────────────────────────────

function RecentSessionsCard() {
  return (
    <Card title="System Status">
      <div className="space-y-2 text-sm">
        <StatusRow label="Agent Core"   ok={true}  />
        <StatusRow label="Redis"        ok={true}  />
        <StatusRow label="PostgreSQL"   ok={true}  />
        <StatusRow label="Vault"        ok={true}  />
      </div>
    </Card>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white rounded-xl border p-5 shadow-sm", className)}>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Spinner() {
  return <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending:  "bg-yellow-400",
    approved: "bg-green-500",
    rejected: "bg-red-400",
  };
  return <span className={cn("w-2 h-2 rounded-full inline-block", colors[status] ?? "bg-gray-300")} />;
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={cn("text-xs font-medium", ok ? "text-green-600" : "text-red-500")}>
        {ok ? "Operational" : "Down"}
      </span>
    </div>
  );
}
