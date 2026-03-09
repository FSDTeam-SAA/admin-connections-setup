export type Role = "admin" | "user";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type ManagedConnection = {
  id: string;
  host: string;
  port: number;
  database: string;
  username: string;
  encrypt: boolean;
  label: string;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
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

export type CreateUserFormState = {
  name: string;
  email: string;
  password: string;
  role: Role;
  attachConnection: boolean;
  connection: ConnectionFormState;
};

export type EditUserFormState = {
  name: string;
  email: string;
  role: Role;
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

export function emptyCreateUserForm(): CreateUserFormState {
  return {
    name: "",
    email: "",
    password: "",
    role: "user",
    attachConnection: true,
    connection: emptyConnectionForm(),
  };
}

export function connectionFormFromConnection(
  connection: ManagedConnection,
): ConnectionFormState {
  return {
    host: connection.host,
    port: String(connection.port),
    database: connection.database,
    username: connection.username,
    password: "",
    label: connection.label,
    encrypt: connection.encrypt,
  };
}

export function userFormFromUser(user: ManagedUser): EditUserFormState {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
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
