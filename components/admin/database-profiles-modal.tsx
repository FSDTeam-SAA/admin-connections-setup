"use client";

import { FormEvent, useState } from "react";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ConnectionFields } from "@/components/admin/form-fields";
import {
  connectionFormFromConnection,
  emptyConnectionForm,
  formatDateTime,
  type ConnectionFormState,
  type DatabaseProfile,
  type ManagedConnection,
} from "@/lib/admin-api";

function toConnectionForm(profile: DatabaseProfile): ConnectionFormState {
  return connectionFormFromConnection({
    id: profile.id,
    profileId: profile.id,
    kind: "direct",
    isMerged: false,
    sourceConnectionIds: [],
    sourceConnectionCount: 0,
    host: profile.host,
    port: profile.port,
    database: profile.database,
    mongoRefName: profile.mongoRefName,
    username: profile.username,
    encrypt: profile.encrypt,
    label: profile.label,
    lastSyncAt: null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  } satisfies ManagedConnection);
}

export function DatabaseProfilesModal({
  profiles,
  busyKey,
  onClose,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
}: {
  profiles: DatabaseProfile[];
  busyKey: string | null;
  onClose: () => void;
  onCreateProfile: (payload: ConnectionFormState) => Promise<void>;
  onUpdateProfile: (profileId: string, payload: ConnectionFormState) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
}) {
  const [newProfileForm, setNewProfileForm] = useState<ConnectionFormState>(() => emptyConnectionForm());
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editForms, setEditForms] = useState<Record<string, ConnectionFormState>>(() =>
    Object.fromEntries(profiles.map((profile) => [profile.id, toConnectionForm(profile)]))
  );
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null);

  const createBusy = busyKey === "create-db-profile";
  const deleteBusy = deleteProfileId ? busyKey === `delete-db-profile:${deleteProfileId}` : false;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
        <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-[#e5d5b3] bg-white shadow-[0_28px_70px_rgba(0,0,0,0.18)]">
          <div className="flex items-start justify-between gap-4 border-b border-[#efdfbc] bg-[#fffaf0] px-6 py-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a07a2d]">
                Database library
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-[#2f2a21]">
                Saved databases
              </h2>
              <p className="mt-1 text-sm text-[#7b6a48]">
                Save DB credentials once, then connect them to users later.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#dfc58d] bg-[#fff8e7] px-4 py-2 text-sm font-semibold text-[#6d5526]"
            >
              Close
            </button>
          </div>

          <div className="overflow-y-auto px-6 py-6">
            <form
              className="space-y-4 rounded-[24px] border border-[#ecd9b3] bg-[#fffaf0] p-5"
              onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                await onCreateProfile(newProfileForm);
                setNewProfileForm(emptyConnectionForm());
              }}
            >
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a07a2d]">
                  Add database profile
                </div>
                <p className="mt-2 text-sm text-[#7b6a48]">
                  This creates a reusable DB entry for user assignment.
                </p>
              </div>
              <ConnectionFields
                title="Database credentials"
                value={newProfileForm}
                onChange={setNewProfileForm}
                requirePassword
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={createBusy}
                  className="rounded-full bg-[#2f2a21] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#443827] disabled:opacity-60"
                >
                  {createBusy ? "Saving..." : "Save database"}
                </button>
              </div>
            </form>

            <div className="mt-6 space-y-4">
              {!profiles.length ? (
                <div className="rounded-[24px] border border-dashed border-[#dfc58d] bg-[#fffaf0] px-5 py-6 text-sm text-[#7b6a48]">
                  No saved databases yet.
                </div>
              ) : null}

              {profiles.map((profile) => {
                const isEditing = editingProfileId === profile.id;
                const form = editForms[profile.id] || toConnectionForm(profile);
                const updateBusy = busyKey === `update-db-profile:${profile.id}`;
                const profileDeleteBusy = busyKey === `delete-db-profile:${profile.id}`;
                const isConnected = profile.isConnected ?? profile.assignedConnections > 0;

                return (
                  <div
                    key={profile.id}
                    className="space-y-4 rounded-[24px] border border-[#ecd9b3] bg-[#fffcf7] p-5"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="inline-flex items-center rounded-full border border-[#ead29d] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9f7322]">
                          {profile.label || profile.database}
                        </div>
                        <p className="mt-2 text-sm text-[#7b6a48]">
                          {profile.host}:{profile.port} - {profile.database}
                        </p>
                        <p className="mt-2 text-xs">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${
                              isConnected
                                ? "border-[#c9d8b0] bg-[#f6faef] text-[#50652b]"
                                : "border-[#e4cca0] bg-[#fff8e7] text-[#7b6a48]"
                            }`}
                          >
                            Status: {isConnected ? "Already connected" : "Not connected"}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-[#8d7a55]">
                          Assigned connections: {profile.assignedConnections} | Updated:{" "}
                          {formatDateTime(profile.updatedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingProfileId((current) => (current === profile.id ? null : profile.id))}
                          className="rounded-full border border-[#dfc58d] bg-[#fff8e7] px-4 py-2 text-sm font-semibold text-[#6d5526]"
                        >
                          {isEditing ? "Hide edit" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteProfileId(profile.id)}
                          disabled={profileDeleteBusy}
                          className="rounded-full border border-[#e1a0a0] bg-[#fff1f1] px-4 py-2 text-sm font-semibold text-[#9f2b2b] disabled:opacity-60"
                        >
                          {profileDeleteBusy ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <form
                        className="space-y-4"
                        onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                          event.preventDefault();
                          await onUpdateProfile(profile.id, form);
                          setEditingProfileId(null);
                        }}
                      >
                        <ConnectionFields
                          title="Edit saved database"
                          value={form}
                          onChange={(next) =>
                            setEditForms((current) => ({
                              ...current,
                              [profile.id]: next,
                            }))
                          }
                          requirePassword={false}
                        />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={updateBusy}
                            className="rounded-full bg-[#2f2a21] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#443827] disabled:opacity-60"
                          >
                            {updateBusy ? "Saving..." : "Save changes"}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(deleteProfileId)}
        title="Delete saved database?"
        description="This deletes the saved profile from the library. Existing user connections created from it will stay and become custom connections."
        confirmLabel="Delete"
        busy={deleteBusy}
        onClose={() => setDeleteProfileId(null)}
        onConfirm={async () => {
          if (!deleteProfileId) return;
          await onDeleteProfile(deleteProfileId);
          setDeleteProfileId(null);
        }}
      />
    </>
  );
}
