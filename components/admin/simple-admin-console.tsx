"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConnectionFields, InputField } from "@/components/admin/form-fields";
import { UserDetailsModal } from "@/components/admin/user-details-modal";
import { UsersTable } from "@/components/admin/users-table";
import {
  apiRequest,
  apiRequestWithMeta,
  buildConnectionPayload,
  emptyCreateUserForm,
  type ConnectionFormState,
  type CreateUserFormState,
  type ManagedConnection,
  type ManagedUser,
  type PaginationMeta,
  type SessionUser,
} from "@/lib/admin-api";
import {
  clearSessionStorage,
  loadSession,
  saveSession,
} from "@/lib/admin-session";

const LOGO_URL =
  "https://res.cloudinary.com/dirw3ywng/image/upload/v1772945237/logo_cmkhfw.png";
const PAGE_LIMIT = 10;
const USERS_QUERY_KEY = "admin-users";
const EMPTY_USERS: ManagedUser[] = [];

function getUsersQueryKey(token: string | null, page: number, search: string) {
  return [USERS_QUERY_KEY, token, page, search, PAGE_LIMIT] as const;
}

export function SimpleAdminConsole() {
  const queryClient = useQueryClient();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createUserForm, setCreateUserForm] = useState<CreateUserFormState>(() => ({
    ...emptyCreateUserForm(),
    attachConnection: true,
  }));
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    const savedSession = loadSession();
    if (!savedSession) return;

    if (savedSession.user.role !== "admin") {
      clearSessionStorage();
      toast.error("Only admin accounts can access this panel.");
      return;
    }

    setSessionToken(savedSession.token);
    setSessionUser(savedSession.user);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchValue.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchValue]);

  const authenticated = Boolean(sessionToken && sessionUser?.role === "admin");

  const usersQuery = useQuery({
    queryKey: getUsersQueryKey(sessionToken, page, debouncedSearch),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_LIMIT),
      });

      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }

      return apiRequestWithMeta<ManagedUser[], PaginationMeta>(
        `/api/admin/users?${params.toString()}`,
        { token: sessionToken }
      );
    },
    enabled: authenticated,
    placeholderData: (previousData) => previousData,
  });

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      apiRequest<{ token: string; user: SessionUser }>("/api/auth/login", {
        body: { email, password },
      }),
  });

  const createUserMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest<ManagedUser>("/api/admin/users", {
        token: sessionToken,
        body: payload,
      }),
  });

  const saveConnectionMutation = useMutation({
    mutationFn: ({
      userId,
      connectionId,
      payload,
    }: {
      userId: string;
      connectionId: string;
      payload: ConnectionFormState;
    }) =>
      apiRequest<ManagedConnection>(
        `/api/admin/users/${userId}/connections/${connectionId}`,
        {
          method: "PATCH",
          token: sessionToken,
          body: buildConnectionPayload(payload, { includePassword: false }),
        }
      ),
  });

  const addConnectionMutation = useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: string;
      payload: ConnectionFormState;
    }) =>
      apiRequest<ManagedConnection>(`/api/admin/users/${userId}/connections`, {
        token: sessionToken,
        body: buildConnectionPayload(payload, { includePassword: true }),
      }),
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: ({
      userId,
      connectionId,
    }: {
      userId: string;
      connectionId: string;
    }) =>
      apiRequest<{ id: string }>(
        `/api/admin/users/${userId}/connections/${connectionId}`,
        {
          method: "DELETE",
          token: sessionToken,
        }
      ),
  });

  const deleteUserMutation = useMutation({
    mutationFn: ({ userId }: { userId: string }) =>
      apiRequest<{ id: string }>(`/api/admin/users/${userId}`, {
        method: "DELETE",
        token: sessionToken,
      }),
  });

  useEffect(() => {
    if (!usersQuery.data) return;

    if (usersQuery.data.meta && usersQuery.data.meta.page !== page) {
      setPage(usersQuery.data.meta.page);
    }

    setSelectedUser((current) =>
      current
        ? usersQuery.data?.data.find((user) => user.id === current.id) || current
        : null
    );
  }, [page, usersQuery.data]);

  useEffect(() => {
    if (!usersQuery.error) return;

    const message =
      usersQuery.error instanceof Error
        ? usersQuery.error.message
        : "Failed to load users";
    const normalizedMessage = message.toLowerCase();

    if (
      normalizedMessage.includes("unauthorized") ||
      normalizedMessage.includes("forbidden") ||
      normalizedMessage.includes("expired") ||
      normalizedMessage.includes("token")
    ) {
      clearSessionStorage();
      setSessionToken(null);
      setSessionUser(null);
      setSelectedUser(null);
      queryClient.removeQueries({ queryKey: [USERS_QUERY_KEY] });
    }

    toast.error(message);
  }, [queryClient, usersQuery.error]);

  const users = usersQuery.data?.data || EMPTY_USERS;
  const meta =
    usersQuery.data?.meta ||
    ({
      page,
      limit: PAGE_LIMIT,
      totalItems: 0,
      totalPages: 1,
      search: debouncedSearch,
    } satisfies PaginationMeta);
  const loadingUsers = authenticated && (usersQuery.isPending || usersQuery.isFetching);

  const totalConnections = useMemo(
    () => users.reduce((sum, user) => sum + user.totalConnections, 0),
    [users]
  );

  const refreshUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: [USERS_QUERY_KEY] });
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyKey("login");

    try {
      const response = await loginMutation.mutateAsync({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (response.user.role !== "admin") {
        throw new Error("Only admin accounts can access this panel.");
      }

      saveSession(response.token, response.user);
      setSessionToken(response.token);
      setSessionUser(response.user);
      setLoginPassword("");
      setPage(1);
      toast.success(`Welcome back, ${response.user.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      toast.error(message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleLogout = () => {
    clearSessionStorage();
    setSessionToken(null);
    setSessionUser(null);
    setSelectedUser(null);
    setCreateDialogOpen(false);
    setSearchValue("");
    setDebouncedSearch("");
    setPage(1);
    queryClient.removeQueries({ queryKey: [USERS_QUERY_KEY] });
    toast.success("Admin session cleared.");
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyKey("create-user");

    try {
      const payload: Record<string, unknown> = {
        name: createUserForm.name.trim(),
        email: createUserForm.email.trim(),
        password: createUserForm.password,
        role: createUserForm.role,
        connection: buildConnectionPayload(createUserForm.connection, {
          includePassword: true,
        }),
      };

      await createUserMutation.mutateAsync(payload);
      setPage(1);
      await refreshUsers();
      setCreateUserForm({ ...emptyCreateUserForm(), attachConnection: true });
      setCreateDialogOpen(false);
      toast.success("User created with database connection.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create user";
      toast.error(message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveConnection = async (
    userId: string,
    connectionId: string,
    payload: ConnectionFormState
  ) => {
    setBusyKey(`connection:${connectionId}`);

    try {
      await saveConnectionMutation.mutateAsync({ userId, connectionId, payload });
      await refreshUsers();
      toast.success("Connection updated.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update connection";
      toast.error(message);
      throw error;
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddConnection = async (
    userId: string,
    payload: ConnectionFormState
  ) => {
    setBusyKey(`add-connection:${userId}`);

    try {
      await addConnectionMutation.mutateAsync({ userId, payload });
      await refreshUsers();
      toast.success("Database connection created.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create connection";
      toast.error(message);
      throw error;
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteConnection = async (userId: string, connectionId: string) => {
    setBusyKey(`delete-connection:${connectionId}`);

    try {
      await deleteConnectionMutation.mutateAsync({ userId, connectionId });
      await refreshUsers();
      toast.success("Database connection deleted.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete connection";
      toast.error(message);
      throw error;
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setBusyKey(`delete-user:${userId}`);

    try {
      await deleteUserMutation.mutateAsync({ userId });
      setSelectedUser(null);
      await refreshUsers();
      toast.success("User deleted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete user";
      toast.error(message);
      throw error;
    } finally {
      setBusyKey(null);
    }
  };

  if (!authenticated) {
    return (
      <LoginScreen
        busyKey={busyKey}
        loginEmail={loginEmail}
        loginPassword={loginPassword}
        onLogin={handleLogin}
        onLoginEmailChange={setLoginEmail}
        onLoginPasswordChange={setLoginPassword}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f1e6] px-4 py-6 text-[#2f2a21] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <DashboardHeader
          sessionUser={sessionUser}
          totalUsers={meta.totalItems}
          totalConnections={totalConnections}
          loadingUsers={loadingUsers}
          onRefresh={() => {
            refreshUsers().catch((error: Error) => {
              toast.error(error.message || "Failed to refresh users");
            });
          }}
          onOpenCreateUser={() => setCreateDialogOpen(true)}
          onLogout={handleLogout}
        />

        <section className="space-y-6">
          <UsersTable
            users={users}
            meta={meta}
            searchValue={searchValue}
            loading={loadingUsers}
            onSearchChange={(value) => {
              setSearchValue(value);
              setPage(1);
            }}
            onPageChange={(nextPage) => setPage(nextPage)}
            onRowClick={(user) => setSelectedUser(user)}
          />
        </section>
      </div>

      {createDialogOpen ? (
        <CreateUserDialog
          busyKey={busyKey}
          form={createUserForm}
          onClose={() => {
            setCreateDialogOpen(false);
            setCreateUserForm({ ...emptyCreateUserForm(), attachConnection: true });
          }}
          onFormChange={setCreateUserForm}
          onSubmit={handleCreateUser}
        />
      ) : null}

      {selectedUser ? (
        <UserDetailsModal
          key={`${selectedUser.id}-${selectedUser.updatedAt}-${selectedUser.connections
            .map((connection) => connection.id + connection.updatedAt)
            .join("|")}`}
          user={selectedUser}
          busyKey={busyKey}
          onClose={() => setSelectedUser(null)}
          onSaveConnection={handleSaveConnection}
          onAddConnection={handleAddConnection}
          onDeleteConnection={handleDeleteConnection}
          onDeleteUser={handleDeleteUser}
        />
      ) : null}
    </main>
  );
}

function LoginScreen({
  busyKey,
  loginEmail,
  loginPassword,
  onLogin,
  onLoginEmailChange,
  onLoginPasswordChange,
}: {
  busyKey: string | null;
  loginEmail: string;
  loginPassword: string;
  onLogin: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onLoginEmailChange: (value: string) => void;
  onLoginPasswordChange: (value: string) => void;
}) {
  return (
    <main className="min-h-screen bg-[#ececec] px-4 py-8 sm:px-6 md:py-12">
      <div className="mx-auto flex min-h-[85vh] w-full max-w-[760px] flex-col items-center justify-center gap-10">
        <div className="flex items-center gap-4 rounded-lg bg-white px-6 py-4 shadow-sm">
          <Image
            src={LOGO_URL}
            alt="Ivangraf logo"
            width={80}
            height={80}
            className="h-10 w-10 object-contain"
            unoptimized
          />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f7322]">
              Admin Control Panel
            </div>
            <div className="mt-1 text-lg font-semibold text-[#2f2a21]">
              User Management
            </div>
          </div>
        </div>

        <div className="w-full max-w-[560px] rounded-2xl bg-white p-8 shadow-[0_24px_60px_rgba(209,165,84,0.15)]">
          <form onSubmit={onLogin} className="space-y-8 rounded-xl">
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-[#2f2a21]">
                Sign in
              </h1>
              <p className="text-sm text-[#7b6a48]">
                Use an existing admin account to manage users and database connections.
              </p>
            </div>

            <div className="space-y-6">
              <InputField
                label="Email"
                value={loginEmail}
                onChange={onLoginEmailChange}
                type="email"
                required
              />
              <InputField
                label="Password"
                value={loginPassword}
                onChange={onLoginPasswordChange}
                type="password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={busyKey === "login"}
              className="h-14 w-full rounded-lg border-none bg-gradient-to-b from-[#e3b34c] via-[#d4a035] to-[#c18a24] text-lg font-medium text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busyKey === "login" ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function DashboardHeader({
  sessionUser,
  totalUsers,
  totalConnections,
  loadingUsers,
  onRefresh,
  onOpenCreateUser,
  onLogout,
}: {
  sessionUser: SessionUser | null;
  totalUsers: number;
  totalConnections: number;
  loadingUsers: boolean;
  onRefresh: () => void;
  onOpenCreateUser: () => void;
  onLogout: () => void;
}) {
  return (
    <section className="mb-6 rounded-[28px] border border-[#e7d7b6] bg-white p-6 shadow-[0_18px_40px_rgba(194,157,86,0.10)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff6e3]">
            <Image
              src={LOGO_URL}
              alt="Ivangraf logo"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              unoptimized
            />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a07a2d]">
              Admin Users
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-[#2f2a21]">
              Users and database connections
            </h1>
            <p className="mt-1 text-sm text-[#7b6a48]">
              Logged in as {sessionUser?.name || "Admin"}.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <HeaderMetric label="Users" value={String(totalUsers)} />
          <HeaderMetric label="Connections" value={String(totalConnections)} />
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-full border border-[#dbbe80] bg-[#fff4d7] px-4 py-2.5 text-sm font-semibold text-[#6d5526] transition hover:bg-[#ffefc2]"
          >
            {loadingUsers ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={onOpenCreateUser}
            className="rounded-full bg-gradient-to-b from-[#e3b34c] via-[#d4a035] to-[#c18a24] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            Create user
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-full border border-[#d5b56d] bg-white px-4 py-2.5 text-sm font-semibold text-[#5d4a25] transition hover:bg-[#fff8e7]"
          >
            Logout
          </button>
        </div>
      </div>
    </section>
  );
}

function CreateUserDialog({
  busyKey,
  form,
  onClose,
  onSubmit,
  onFormChange,
}: {
  busyKey: string | null;
  form: CreateUserFormState;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onFormChange: (value: CreateUserFormState) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
      <div className="w-full max-w-3xl rounded-[28px] border border-[#e5d5b3] bg-white shadow-[0_28px_70px_rgba(0,0,0,0.18)]">
        <form className="space-y-5 p-6" onSubmit={onSubmit}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a07a2d]">
                Create user
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-[#2f2a21]">
                Create account with connection
              </h2>
              <p className="mt-2 text-sm text-[#7b6a48]">
                Create the user and save the first database connection in one step.
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

          <div className="grid gap-4 sm:grid-cols-2">
            <InputField
              label="Full name"
              value={form.name}
              onChange={(next) => onFormChange({ ...form, name: next })}
              required
            />
            <InputField
              label="Email"
              value={form.email}
              onChange={(next) => onFormChange({ ...form, email: next })}
              type="email"
              required
            />
            <InputField
              label="Password"
              value={form.password}
              onChange={(next) => onFormChange({ ...form, password: next })}
              type="password"
              required
            />
            <label className="flex flex-col gap-2 text-sm font-medium text-[#4d4332]">
              <span>Role</span>
              <select
                value={form.role}
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    role: event.target.value as CreateUserFormState["role"],
                  })
                }
                className="h-11 rounded-xl border border-[#e4cca0] bg-white px-4 text-sm text-[#2f2a21] shadow-sm outline-none transition focus:border-[#cf9a39] focus:ring-2 focus:ring-[#f2d491]"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>

          <ConnectionFields
            title="Database connection"
            value={form.connection}
            onChange={(next) => onFormChange({ ...form, connection: next })}
            requirePassword
          />

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#dfc58d] bg-[#fff8e7] px-5 py-2.5 text-sm font-semibold text-[#6d5526]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busyKey === "create-user"}
              className="rounded-full bg-gradient-to-b from-[#e3b34c] via-[#d4a035] to-[#c18a24] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {busyKey === "create-user" ? "Creating..." : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-[#ead29d] bg-[#fff8e7] px-4 py-2 text-sm font-semibold text-[#6d5526]">
      {label}: {value}
    </div>
  );
}
