"use client";

import { FormEvent, useState } from "react";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ConnectionFields, InputField } from "@/components/admin/form-fields";
import {
  connectionFormFromConnection,
  type DatabaseProfile,
  emptyConnectionForm,
  emptyMergedConnectionForm,
  formatDateTime,
  type ConnectionFormState,
  type ManagedUser,
  type MergedConnectionFormState,
} from "@/lib/admin-api";

export function UserDetailsModal({
  user,
  busyKey,
  databaseProfiles,
  onClose,
  onSaveConnection,
  onAddConnection,
  onAddMergedConnection,
  onAssignProfile,
  onDeleteConnection,
  onDeleteUser,
}: {
  user: ManagedUser;
  busyKey: string | null;
  databaseProfiles: DatabaseProfile[];
  onClose: () => void;
  onSaveConnection: (
    userId: string,
    connectionId: string,
    payload: ConnectionFormState
  ) => Promise<void>;
  onAddConnection: (userId: string, payload: ConnectionFormState) => Promise<void>;
  onAddMergedConnection: (userId: string, payload: MergedConnectionFormState) => Promise<void>;
  onAssignProfile: (userId: string, profileId: string) => Promise<void>;
  onDeleteConnection: (userId: string, connectionId: string) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
}) {
  const directConnections = user.connections.filter((connection) => connection.kind !== "merged");
  const mergedConnections = user.connections.filter((connection) => connection.kind === "merged");
  const assignedProfileIds = new Set(
    directConnections
      .map((connection) => connection.profileId)
      .filter((profileId): profileId is string => Boolean(profileId))
  );
  const availableProfiles = databaseProfiles.filter((profile) => !assignedProfileIds.has(profile.id));
  const sourceLabelById = new Map(
    directConnections.map((connection) => [
      connection.id,
      connection.label || connection.database,
    ])
  );

  const [connectionForms, setConnectionForms] = useState<Record<string, ConnectionFormState>>(
    () =>
      Object.fromEntries(
        directConnections.map((connection) => [
          connection.id,
          connectionFormFromConnection(connection),
        ])
      )
  );
  const [createConnectionOpen, setCreateConnectionOpen] = useState(
    directConnections.length === 0
  );
  const [createMergedOpen, setCreateMergedOpen] = useState(false);
  const [newConnectionForm, setNewConnectionForm] = useState<ConnectionFormState>(
    () => emptyConnectionForm()
  );
  const [newMergedForm, setNewMergedForm] = useState<MergedConnectionFormState>(
    () => emptyMergedConnectionForm()
  );
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [confirmation, setConfirmation] = useState<
    | null
    | {
        type: "delete-user" | "delete-connection";
        connectionId?: string;
        title: string;
        description: string;
        confirmLabel: string;
      }
  >(null);
  const isCreatingConnection = busyKey === `add-connection:${user.id}`;
  const isCreatingMerged = busyKey === `add-merged:${user.id}`;
  const isAssigningProfile = busyKey === `assign-profile:${user.id}`;
  const isDeletingUser = busyKey === `delete-user:${user.id}`;
  const isDeletingConnection = confirmation?.connectionId
    ? busyKey === `delete-connection:${confirmation.connectionId}`
    : false;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
        <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-[#e5d5b3] bg-white shadow-[0_28px_70px_rgba(0,0,0,0.18)]">
          <div className="flex items-start justify-between gap-4 border-b border-[#efdfbc] bg-[#fffaf0] px-6 py-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a07a2d]">
                User details
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-[#2f2a21]">{user.name}</h2>
              <p className="mt-1 text-sm text-[#7b6a48]">{user.email}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateConnectionOpen((current) => !current)}
                className="rounded-full border border-[#dfc58d] bg-[#fff8e7] px-4 py-2 text-sm font-semibold text-[#6d5526]"
              >
                {createConnectionOpen ? "Hide add database" : "Add direct database"}
              </button>
              <button
                type="button"
                onClick={() => setCreateMergedOpen((current) => !current)}
                disabled={directConnections.length < 2}
                className="rounded-full border border-[#dfc58d] bg-[#fff8e7] px-4 py-2 text-sm font-semibold text-[#6d5526] disabled:opacity-60"
              >
                {createMergedOpen ? "Hide merged setup" : "Create merged database"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirmation({
                    type: "delete-user",
                    title: `Delete ${user.name}?`,
                    description:
                      "This removes the user, every saved database connection, and all synced report data tied to that user.",
                    confirmLabel: "Delete user",
                  })
                }
                disabled={isDeletingUser}
                className="rounded-full border border-[#e1a0a0] bg-[#fff1f1] px-4 py-2 text-sm font-semibold text-[#9f2b2b] disabled:opacity-60"
              >
                {isDeletingUser ? "Deleting..." : "Delete user"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[#dfc58d] bg-[#fff8e7] px-4 py-2 text-sm font-semibold text-[#6d5526]"
              >
                Close
              </button>
            </div>
          </div>

          <div className="overflow-y-auto px-6 py-6">
            <div className="grid gap-3 sm:grid-cols-4">
              <MetaCard label="Role" value={user.role} />
              <MetaCard label="Direct DBs" value={String(directConnections.length)} />
              <MetaCard label="Merged DBs" value={String(mergedConnections.length)} />
              <MetaCard label="Updated" value={formatDateTime(user.updatedAt)} />
            </div>

            <div className="mt-6 space-y-5">
              {databaseProfiles.length ? (
                <form
                  className="space-y-4 rounded-[24px] border border-[#d7d5f2] bg-[#f8f7ff] p-5"
                  onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    if (!selectedProfileId) return;
                    await onAssignProfile(user.id, selectedProfileId);
                    setSelectedProfileId("");
                  }}
                >
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5650a4]">
                      Connect saved database
                    </div>
                    <p className="mt-2 text-sm text-[#5d5a84]">
                      Assign a database from the library to this user.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-1">
                    <label className="flex flex-col gap-2 text-sm font-medium text-[#4a4678]">
                      <span>Saved database</span>
                      <select
                        value={selectedProfileId}
                        onChange={(event) => setSelectedProfileId(event.target.value)}
                        className="h-11 rounded-xl border border-[#d7d5f2] bg-white px-4 text-sm text-[#2f2a21] shadow-sm outline-none transition focus:border-[#7a76cc] focus:ring-2 focus:ring-[#d7d5f2]"
                      >
                        <option value="">Select database</option>
                        {availableProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.label || profile.database} ({profile.database})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isAssigningProfile || !selectedProfileId}
                      className="rounded-full bg-[#5a56a8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4c4795] disabled:opacity-60"
                    >
                      {isAssigningProfile ? "Connecting..." : "Connect saved database"}
                    </button>
                  </div>
                </form>
              ) : null}

              {createConnectionOpen ? (
                <form
                  className="space-y-4 rounded-[24px] border border-[#ecd9b3] bg-[#fffaf0] p-5"
                  onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    await onAddConnection(user.id, newConnectionForm);
                    setNewConnectionForm(emptyConnectionForm());
                  }}
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a07a2d]">
                        Add direct database
                      </div>
                      <p className="mt-2 text-sm text-[#7b6a48]">
                        Add MSSQL connection details for this user.
                      </p>
                    </div>
                  </div>

                  <ConnectionFields
                    title="New direct connection"
                    value={newConnectionForm}
                    onChange={setNewConnectionForm}
                    requirePassword
                  />

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateConnectionOpen(false);
                        setNewConnectionForm(emptyConnectionForm());
                      }}
                      className="rounded-full border border-[#dfc58d] bg-[#fff8e7] px-5 py-2.5 text-sm font-semibold text-[#6d5526]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingConnection}
                      className="rounded-full bg-[#2f2a21] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#443827] disabled:opacity-60"
                    >
                      {isCreatingConnection ? "Saving..." : "Add direct database"}
                    </button>
                  </div>
                </form>
              ) : null}

              {createMergedOpen ? (
                <form
                  className="space-y-4 rounded-[24px] border border-[#d7d5f2] bg-[#f8f7ff] p-5"
                  onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    await onAddMergedConnection(user.id, newMergedForm);
                    setNewMergedForm(emptyMergedConnectionForm());
                  }}
                >
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5650a4]">
                      Create merged database
                    </div>
                    <p className="mt-2 text-sm text-[#5d5a84]">
                      Pick at least two direct databases. The user will see this merged DB as an extra option.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <InputField
                      label="Merged label"
                      value={newMergedForm.label}
                      onChange={(next) =>
                        setNewMergedForm((current) => ({ ...current, label: next }))
                      }
                      placeholder="Main combined outlet"
                    />
                    <InputField
                      label="Merged database name"
                      value={newMergedForm.database}
                      onChange={(next) =>
                        setNewMergedForm((current) => ({ ...current, database: next }))
                      }
                      placeholder="merged_main_outlet"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-[#4a4678]">Source databases</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {directConnections.map((connection) => {
                        const checked = newMergedForm.sourceConnectionIds.includes(connection.id);
                        return (
                          <label
                            key={connection.id}
                            className="flex items-center gap-3 rounded-xl border border-[#d7d5f2] bg-white px-3 py-2 text-sm text-[#4a4678]"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                setNewMergedForm((current) => {
                                  if (event.target.checked) {
                                    return {
                                      ...current,
                                      sourceConnectionIds: [
                                        ...new Set([...current.sourceConnectionIds, connection.id]),
                                      ],
                                    };
                                  }

                                  return {
                                    ...current,
                                    sourceConnectionIds: current.sourceConnectionIds.filter(
                                      (id) => id !== connection.id
                                    ),
                                  };
                                });
                              }}
                              className="h-4 w-4 accent-[#5a56a8]"
                            />
                            <span>{connection.label || connection.database}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateMergedOpen(false);
                        setNewMergedForm(emptyMergedConnectionForm());
                      }}
                      className="rounded-full border border-[#d7d5f2] bg-white px-5 py-2.5 text-sm font-semibold text-[#4a4678]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingMerged}
                      className="rounded-full bg-[#5a56a8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4c4795] disabled:opacity-60"
                    >
                      {isCreatingMerged ? "Creating..." : "Create merged database"}
                    </button>
                  </div>
                </form>
              ) : null}

              {!directConnections.length ? (
                <div className="rounded-[24px] border border-dashed border-[#dfc58d] bg-[#fffaf0] px-5 py-6 text-sm text-[#7b6a48]">
                  No direct database connection has been saved for this user yet.
                </div>
              ) : null}

              {directConnections.map((connection) => {
                const form =
                  connectionForms[connection.id] || connectionFormFromConnection(connection);
                const isSaving = busyKey === `connection:${connection.id}`;
                const isDeleting = busyKey === `delete-connection:${connection.id}`;

                return (
                  <form
                    key={connection.id}
                    className="space-y-4 rounded-[24px] border border-[#ecd9b3] bg-[#fffcf7] p-5"
                    onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                      event.preventDefault();
                      await onSaveConnection(user.id, connection.id, form);
                    }}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="inline-flex items-center rounded-full border border-[#ead29d] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9f7322]">
                          {connection.label || connection.database}
                        </div>
                        <p className="mt-3 text-sm text-[#7b6a48]">
                          Last sync: {formatDateTime(connection.lastSyncAt)}
                        </p>
                        <p className="mt-1 text-xs text-[#8d7a55]">
                          {connection.profileId ? "Source: Saved database profile" : "Source: Custom direct database"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmation({
                            type: "delete-connection",
                            connectionId: connection.id,
                            title: `Delete ${connection.label || connection.database}?`,
                            description:
                              "This removes the selected direct database and all synced report data tied to it. Dependent merged databases will be updated automatically.",
                            confirmLabel: "Delete database",
                          })
                        }
                        disabled={isDeleting}
                        className="rounded-full border border-[#e1a0a0] bg-[#fff1f1] px-4 py-2 text-sm font-semibold text-[#9f2b2b] disabled:opacity-60"
                      >
                        {isDeleting ? "Deleting..." : "Delete database"}
                      </button>
                    </div>

                    <ConnectionFields
                      title="Connection details"
                      value={form}
                      onChange={(next) =>
                        setConnectionForms((current) => ({
                          ...current,
                          [connection.id]: next,
                        }))
                      }
                      requirePassword={false}
                    />

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSaving || isDeleting}
                        className="rounded-full bg-[#2f2a21] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#443827] disabled:opacity-60"
                      >
                        {isSaving ? "Saving..." : "Save connection"}
                      </button>
                    </div>
                  </form>
                );
              })}

              {mergedConnections.length ? (
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5650a4]">
                    Merged databases
                  </div>
                  {mergedConnections.map((connection) => {
                    const isDeleting = busyKey === `delete-connection:${connection.id}`;
                    const sourceLabels = connection.sourceConnectionIds.length
                      ? connection.sourceConnectionIds
                          .map((sourceId) => sourceLabelById.get(sourceId) || sourceId)
                          .join(", ")
                      : "No sources";

                    return (
                      <div
                        key={connection.id}
                        className="space-y-3 rounded-[24px] border border-[#d7d5f2] bg-[#f8f7ff] p-5"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="inline-flex items-center rounded-full border border-[#c7c2f0] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5650a4]">
                              {connection.label || connection.database}
                            </div>
                            <p className="mt-2 text-sm text-[#5d5a84]">Merged DB name: {connection.database}</p>
                            <p className="mt-1 text-sm text-[#5d5a84]">
                              Sources ({connection.sourceConnectionCount}): {sourceLabels}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmation({
                                type: "delete-connection",
                                connectionId: connection.id,
                                title: `Delete merged database ${connection.label || connection.database}?`,
                                description:
                                  "This removes only the merged database entry. Source direct databases stay unchanged.",
                                confirmLabel: "Delete merged database",
                              })
                            }
                            disabled={isDeleting}
                            className="rounded-full border border-[#e1a0a0] bg-[#fff1f1] px-4 py-2 text-sm font-semibold text-[#9f2b2b] disabled:opacity-60"
                          >
                            {isDeleting ? "Deleting..." : "Delete merged database"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.title || ""}
        description={confirmation?.description || ""}
        confirmLabel={confirmation?.confirmLabel || "Confirm"}
        busy={isDeletingUser || isDeletingConnection}
        onClose={() => setConfirmation(null)}
        onConfirm={async () => {
          if (!confirmation) return;

          if (confirmation.type === "delete-user") {
            await onDeleteUser(user.id);
          } else if (confirmation.connectionId) {
            await onDeleteConnection(user.id, confirmation.connectionId);
          }

          setConfirmation(null);
        }}
      />
    </>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#efdfbc] bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-[#a48548]">{label}</div>
      <div className="mt-2 text-sm font-semibold text-[#2f2a21]">{value}</div>
    </div>
  );
}
