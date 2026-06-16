import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getAdminUsers, updateUserStatus } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsers,
});

function AdminUsers() {
  const qc = useQueryClient();
  const usersFn = useServerFn(getAdminUsers);
  const updateFn = useServerFn(updateUserStatus);

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => usersFn(),
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-users-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_sessions" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-users"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-users"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const update = useMutation({
    mutationFn: (payload: { userId: string; isBanned?: boolean; isAdmin?: boolean; status?: "active" | "suspended" }) =>
      updateFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  return (
    <AppShell>
      <div className="p-4 lg:p-8">
        <Link to="/admin" className="inline-flex items-center gap-2 mono-label hover:text-primary mb-4">
          <ArrowLeft className="size-4" /> Admin
        </Link>
        <div className="mono-label">/ADMIN/USERS</div>
        <h1 className="font-display text-4xl uppercase mt-1">All Users</h1>
        <p className="mt-2 text-sm text-muted-foreground">Online = active within last 2 minutes.</p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm border border-line">
            <thead className="bg-paper-2 mono-label text-left">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Email</th>
                <th className="p-3">Status</th>
                <th className="p-3">Online</th>
                <th className="p-3">Machines</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users.data ?? []).map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="p-3">
                    <div className="font-mono">@{u.username}</div>
                    {u.is_admin && <span className="text-xs text-primary">ADMIN</span>}
                  </td>
                  <td className="p-3 font-mono text-xs">{u.email}</td>
                  <td className="p-3">
                    <span className={u.is_banned ? "text-red-500" : "text-green-600"}>
                      {u.is_banned ? "banned" : u.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-block size-2 rounded-full mr-2 ${u.isOnline ? "bg-green-500" : "bg-muted-foreground"}`} />
                    {u.isOnline ? "Online" : "Offline"}
                  </td>
                  <td className="p-3">
                    {u.machines.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="space-y-1">
                        {u.machines.map((m) => (
                          <div key={m.machineId} className="text-xs font-mono">
                            #{m.machineNumber} · {m.osName}
                            {m.osVersion ? ` ${m.osVersion}` : ""}
                            {m.isOnline && <span className="text-green-600 ml-1">●</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-3 space-x-2">
                    {!u.is_admin && (
                      <button
                        type="button"
                        className="ink-button px-2 py-1 text-xs"
                        onClick={() => update.mutate({ userId: u.id, isBanned: !u.is_banned })}
                      >
                        {u.is_banned ? "Unban" : "Ban"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="border border-line px-2 py-1 text-xs hover:bg-paper-2"
                      onClick={() =>
                        update.mutate({
                          userId: u.id,
                          status: u.status === "active" ? "suspended" : "active",
                        })
                      }
                    >
                      {u.status === "active" ? "Suspend" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
