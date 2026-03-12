"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ConnectionFields, InputField } from "@/components/admin/form-fields";
import { UsersTable } from "@/components/admin/users-table";
import {
  apiRequest,
  apiRequestWithMeta,
  buildConnectionPayload,
  buildMergedConnectionPayload,
  emptyConnectionForm,
  emptyCreateUserForm,
  emptyMergedConnectionForm,
  formatDateTime,
  type ConnectionFormState,
  type CreateUserFormState,
  type DatabaseProfile,
  type ManagedConnection,
  type ManagedUser,
  type MergedConnectionFormState,
  type PaginationMeta,
  type SessionUser,
} from "@/lib/admin-api";
import { clearSessionStorage, loadSession, saveSession } from "@/lib/admin-session";

const LOGO_URL =
  "https://res.cloudinary.com/dirw3ywng/image/upload/v1772945237/logo_cmkhfw.png";
const PAGE_LIMIT = 10;
const ASSIGNMENT_USER_LIMIT = 12;
const DATABASE_PROFILE_PAGE_LIMIT = 8;
const USERS_QUERY_KEY = "admin-users";
const DATABASE_PROFILES_QUERY_KEY = "admin-database-profiles";
const EMPTY_USERS: ManagedUser[] = [];
const EMPTY_DATABASE_PROFILES: DatabaseProfile[] = [];

type AdminTab = "users" | "connections" | "assignments";

function getUsersQueryKey(token: string | null, page: number, search: string) {
  return [USERS_QUERY_KEY, token, "paged", page, search, PAGE_LIMIT] as const;
}

function getAssignmentUsersQueryKey(token: string | null, page: number, search: string) {
  return [USERS_QUERY_KEY, token, "assignment", page, search, ASSIGNMENT_USER_LIMIT] as const;
}

function getDatabaseProfilesQueryKey(
  token: string | null,
  page: number,
  search: string
) {
  return [DATABASE_PROFILES_QUERY_KEY, token, "connections", page, search, DATABASE_PROFILE_PAGE_LIMIT] as const;
}

function profileToConnectionForm(profile: DatabaseProfile): ConnectionFormState {
  return {
    host: profile.host,
    port: String(profile.port),
    database: profile.database,
    username: profile.username,
    password: "",
    label: profile.label || profile.database,
    encrypt: profile.encrypt,
  };
}

function isMergedConnection(connection: ManagedConnection) {
  return connection.kind === "merged" || Boolean(connection.isMerged);
}

async function fetchAllDatabaseProfiles(token: string | null): Promise<DatabaseProfile[]> {
  const limit = 100;
  let page = 1;
  let totalPages = 1;
  const allProfiles: DatabaseProfile[] = [];

  while (page <= totalPages) {
    const response = await apiRequestWithMeta<DatabaseProfile[], PaginationMeta>(
      `/api/admin/database-profiles?page=${page}&limit=${limit}`,
      { token }
    );
    allProfiles.push(...response.data);
    totalPages = response.meta?.totalPages || 1;
    page += 1;
  }

  return allProfiles;
}

export function SimpleAdminConsole() {
  const queryClient = useQueryClient();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createUserForm, setCreateUserForm] = useState<CreateUserFormState>(() => emptyCreateUserForm());
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [assignmentSearchValue, setAssignmentSearchValue] = useState("");
  const [debouncedAssignmentSearch, setDebouncedAssignmentSearch] = useState("");
  const [profileSearchValue, setProfileSearchValue] = useState("");
  const [debouncedProfileSearch, setDebouncedProfileSearch] = useState("");
  const [page, setPage] = useState(1);
  const [profilePage, setProfilePage] = useState(1);
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [selectedAssignmentUserId, setSelectedAssignmentUserId] = useState<string>("");
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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedAssignmentSearch(assignmentSearchValue.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [assignmentSearchValue]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedProfileSearch(profileSearchValue.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [profileSearchValue]);

  const authenticated = Boolean(sessionToken && sessionUser?.role === "admin");

  const usersQuery = useQuery({
    queryKey: getUsersQueryKey(sessionToken, page, debouncedSearch),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_LIMIT),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);

      return apiRequestWithMeta<ManagedUser[], PaginationMeta>(
        `/api/admin/users?${params.toString()}`,
        { token: sessionToken }
      );
    },
    enabled: authenticated,
    placeholderData: (previousData) => previousData,
  });

  const assignmentUsersQuery = useQuery({
    queryKey: getAssignmentUsersQueryKey(sessionToken, assignmentPage, debouncedAssignmentSearch),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(assignmentPage),
        limit: String(ASSIGNMENT_USER_LIMIT),
      });
      if (debouncedAssignmentSearch) params.set("search", debouncedAssignmentSearch);

      return apiRequestWithMeta<ManagedUser[], PaginationMeta>(
        `/api/admin/users?${params.toString()}`,
        { token: sessionToken }
      );
    },
    enabled: authenticated,
    placeholderData: (previousData) => previousData,
  });

  const databaseProfilesQuery = useQuery({
    queryKey: getDatabaseProfilesQueryKey(sessionToken, profilePage, debouncedProfileSearch),
    queryFn: () =>
      apiRequestWithMeta<DatabaseProfile[], PaginationMeta>(
        `/api/admin/database-profiles?page=${profilePage}&limit=${DATABASE_PROFILE_PAGE_LIMIT}${
          debouncedProfileSearch
            ? `&search=${encodeURIComponent(debouncedProfileSearch)}`
            : ""
        }`,
        { token: sessionToken }
      ),
    enabled: authenticated,
    placeholderData: (previousData) => previousData,
  });

  const assignmentProfilesQuery = useQuery({
    queryKey: [DATABASE_PROFILES_QUERY_KEY, sessionToken, "assignments", "all"],
    queryFn: () => fetchAllDatabaseProfiles(sessionToken),
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

  const createDatabaseProfileMutation = useMutation({
    mutationFn: (payload: ConnectionFormState) =>
      apiRequest<DatabaseProfile>("/api/admin/database-profiles", {
        token: sessionToken,
        body: buildConnectionPayload(payload, { includePassword: true }),
      }),
  });

  const updateDatabaseProfileMutation = useMutation({
    mutationFn: ({
      profileId,
      payload,
    }: {
      profileId: string;
      payload: ConnectionFormState;
    }) =>
      apiRequest<DatabaseProfile>(`/api/admin/database-profiles/${profileId}`, {
        method: "PATCH",
        token: sessionToken,
        body: buildConnectionPayload(payload, { includePassword: false }),
      }),
  });

  const deleteDatabaseProfileMutation = useMutation({
    mutationFn: ({ profileId }: { profileId: string }) =>
      apiRequest<{ id: string }>(`/api/admin/database-profiles/${profileId}`, {
        method: "DELETE",
        token: sessionToken,
      }),
  });

  const assignProfileToUserMutation = useMutation({
    mutationFn: ({
      userId,
      profileId,
    }: {
      userId: string;
      profileId: string;
    }) =>
      apiRequest<ManagedConnection>(`/api/admin/users/${userId}/connections/from-profile`, {
        token: sessionToken,
        body: { profileId },
      }),
  });

  const addMergedConnectionMutation = useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: string;
      payload: MergedConnectionFormState;
    }) =>
      apiRequest<ManagedConnection>(`/api/admin/users/${userId}/merged-connections`, {
        token: sessionToken,
        body: buildMergedConnectionPayload(payload),
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
      apiRequest<{ id: string }>(`/api/admin/users/${userId}/connections/${connectionId}`, {
        method: "DELETE",
        token: sessionToken,
      }),
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
  }, [page, usersQuery.data]);

  useEffect(() => {
    if (!assignmentUsersQuery.data) return;
    if (assignmentUsersQuery.data.meta && assignmentUsersQuery.data.meta.page !== assignmentPage) {
      setAssignmentPage(assignmentUsersQuery.data.meta.page);
    }
  }, [assignmentPage, assignmentUsersQuery.data]);

  useEffect(() => {
    if (!databaseProfilesQuery.data) return;
    if (databaseProfilesQuery.data.meta && databaseProfilesQuery.data.meta.page !== profilePage) {
      setProfilePage(databaseProfilesQuery.data.meta.page);
    }
  }, [profilePage, databaseProfilesQuery.data]);

  const handleAuthFailureIfNeeded = useCallback(
    (message: string) => {
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
        setSelectedAssignmentUserId("");
        queryClient.removeQueries({ queryKey: [USERS_QUERY_KEY] });
        queryClient.removeQueries({ queryKey: [DATABASE_PROFILES_QUERY_KEY] });
      }
    },
    [queryClient]
  );

  useEffect(() => {
    if (!usersQuery.error) return;
    const message =
      usersQuery.error instanceof Error
        ? usersQuery.error.message
        : "Failed to load users";
    handleAuthFailureIfNeeded(message);
    toast.error(message);
  }, [usersQuery.error, handleAuthFailureIfNeeded]);

  useEffect(() => {
    if (!assignmentUsersQuery.error) return;
    const message =
      assignmentUsersQuery.error instanceof Error
        ? assignmentUsersQuery.error.message
        : "Failed to load assignment users";
    handleAuthFailureIfNeeded(message);
    toast.error(message);
  }, [assignmentUsersQuery.error, handleAuthFailureIfNeeded]);

  useEffect(() => {
    if (!databaseProfilesQuery.error) return;
    const message =
      databaseProfilesQuery.error instanceof Error
        ? databaseProfilesQuery.error.message
        : "Failed to load saved databases";
    handleAuthFailureIfNeeded(message);
    toast.error(message);
  }, [databaseProfilesQuery.error, handleAuthFailureIfNeeded]);

  useEffect(() => {
    if (!assignmentProfilesQuery.error) return;
    const message =
      assignmentProfilesQuery.error instanceof Error
        ? assignmentProfilesQuery.error.message
        : "Failed to load assignable databases";
    handleAuthFailureIfNeeded(message);
    toast.error(message);
  }, [assignmentProfilesQuery.error, handleAuthFailureIfNeeded]);

  const users = usersQuery.data?.data || EMPTY_USERS;
  const assignmentUsers = assignmentUsersQuery.data?.data || EMPTY_USERS;
  const databaseProfiles = databaseProfilesQuery.data?.data || EMPTY_DATABASE_PROFILES;
  const assignmentProfiles = assignmentProfilesQuery.data || EMPTY_DATABASE_PROFILES;
  const usersMeta =
    usersQuery.data?.meta ||
    ({
      page,
      limit: PAGE_LIMIT,
      totalItems: 0,
      totalPages: 1,
      search: debouncedSearch,
    } satisfies PaginationMeta);
  const assignmentUsersMeta =
    assignmentUsersQuery.data?.meta ||
    ({
      page: assignmentPage,
      limit: ASSIGNMENT_USER_LIMIT,
      totalItems: 0,
      totalPages: 1,
      search: debouncedAssignmentSearch,
    } satisfies PaginationMeta);
  const databaseProfilesMeta =
    databaseProfilesQuery.data?.meta ||
    ({
      page: profilePage,
      limit: DATABASE_PROFILE_PAGE_LIMIT,
      totalItems: 0,
      totalPages: 1,
      search: debouncedProfileSearch,
    } satisfies PaginationMeta);
  const loadingUsers = authenticated && (usersQuery.isPending || usersQuery.isFetching);
  const loadingAssignmentUsers =
    authenticated && (assignmentUsersQuery.isPending || assignmentUsersQuery.isFetching);
  const loadingDatabaseProfiles =
    authenticated && (databaseProfilesQuery.isPending || databaseProfilesQuery.isFetching);
  const loadingAssignmentProfiles =
    authenticated && (assignmentProfilesQuery.isPending || assignmentProfilesQuery.isFetching);
  const totalConnections = useMemo(
    () => users.reduce((sum, user) => sum + user.totalConnections, 0),
    [users]
  );

  useEffect(() => {
    if (!assignmentUsers.length) {
      setSelectedAssignmentUserId("");
      return;
    }

    if (!selectedAssignmentUserId) {
      setSelectedAssignmentUserId(assignmentUsers[0].id);
      return;
    }

    const stillExists = assignmentUsers.some((user) => user.id === selectedAssignmentUserId);
    if (!stillExists) {
      setSelectedAssignmentUserId(assignmentUsers[0].id);
    }
  }, [assignmentUsers, selectedAssignmentUserId]);

  const refreshUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: [USERS_QUERY_KEY] });
  };

  const refreshDatabaseProfiles = async () => {
    await queryClient.invalidateQueries({ queryKey: [DATABASE_PROFILES_QUERY_KEY] });
  };

  const refreshAdminData = async () => {
    await Promise.all([refreshUsers(), refreshDatabaseProfiles()]);
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
      setProfilePage(1);
      setAssignmentPage(1);
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
    setCreateDialogOpen(false);
    setSearchValue("");
    setDebouncedSearch("");
    setAssignmentSearchValue("");
    setDebouncedAssignmentSearch("");
    setProfileSearchValue("");
    setDebouncedProfileSearch("");
    setSelectedAssignmentUserId("");
    setPage(1);
    setProfilePage(1);
    setAssignmentPage(1);
    queryClient.removeQueries({ queryKey: [USERS_QUERY_KEY] });
    queryClient.removeQueries({ queryKey: [DATABASE_PROFILES_QUERY_KEY] });
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
      };

      if (createUserForm.attachConnection) {
        payload.connection = buildConnectionPayload(createUserForm.connection, {
          includePassword: true,
        });
      }

      await createUserMutation.mutateAsync(payload);
      setPage(1);
      await refreshUsers();
      setCreateUserForm(emptyCreateUserForm());
      setCreateDialogOpen(false);
      toast.success(
        createUserForm.attachConnection
          ? "User created with first database connection."
          : "User created."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create user";
      toast.error(message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleCreateDatabaseProfile = async (payload: ConnectionFormState) => {
    setBusyKey("create-db-profile");
    try {
      await createDatabaseProfileMutation.mutateAsync(payload);
      setProfilePage(1);
      await refreshDatabaseProfiles();
      toast.success("Database saved in connection list.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save database connection";
      toast.error(message);
      throw error;
    } finally {
      setBusyKey(null);
    }
  };

  const handleUpdateDatabaseProfile = async (
    profileId: string,
    payload: ConnectionFormState
  ) => {
    setBusyKey(`update-db-profile:${profileId}`);
    try {
      await updateDatabaseProfileMutation.mutateAsync({ profileId, payload });
      await refreshDatabaseProfiles();
      toast.success("Connection profile updated.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update connection profile";
      toast.error(message);
      throw error;
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteDatabaseProfile = async (profileId: string) => {
    setBusyKey(`delete-db-profile:${profileId}`);
    try {
      await deleteDatabaseProfileMutation.mutateAsync({ profileId });
      await refreshAdminData();
      toast.success("Connection profile deleted.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete connection profile";
      toast.error(message);
      throw error;
    } finally {
      setBusyKey(null);
    }
  };

  const handleAssignProfileToUser = async (userId: string, profileId: string) => {
    setBusyKey(`assign-profile:${userId}`);
    try {
      await assignProfileToUserMutation.mutateAsync({ userId, profileId });
      await refreshUsers();
      toast.success("Database assigned to user.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to assign database";
      toast.error(message);
      throw error;
    } finally {
      setBusyKey(null);
    }
  };

  const handleCreateMergedConnection = async (
    userId: string,
    payload: MergedConnectionFormState
  ) => {
    setBusyKey(`add-merged:${userId}`);
    try {
      await addMergedConnectionMutation.mutateAsync({ userId, payload });
      await refreshUsers();
      toast.success("Merged database created.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create merged database";
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
      toast.success("Connection removed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove connection";
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
    <main className="min-h-screen bg-[#f6f1e6] px-4 py-5 text-[#2f2a21] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <TopHeader
          sessionUser={sessionUser}
          onRefresh={() => {
            refreshAdminData().catch((error: Error) => {
              toast.error(error.message || "Failed to refresh data");
            });
          }}
          onLogout={handleLogout}
        />

        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <DashboardSidebar
            activeTab={activeTab}
            totalUsers={usersMeta.totalItems}
            totalConnections={totalConnections}
            totalDatabaseProfiles={databaseProfilesMeta.totalItems}
            onChangeTab={setActiveTab}
            onOpenCreateUser={() => setCreateDialogOpen(true)}
          />

          <section className="rounded-[26px] border border-[#e7d7b6] bg-white p-5 shadow-[0_18px_40px_rgba(194,157,86,0.10)] sm:p-6">
            {activeTab === "users" ? (
              <UsersTab
                users={users}
                meta={usersMeta}
                loading={loadingUsers}
                searchValue={searchValue}
                onSearchChange={(value) => {
                  setSearchValue(value);
                  setPage(1);
                }}
                onPageChange={setPage}
                onOpenAssignment={(user) => {
                  setSelectedAssignmentUserId(user.id);
                  setActiveTab("assignments");
                }}
              />
            ) : null}

            {activeTab === "connections" ? (
              <ConnectionsTab
                profiles={databaseProfiles}
                meta={databaseProfilesMeta}
                loading={loadingDatabaseProfiles}
                searchValue={profileSearchValue}
                busyKey={busyKey}
                onSearchChange={(value) => {
                  setProfileSearchValue(value);
                  setProfilePage(1);
                }}
                onPageChange={setProfilePage}
                onCreateProfile={handleCreateDatabaseProfile}
                onUpdateProfile={handleUpdateDatabaseProfile}
                onDeleteProfile={handleDeleteDatabaseProfile}
              />
            ) : null}

            {activeTab === "assignments" ? (
              <AssignmentsTab
                key={selectedAssignmentUserId || "no-user-selected"}
                users={assignmentUsers}
                usersMeta={assignmentUsersMeta}
                usersLoading={loadingAssignmentUsers}
                databaseProfiles={assignmentProfiles}
                databaseProfilesLoading={loadingAssignmentProfiles}
                selectedUserId={selectedAssignmentUserId}
                assignmentSearchValue={assignmentSearchValue}
                busyKey={busyKey}
                onChangeSearch={(value) => {
                  setAssignmentSearchValue(value);
                  setAssignmentPage(1);
                }}
                onUsersPageChange={setAssignmentPage}
                onSelectUser={setSelectedAssignmentUserId}
                onAssignProfile={handleAssignProfileToUser}
                onCreateMerged={handleCreateMergedConnection}
                onDeleteConnection={handleDeleteConnection}
                onDeleteUser={handleDeleteUser}
              />
            ) : null}
          </section>
        </div>
      </div>

      {createDialogOpen ? (
        <CreateUserDialog
          busyKey={busyKey}
          form={createUserForm}
          onClose={() => {
            setCreateDialogOpen(false);
            setCreateUserForm(emptyCreateUserForm());
          }}
          onFormChange={setCreateUserForm}
          onSubmit={handleCreateUser}
        />
      ) : null}
    </main>
  );
}

function TopHeader({
  sessionUser,
  onRefresh,
  onLogout,
}: {
  sessionUser: SessionUser | null;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  return (
    <section className="rounded-[26px] border border-[#e7d7b6] bg-white px-5 py-4 shadow-[0_18px_40px_rgba(194,157,86,0.10)] sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
              Admin Connections Setup
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-[#2f2a21]">
              User, Connection, and Assignment Control
            </h1>
            <p className="mt-1 text-sm text-[#7b6a48]">
              Logged in as {sessionUser?.name || "Admin"}.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-full border border-[#dbbe80] bg-[#fff4d7] px-4 py-2.5 text-sm font-semibold text-[#6d5526] transition hover:bg-[#ffefc2]"
          >
            Refresh
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

function DashboardSidebar({
  activeTab,
  totalUsers,
  totalConnections,
  totalDatabaseProfiles,
  onChangeTab,
  onOpenCreateUser,
}: {
  activeTab: AdminTab;
  totalUsers: number;
  totalConnections: number;
  totalDatabaseProfiles: number;
  onChangeTab: (tab: AdminTab) => void;
  onOpenCreateUser: () => void;
}) {
  const tabs: { key: AdminTab; label: string; description: string }[] = [
    {
      key: "users",
      label: "User List",
      description: "Manage user accounts",
    },
    {
      key: "connections",
      label: "Connection List",
      description: "Save and edit database profiles",
    },
    {
      key: "assignments",
      label: "Connection Assignment",
      description: "Assign DBs and create merged DBs",
    },
  ];

  return (
    <aside className="rounded-[26px] border border-[#e7d7b6] bg-white p-4 shadow-[0_18px_40px_rgba(194,157,86,0.10)] sm:p-5">
      <div className="space-y-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChangeTab(tab.key)}
            className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
              activeTab === tab.key
                ? "border-[#c18a24] bg-[#fff4d7]"
                : "border-[#ecd9b3] bg-[#fffdf9] hover:bg-[#fff8e7]"
            }`}
          >
            <div className="text-sm font-semibold text-[#2f2a21]">{tab.label}</div>
            <div className="mt-1 text-xs text-[#7b6a48]">{tab.description}</div>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-2">
        <SidebarStat label="Users" value={String(totalUsers)} />
        <SidebarStat label="Connections" value={String(totalConnections)} />
        <SidebarStat label="Saved DBs" value={String(totalDatabaseProfiles)} />
      </div>

      <button
        type="button"
        onClick={onOpenCreateUser}
        className="mt-5 w-full rounded-full bg-gradient-to-b from-[#e3b34c] via-[#d4a035] to-[#c18a24] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
      >
        Create user
      </button>
    </aside>
  );
}

function SidebarStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#ead29d] bg-[#fff8e7] px-3 py-2 text-sm font-semibold text-[#6d5526]">
      {label}: {value}
    </div>
  );
}

function UsersTab({
  users,
  meta,
  loading,
  searchValue,
  onSearchChange,
  onPageChange,
  onOpenAssignment,
}: {
  users: ManagedUser[];
  meta: PaginationMeta;
  loading: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onOpenAssignment: (user: ManagedUser) => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a07a2d]">
          User list
        </div>
        <h2 className="mt-1 text-2xl font-semibold text-[#2f2a21]">
          Create users separately, then assign connections later
        </h2>
      </div>

      <UsersTable
        users={users}
        meta={meta}
        searchValue={searchValue}
        loading={loading}
        onSearchChange={onSearchChange}
        onPageChange={onPageChange}
        onRowClick={onOpenAssignment}
      />
    </section>
  );
}

function ConnectionsTab({
  profiles,
  meta,
  loading,
  searchValue,
  busyKey,
  onSearchChange,
  onPageChange,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
}: {
  profiles: DatabaseProfile[];
  meta: PaginationMeta;
  loading: boolean;
  searchValue: string;
  busyKey: string | null;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onCreateProfile: (payload: ConnectionFormState) => Promise<void>;
  onUpdateProfile: (profileId: string, payload: ConnectionFormState) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
}) {
  const [createForm, setCreateForm] = useState<ConnectionFormState>(() => emptyConnectionForm());
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editForms, setEditForms] = useState<Record<string, ConnectionFormState>>({});
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null);

  const createBusy = busyKey === "create-db-profile";
  const deleteBusy = deleteProfileId ? busyKey === `delete-db-profile:${deleteProfileId}` : false;
  const visiblePages = getVisiblePages(meta.page, meta.totalPages);
  const start = meta.totalItems === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.totalItems, meta.page * meta.limit);

  return (
    <section className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a07a2d]">
          Connection list
        </div>
        <h2 className="mt-1 text-2xl font-semibold text-[#2f2a21]">
          Save databases once for reusable assignment
        </h2>
      </div>

      <form
        className="space-y-4 rounded-[24px] border border-[#ecd9b3] bg-[#fffaf0] p-5"
        onSubmit={async (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          await onCreateProfile(createForm);
          setCreateForm(emptyConnectionForm());
        }}
      >
        <ConnectionFields
          title="Save database profile"
          value={createForm}
          onChange={setCreateForm}
          requirePassword
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={createBusy}
            className="rounded-full bg-[#2f2a21] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#443827] disabled:opacity-60"
          >
            {createBusy ? "Saving..." : "Save in connection list"}
          </button>
        </div>
      </form>

      <div className="rounded-[24px] border border-[#ecd9b3] bg-[#fffcf7] p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-[#2f2a21]">
            Saved connections ({meta.totalItems})
          </div>
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search connection profiles"
            className="h-10 w-full rounded-xl border border-[#e4cca0] bg-white px-4 text-sm text-[#2f2a21] shadow-sm outline-none transition focus:border-[#cf9a39] focus:ring-2 focus:ring-[#f2d491] sm:w-[320px]"
          />
        </div>

        <div className="space-y-3">
          {!profiles.length ? (
            <div className="rounded-xl border border-dashed border-[#dfc58d] bg-[#fffaf0] px-4 py-5 text-sm text-[#7b6a48]">
              No saved connections found.
            </div>
          ) : null}

          {profiles.map((profile) => {
            const isEditing = editingProfileId === profile.id;
            const updateBusy = busyKey === `update-db-profile:${profile.id}`;
            const profileDeleteBusy = busyKey === `delete-db-profile:${profile.id}`;
            const form = editForms[profile.id] || profileToConnectionForm(profile);
            const isConnected = profile.isConnected ?? profile.assignedConnections > 0;

            return (
              <div
                key={profile.id}
                className="rounded-2xl border border-[#ecd9b3] bg-white p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[#2f2a21]">
                      {profile.label || profile.database}
                    </div>
                    <div className="mt-1 text-xs text-[#7b6a48]">
                      {profile.host}:{profile.port} | DB: {profile.database} | Mongo ref: {profile.mongoRefName}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${
                          isConnected
                            ? "border-[#c9d8b0] bg-[#f6faef] text-[#50652b]"
                            : "border-[#e4cca0] bg-[#fff8e7] text-[#7b6a48]"
                        }`}
                      >
                        Status: {isConnected ? "Already connected" : "Not connected"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[#8d7a55]">
                      Assigned users: {profile.assignedConnections} | Updated:{" "}
                      {formatDateTime(profile.updatedAt)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingProfileId((current) => (current === profile.id ? null : profile.id))
                      }
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
                    className="mt-4 space-y-4"
                    onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                      event.preventDefault();
                      await onUpdateProfile(profile.id, form);
                      setEditingProfileId(null);
                    }}
                  >
                    <ConnectionFields
                      title="Edit connection profile"
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
                        {updateBusy ? "Saving..." : "Save profile"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-[#6f6146]">
            {loading
              ? "Loading saved databases..."
              : `Showing ${start} to ${end} of ${meta.totalItems} saved databases`}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, meta.page - 1))}
              disabled={meta.page === 1}
              className="rounded-full border border-[#dfc58d] bg-[#fff8e7] px-4 py-2 text-sm font-semibold text-[#6d5526] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            {visiblePages.map((visiblePage) => (
              <button
                key={visiblePage}
                type="button"
                onClick={() => onPageChange(visiblePage)}
                className={`h-10 min-w-10 rounded-full px-3 text-sm font-semibold ${
                  visiblePage === meta.page
                    ? "bg-[#c18a24] text-white"
                    : "border border-[#dfc58d] bg-[#fff8e7] text-[#6d5526]"
                }`}
              >
                {visiblePage}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onPageChange(Math.min(meta.totalPages, meta.page + 1))}
              disabled={meta.page === meta.totalPages}
              className="rounded-full border border-[#dfc58d] bg-[#fff8e7] px-4 py-2 text-sm font-semibold text-[#6d5526] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteProfileId)}
        title="Delete connection profile?"
        description="This removes it from the connection list. Existing user assignments created from it will remain as custom direct connections."
        confirmLabel="Delete profile"
        busy={deleteBusy}
        onClose={() => setDeleteProfileId(null)}
        onConfirm={async () => {
          if (!deleteProfileId) return;
          await onDeleteProfile(deleteProfileId);
          setDeleteProfileId(null);
        }}
      />
    </section>
  );
}

function AssignmentsTab({
  users,
  usersMeta,
  usersLoading,
  databaseProfiles,
  databaseProfilesLoading,
  selectedUserId,
  assignmentSearchValue,
  busyKey,
  onChangeSearch,
  onUsersPageChange,
  onSelectUser,
  onAssignProfile,
  onCreateMerged,
  onDeleteConnection,
  onDeleteUser,
}: {
  users: ManagedUser[];
  usersMeta: PaginationMeta;
  usersLoading: boolean;
  databaseProfiles: DatabaseProfile[];
  databaseProfilesLoading: boolean;
  selectedUserId: string;
  assignmentSearchValue: string;
  busyKey: string | null;
  onChangeSearch: (value: string) => void;
  onUsersPageChange: (page: number) => void;
  onSelectUser: (userId: string) => void;
  onAssignProfile: (userId: string, profileId: string) => Promise<void>;
  onCreateMerged: (userId: string, payload: MergedConnectionFormState) => Promise<void>;
  onDeleteConnection: (userId: string, connectionId: string) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
}) {
  const selectedUser = users.find((user) => user.id === selectedUserId) || null;

  const directConnections = useMemo(
    () =>
      selectedUser
        ? selectedUser.connections.filter((connection) => !isMergedConnection(connection))
        : [],
    [selectedUser]
  );
  const mergedConnections = useMemo(
    () =>
      selectedUser
        ? selectedUser.connections.filter((connection) => isMergedConnection(connection))
        : [],
    [selectedUser]
  );

  const assignedProfileIds = useMemo(
    () =>
      new Set(
        directConnections
          .map((connection) => connection.profileId)
          .filter((profileId): profileId is string => Boolean(profileId))
      ),
    [directConnections]
  );

  const availableProfiles = useMemo(
    () => databaseProfiles.filter((profile) => !assignedProfileIds.has(profile.id)),
    [assignedProfileIds, databaseProfiles]
  );

  const sourceLabelByConnectionId = useMemo(() => {
    const map = new Map<string, string>();
    for (const connection of directConnections) {
      map.set(connection.id, connection.label || connection.database);
    }
    return map;
  }, [directConnections]);

  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileQuery, setProfileQuery] = useState("");
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [mergedForm, setMergedForm] = useState<MergedConnectionFormState>(() => emptyMergedConnectionForm());
  const [deleteConnectionId, setDeleteConnectionId] = useState<string | null>(null);
  const [deleteUserOpen, setDeleteUserOpen] = useState(false);

  const filteredAvailableProfiles = useMemo(() => {
    const term = profileQuery.trim().toLowerCase();
    if (!term) return availableProfiles;
    return availableProfiles.filter((profile) =>
      [profile.label, profile.database, profile.host, profile.username, profile.mongoRefName]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [availableProfiles, profileQuery]);

  const assignBusy = selectedUser ? busyKey === `assign-profile:${selectedUser.id}` : false;
  const mergeBusy = selectedUser ? busyKey === `add-merged:${selectedUser.id}` : false;
  const deleteBusy = deleteConnectionId ? busyKey === `delete-connection:${deleteConnectionId}` : false;
  const deleteUserBusy = selectedUser ? busyKey === `delete-user:${selectedUser.id}` : false;
  const userVisiblePages = getVisiblePages(usersMeta.page, usersMeta.totalPages);
  const usersStart = usersMeta.totalItems === 0 ? 0 : (usersMeta.page - 1) * usersMeta.limit + 1;
  const usersEnd = Math.min(usersMeta.totalItems, usersMeta.page * usersMeta.limit);
  const handleSelectUser = (userId: string) => {
    setSelectedProfileId("");
    setProfileQuery("");
    setProfileDropdownOpen(false);
    onSelectUser(userId);
  };

  return (
    <section className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a07a2d]">
          Connection assignment
        </div>
        <h2 className="mt-1 text-2xl font-semibold text-[#2f2a21]">
          Assign only unconnected saved databases to users
        </h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-[290px_1fr]">
        <aside className="rounded-2xl border border-[#ecd9b3] bg-[#fffaf0] p-4">
          <input
            value={assignmentSearchValue}
            onChange={(event) => onChangeSearch(event.target.value)}
            placeholder="Search user for assignment"
            className="h-10 w-full rounded-xl border border-[#e4cca0] bg-white px-4 text-sm text-[#2f2a21] shadow-sm outline-none transition focus:border-[#cf9a39] focus:ring-2 focus:ring-[#f2d491]"
          />

          <div className="mt-3 space-y-2">
            {!users.length ? (
              <div className="rounded-xl border border-dashed border-[#dfc58d] bg-white px-3 py-4 text-sm text-[#7b6a48]">
                No users found.
              </div>
            ) : null}

            {users.map((user) => {
              const isSelected = user.id === selectedUserId;
              const userDirectCount = user.connections.filter((connection) => !isMergedConnection(connection)).length;
              const userMergedCount = user.connections.filter((connection) => isMergedConnection(connection)).length;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleSelectUser(user.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    isSelected
                      ? "border-[#c18a24] bg-[#fff4d7]"
                      : "border-[#ecd9b3] bg-white hover:bg-[#fff8e7]"
                  }`}
                >
                  <div className="text-sm font-semibold text-[#2f2a21]">{user.name}</div>
                  <div className="mt-1 text-xs text-[#7b6a48]">{user.email}</div>
                  <div className="mt-1 text-xs text-[#7b6a48]">
                    Direct: {userDirectCount} | Merged: {userMergedCount}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-2">
            <div className="text-xs text-[#7b6a48]">
              {usersLoading
                ? "Loading users..."
                : `Showing ${usersStart} to ${usersEnd} of ${usersMeta.totalItems} users`}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onUsersPageChange(Math.max(1, usersMeta.page - 1))}
                disabled={usersMeta.page === 1}
                className="rounded-full border border-[#dfc58d] bg-[#fff8e7] px-3 py-1.5 text-xs font-semibold text-[#6d5526] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              {userVisiblePages.map((visiblePage) => (
                <button
                  key={visiblePage}
                  type="button"
                  onClick={() => onUsersPageChange(visiblePage)}
                  className={`h-8 min-w-8 rounded-full px-2 text-xs font-semibold ${
                    visiblePage === usersMeta.page
                      ? "bg-[#c18a24] text-white"
                      : "border border-[#dfc58d] bg-[#fff8e7] text-[#6d5526]"
                  }`}
                >
                  {visiblePage}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onUsersPageChange(Math.min(usersMeta.totalPages, usersMeta.page + 1))}
                disabled={usersMeta.page === usersMeta.totalPages}
                className="rounded-full border border-[#dfc58d] bg-[#fff8e7] px-3 py-1.5 text-xs font-semibold text-[#6d5526] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </aside>

        <div className="space-y-4 rounded-2xl border border-[#ecd9b3] bg-[#fffcf7] p-4 sm:p-5">
          {!selectedUser ? (
            <div className="rounded-xl border border-dashed border-[#dfc58d] bg-[#fffaf0] px-4 py-6 text-sm text-[#7b6a48]">
              Select a user from the left to view assignment details.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-lg font-semibold text-[#2f2a21]">{selectedUser.name}</div>
                  <div className="text-sm text-[#7b6a48]">{selectedUser.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteUserOpen(true)}
                  disabled={deleteUserBusy}
                  className="rounded-full border border-[#e1a0a0] bg-[#fff1f1] px-4 py-2 text-sm font-semibold text-[#9f2b2b] disabled:opacity-60"
                >
                  {deleteUserBusy ? "Deleting..." : "Delete user"}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MetaCard label="Role" value={selectedUser.role} />
                <MetaCard label="Direct DBs" value={String(directConnections.length)} />
                <MetaCard label="Merged DBs" value={String(mergedConnections.length)} />
              </div>

              <form
                className="space-y-4 rounded-xl border border-[#d7d5f2] bg-[#f8f7ff] p-4"
                onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  if (!selectedProfileId) return;
                  await onAssignProfile(selectedUser.id, selectedProfileId);
                  setSelectedProfileId("");
                  setProfileQuery("");
                  setProfileDropdownOpen(false);
                }}
              >
                <div className="text-sm font-semibold text-[#4a4678]">Assign saved database</div>
                <label className="flex flex-col gap-2 text-sm font-medium text-[#4a4678]">
                  <span>Unconnected database profiles</span>
                  <div className="relative">
                    <input
                      value={profileQuery}
                      onFocus={() => setProfileDropdownOpen(true)}
                      onBlur={() => {
                        window.setTimeout(() => setProfileDropdownOpen(false), 120);
                      }}
                      onChange={(event) => {
                        setProfileQuery(event.target.value);
                        setSelectedProfileId("");
                        setProfileDropdownOpen(true);
                      }}
                      placeholder={
                        databaseProfilesLoading
                          ? "Loading databases..."
                          : "Select or search database"
                      }
                      className="h-11 w-full rounded-xl border border-[#d7d5f2] bg-white px-4 text-sm text-[#2f2a21] shadow-sm outline-none transition focus:border-[#7a76cc] focus:ring-2 focus:ring-[#d7d5f2]"
                    />

                    {profileDropdownOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-60 overflow-auto rounded-xl border border-[#d7d5f2] bg-white p-1 shadow-lg">
                        {databaseProfilesLoading ? (
                          <div className="px-3 py-2 text-xs text-[#5d5a84]">Loading saved databases...</div>
                        ) : null}
                        {!databaseProfilesLoading && !availableProfiles.length ? (
                          <div className="px-3 py-2 text-xs text-[#7b6a48]">No unconnected databases found.</div>
                        ) : null}
                        {!databaseProfilesLoading && availableProfiles.length && !filteredAvailableProfiles.length ? (
                          <div className="px-3 py-2 text-xs text-[#7b6a48]">No matching database found.</div>
                        ) : null}
                        {filteredAvailableProfiles.map((profile) => (
                          <button
                            key={profile.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setSelectedProfileId(profile.id);
                              setProfileQuery(`${profile.label || profile.database} (${profile.database})`);
                              setProfileDropdownOpen(false);
                            }}
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#2f2a21] hover:bg-[#f8f7ff]"
                          >
                            {profile.label || profile.database} ({profile.database})
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </label>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={assignBusy || !selectedProfileId}
                    className="rounded-full bg-[#5a56a8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4c4795] disabled:opacity-60"
                  >
                    {assignBusy ? "Assigning..." : "Assign to user"}
                  </button>
                </div>
              </form>

              <section className="space-y-3 rounded-xl border border-[#ecd9b3] bg-white p-4">
                <div className="text-sm font-semibold text-[#2f2a21]">
                  Direct databases ({directConnections.length})
                </div>
                {!directConnections.length ? (
                  <div className="text-sm text-[#7b6a48]">
                    No direct databases assigned to this user.
                  </div>
                ) : null}
                {directConnections.map((connection) => {
                  const isDeleting = busyKey === `delete-connection:${connection.id}`;
                  return (
                    <div
                      key={connection.id}
                      className="rounded-xl border border-[#ecd9b3] bg-[#fffcf7] p-3"
                    >
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-[#2f2a21]">
                            {connection.label || connection.database}
                          </div>
                          <div className="text-xs text-[#7b6a48]">
                            {connection.host || "-"}:{connection.port || "-"} | DB: {connection.database}
                          </div>
                          <div className="text-xs text-[#8d7a55]">
                            Source: {connection.profileId ? "Connection list profile" : "Custom connection"}{" "}
                            | Last sync: {formatDateTime(connection.lastSyncAt)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeleteConnectionId(connection.id)}
                          disabled={isDeleting}
                          className="rounded-full border border-[#e1a0a0] bg-[#fff1f1] px-3 py-1.5 text-xs font-semibold text-[#9f2b2b] disabled:opacity-60"
                        >
                          {isDeleting ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>

              <form
                className="space-y-4 rounded-xl border border-[#d7d5f2] bg-[#f8f7ff] p-4"
                onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  await onCreateMerged(selectedUser.id, mergedForm);
                  setMergedForm(emptyMergedConnectionForm());
                }}
              >
                <div className="text-sm font-semibold text-[#4a4678]">Create merged database</div>
                {directConnections.length < 2 ? (
                  <div className="text-sm text-[#5d5a84]">
                    At least 2 direct databases are required to create a merged database.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <InputField
                        label="Merged label"
                        value={mergedForm.label}
                        onChange={(next) =>
                          setMergedForm((current) => ({
                            ...current,
                            label: next,
                          }))
                        }
                        placeholder="Combined outlets"
                      />
                      <InputField
                        label="Merged database name"
                        value={mergedForm.database}
                        onChange={(next) =>
                          setMergedForm((current) => ({
                            ...current,
                            database: next,
                          }))
                        }
                        placeholder="merged_outlets"
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {directConnections.map((connection) => {
                        const checked = mergedForm.sourceConnectionIds.includes(connection.id);
                        return (
                          <label
                            key={connection.id}
                            className="flex items-center gap-3 rounded-xl border border-[#d7d5f2] bg-white px-3 py-2 text-sm text-[#4a4678]"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                setMergedForm((current) => {
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
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={mergeBusy}
                        className="rounded-full bg-[#5a56a8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4c4795] disabled:opacity-60"
                      >
                        {mergeBusy ? "Creating..." : "Create merged database"}
                      </button>
                    </div>
                  </>
                )}
              </form>

              <section className="space-y-3 rounded-xl border border-[#d7d5f2] bg-[#f8f7ff] p-4">
                <div className="text-sm font-semibold text-[#4a4678]">
                  Merged databases ({mergedConnections.length})
                </div>
                {!mergedConnections.length ? (
                  <div className="text-sm text-[#5d5a84]">No merged databases for this user.</div>
                ) : null}

                {mergedConnections.map((connection) => {
                  const sources = connection.sourceConnectionIds.length
                    ? connection.sourceConnectionIds
                        .map((sourceId) => sourceLabelByConnectionId.get(sourceId) || sourceId)
                        .join(", ")
                    : "No sources";
                  const isDeleting = busyKey === `delete-connection:${connection.id}`;
                  return (
                    <div
                      key={connection.id}
                      className="rounded-xl border border-[#d7d5f2] bg-white p-3"
                    >
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-[#2f2a21]">
                            {connection.label || connection.database}
                          </div>
                          <div className="text-xs text-[#5d5a84]">
                            Merged DB: {connection.database}
                          </div>
                          <div className="text-xs text-[#5d5a84]">
                            Sources ({connection.sourceConnectionCount}): {sources}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeleteConnectionId(connection.id)}
                          disabled={isDeleting}
                          className="rounded-full border border-[#e1a0a0] bg-[#fff1f1] px-3 py-1.5 text-xs font-semibold text-[#9f2b2b] disabled:opacity-60"
                        >
                          {isDeleting ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteConnectionId)}
        title="Remove connection from user?"
        description="This will remove the selected connection. If it is a direct DB, related merged DBs may be updated automatically."
        confirmLabel="Remove"
        busy={deleteBusy}
        onClose={() => setDeleteConnectionId(null)}
        onConfirm={async () => {
          if (!selectedUser || !deleteConnectionId) return;
          await onDeleteConnection(selectedUser.id, deleteConnectionId);
          setDeleteConnectionId(null);
        }}
      />

      <ConfirmDialog
        open={deleteUserOpen}
        title={`Delete ${selectedUser?.name || "user"}?`}
        description="This removes the user and all synced data tied to that user."
        confirmLabel="Delete user"
        busy={deleteUserBusy}
        onClose={() => setDeleteUserOpen(false)}
        onConfirm={async () => {
          if (!selectedUser) return;
          await onDeleteUser(selectedUser.id);
          setDeleteUserOpen(false);
        }}
      />
    </section>
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

function getVisiblePages(page: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  pages.add(page);
  if (page - 1 > 1) pages.add(page - 1);
  if (page + 1 < totalPages) pages.add(page + 1);
  return Array.from(pages).sort((left, right) => left - right);
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
              User and Connection Management
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
                Use an admin account to manage users, connection list, and assignments.
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
              <h2 className="mt-2 text-2xl font-semibold text-[#2f2a21]">Create account</h2>
              <p className="mt-2 text-sm text-[#7b6a48]">
                Users and connections are separated. You can assign saved databases later.
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

          <label className="flex items-center justify-between rounded-xl border border-[#ead9b8] bg-[#fff8e7] px-4 py-3 text-sm font-medium text-[#4d4332]">
            <span>Add first direct DB now (optional)</span>
            <input
              type="checkbox"
              checked={form.attachConnection}
              onChange={(event) =>
                onFormChange({
                  ...form,
                  attachConnection: event.target.checked,
                })
              }
              className="h-4 w-4 accent-[#c18a24]"
            />
          </label>

          {form.attachConnection ? (
            <ConnectionFields
              title="Direct database connection"
              value={form.connection}
              onChange={(next) => onFormChange({ ...form, connection: next })}
              requirePassword
            />
          ) : null}

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
