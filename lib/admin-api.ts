export type Role = "admin" | "user";
export type ConnectionKind = "direct" | "merged";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
};

export type ManagedConnection = {
  id: string;
  profileId: string | null;
  kind: ConnectionKind;
  isMerged: boolean;
  sourceConnectionIds: string[];
  sourceConnectionCount: number;
  host: string | null;
  port: number | null;
  database: string;
  mongoRefName: string;
  username: string | null;
  encrypt: boolean;
  label: string;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DatabaseProfile = {
  id: string;
  host: string;
  port: number;
  database: string;
  mongoRefName: string;
  username: string;
  encrypt: boolean;
  label: string;
  assignedConnections: number;
  isConnected?: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManagedUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  totalConnections: number;
  connections: ManagedConnection[];
};

export type ConnectionFormState = {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  label: string;
  encrypt: boolean;
};

export type MergedConnectionFormState = {
  label: string;
  database: string;
  sourceConnectionIds: string[];
};

export type CreateUserFormState = {
  name: string;
  username: string;
  password: string;
  role: Role;
  attachConnection: boolean;
  connection: ConnectionFormState;
};

export type EditUserFormState = {
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  password: string;
};

export type BootstrapStatus = {
  hasAdmin: boolean;
  needsSetup: boolean;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  search: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  meta?: PaginationMeta | null;
};

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export function emptyConnectionForm(): ConnectionFormState {
  return {
    host: "",
    port: "1433",
    database: "",
    username: "",
    password: "",
    label: "",
    encrypt: false,
  };
}

export function emptyMergedConnectionForm(): MergedConnectionFormState {
  return {
    label: "",
    database: "",
    sourceConnectionIds: [],
  };
}

export function emptyCreateUserForm(): CreateUserFormState {
  return {
    name: "",
    username: "",
    password: "",
    role: "user",
    attachConnection: false,
    connection: emptyConnectionForm(),
  };
}

export function connectionFormFromConnection(
  connection: ManagedConnection,
): ConnectionFormState {
  return {
    host: connection.host || "",
    port: connection.port ? String(connection.port) : "1433",
    database: connection.database,
    username: connection.username || "",
    password: "",
    label: connection.label,
    encrypt: connection.encrypt,
  };
}

export function userFormFromUser(user: ManagedUser): EditUserFormState {
  return {
    name: user.name,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    password: "",
  };
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function buildConnectionPayload(
  form: ConnectionFormState,
  { includePassword }: { includePassword: boolean },
) {
  const payload: Record<string, string | boolean> = {
    host: form.host.trim(),
    port: form.port.trim(),
    database: form.database.trim(),
    username: form.username.trim(),
    label: form.label.trim(),
    encrypt: form.encrypt,
  };

  if (includePassword || form.password.trim()) {
    payload.password = form.password;
  }

  return payload;
}

export function buildMergedConnectionPayload(form: MergedConnectionFormState) {
  return {
    label: form.label.trim(),
    database: form.database.trim(),
    sourceConnectionIds: [...new Set(form.sourceConnectionIds.map((id) => id.trim()).filter(Boolean))],
  };
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || (options.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | { message?: string }
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? payload.message || "Request failed"
        : "Request failed";
    throw new Error(message);
  }

  return (payload as ApiEnvelope<T>).data;
}

export async function apiRequestWithMeta<T, M = PaginationMeta>(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: Record<string, unknown>;
  } = {},
): Promise<{ data: T; meta: M | null }> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || (options.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | { message?: string }
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? payload.message || "Request failed"
        : "Request failed";
    throw new Error(message);
  }

  return {
    data: (payload as ApiEnvelope<T>).data,
    meta: ((payload as ApiEnvelope<T>).meta ?? null) as M | null,
  };
}
