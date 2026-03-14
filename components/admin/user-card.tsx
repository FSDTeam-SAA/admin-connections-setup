"use client";

import { FormEvent, useState } from "react";

import {
  connectionFormFromConnection,
  formatDateTime,
  type ConnectionFormState,
  type ManagedUser,
} from "@/lib/admin-api";
import { ConnectionFields } from "@/components/admin/form-fields";

export function UserManagementCard({
  user,
  onSaveConnection,
  busyKey,
}: {
  user: ManagedUser;
  onSaveConnection: (
    userId: string,
    connectionId: string,
    payload: ConnectionFormState
  ) => Promise<void>;
  busyKey: string | null;
}) {
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [connectionForms, setConnectionForms] = useState<Record<string, ConnectionFormState>>(
    () =>
      Object.fromEntries(
        user.connections.map((connection) => [
          connection.id,
          connectionFormFromConnection(connection),
        ])
      )
  );

  return (
    <article className="overflow-hidden rounded-[30px] border border-[#ead7b0] bg-white shadow-[0_24px_70px_rgba(177,137,50,0.12)]">
      <div className="border-b border-[#f0e1c0] bg-[#fffaf0] px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#e6c981] bg-[#fff4cf] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9f7322]">
              {user.role}
            </div>
            <h3 className="mt-3 text-xl font-semibold text-[#2f2a21]">{user.name}</h3>
            <p className="mt-1 text-sm text-[#7b6a48]">@{user.username}</p>
          </div>
          <div className="grid gap-3 text-sm text-[#6f6146] sm:grid-cols-2 lg:min-w-[300px]">
            <StatCard label="Databases" value={String(user.totalConnections)} />
            <StatCard label="Updated" value={formatDateTime(user.updatedAt)} />
          </div>
        </div>
      </div>

      <div className="space-y-4 px-6 py-6">
        {!user.connections.length ? (
          <div className="rounded-[24px] border border-dashed border-[#dfc58d] bg-[#fffaf0] px-5 py-6 text-sm text-[#7b6a48]">
            No database connection has been saved for this user yet.
          </div>
        ) : null}
        {user.connections.map((connection) => {
          const form =
            connectionForms[connection.id] || connectionFormFromConnection(connection);
          const connectionBusy = busyKey === `connection:${connection.id}`;
          const isEditing = editingConnectionId === connection.id;

          return (
            <div
              key={connection.id}
              className="rounded-[24px] border border-[#ecd9b3] bg-[#fffcf7] p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="inline-flex items-center rounded-full border border-[#ead29d] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9f7322]">
                    {connection.label || connection.database}
                  </div>
                  <h5 className="mt-3 text-lg font-semibold text-[#2f2a21]">
                    {connection.database}
                  </h5>
                  <p className="mt-1 text-sm text-[#7b6a48]">
                    {connection.host}:{connection.port} as {connection.username}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatCard label="Last sync" value={formatDateTime(connection.lastSyncAt)} />
                  <button
                    type="button"
                    onClick={() => setEditingConnectionId(isEditing ? null : connection.id)}
                    className="rounded-full border border-[#e0c384] bg-[#fff4d7] px-5 py-2.5 text-sm font-semibold text-[#6d5526] transition hover:bg-[#ffefc2]"
                  >
                    {isEditing ? "Cancel" : "Edit connection"}
                  </button>
                </div>
              </div>

              {isEditing ? (
                <form
                  className="mt-5 space-y-4"
                  onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    await onSaveConnection(user.id, connection.id, form);
                    setEditingConnectionId(null);
                  }}
                >
                  <ConnectionFields
                    title="Edit connection"
                    value={form}
                    onChange={(next) =>
                      setConnectionForms((current) => ({
                        ...current,
                        [connection.id]: next,
                      }))
                    }
                    requirePassword={false}
                  />
                  <button
                    type="submit"
                    disabled={connectionBusy}
                    className="rounded-full bg-[#2f2a21] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#443827] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {connectionBusy ? "Saving..." : "Save connection"}
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#efdfbc] bg-[#fffaf0] px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-[#a48548]">{label}</div>
      <div className="mt-2 text-sm font-semibold text-[#2f2a21]">{value}</div>
    </div>
  );
}
