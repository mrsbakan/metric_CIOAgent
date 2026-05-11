"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ADM_TABLE } from "./adm-table";

type Tab = "users" | "roles" | "connectors" | "adm";

export default function AdminPage() {
  const router      = useRouter();
  const accessToken = useAuth((s) => s.accessToken);
  const [tab, setTab] = useState<Tab>("users");

  useEffect(() => {
    if (!accessToken) router.replace("/login");
  }, [accessToken, router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Admin</h1>
        <nav className="flex gap-4 text-sm text-gray-500">
          <a href="/chat"      className="hover:text-gray-900">Chat</a>
          <a href="/approvals" className="hover:text-gray-900">Approvals</a>
          <a href="/dashboard" className="hover:text-gray-900">Dashboard</a>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          {(["users", "roles", "connectors", "adm"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors",
                tab === t ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-900",
              )}
            >
              {t === "adm" ? "ADM" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "users"      && <UsersTab />}
        {tab === "roles"      && <RolesTab />}
        {tab === "connectors" && <ConnectorsTab />}
        {tab === "adm"        && <AdmTab />}
      </main>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

interface UserRow { id: string; email: string; status: string; created_at: string }

function UsersTab() {
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: UserRow[] }>("/v1/users")
      .then((r) => setUsers(r.data))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-4">Users</h2>
      {loading ? <Spinner /> : (
        <Table
          headers={["Email", "Status", "Created"]}
          rows={users.map((u) => [u.email, u.status, new Date(u.created_at).toLocaleDateString()])}
          empty="No users found."
        />
      )}
    </div>
  );
}

// ─── Roles Tab ────────────────────────────────────────────────────────────────

interface RoleRow { id: string; name: string; description: string }

function RolesTab() {
  const [roles,   setRoles]   = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: RoleRow[] }>("/v1/roles")
      .then((r) => setRoles(r.data))
      .catch(() => setRoles([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-4">Roles</h2>
      {loading ? <Spinner /> : (
        <Table
          headers={["Name", "Description"]}
          rows={roles.map((r) => [r.name, r.description ?? "—"])}
          empty="No roles found."
        />
      )}
    </div>
  );
}

// ─── Connectors Tab ───────────────────────────────────────────────────────────

interface ConnectorRow { id: string; name: string; type: string; is_active: boolean }

function ConnectorsTab() {
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    api.get<ConnectorRow[]>("/v1/connectors")
      .then(setConnectors)
      .catch(() => setConnectors([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-4">Connectors</h2>
      {loading ? <Spinner /> : (
        <Table
          headers={["Name", "Type", "Active"]}
          rows={connectors.map((c) => [c.name, c.type, c.is_active ? "✓" : "—"])}
          empty="No connectors configured."
        />
      )}
    </div>
  );
}

// ─── ADM Tab ──────────────────────────────────────────────────────────────────

const ACTION_TYPES = Object.keys(ADM_TABLE);
const USER_TYPES   = ["admin", "power", "standard", "readonly"] as const;

const DECISION_COLORS: Record<string, string> = {
  AUTONOMOUS:        "bg-green-100 text-green-800",
  DRAFT:             "bg-yellow-100 text-yellow-800",
  APPROVAL_REQUIRED: "bg-orange-100 text-orange-800",
  NA:                "bg-gray-100 text-gray-500",
};

function AdmTab() {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-1">Action Decision Matrix</h2>
      <p className="text-sm text-gray-500 mb-4">Read-only. Write actions are never autonomous.</p>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Action Type</th>
              {USER_TYPES.map((ut) => (
                <th key={ut} className="px-4 py-3 text-left font-medium text-gray-600 capitalize">{ut}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACTION_TYPES.map((at) => (
              <tr key={at} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{at}</td>
                {USER_TYPES.map((ut) => {
                  const decision = (ADM_TABLE as Record<string, Record<string, string>>)[at]?.[ut] ?? "NA";
                  return (
                    <td key={ut} className="px-4 py-2.5">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", DECISION_COLORS[decision] ?? "bg-gray-100")}>
                        {decision}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function Table({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-center text-gray-400 py-12">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-gray-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Spinner() {
  return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>;
}
