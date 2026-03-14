"use client";

import type { ManagedUser, PaginationMeta } from "@/lib/admin-api";

export function UsersTable({
  users,
  meta,
  searchValue,
  loading,
  onSearchChange,
  onPageChange,
  onRowClick,
}: {
  users: ManagedUser[];
  meta: PaginationMeta;
  searchValue: string;
  loading: boolean;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onRowClick: (user: ManagedUser) => void;
}) {
  const visiblePages = getVisiblePages(meta.page, meta.totalPages);
  const start = meta.totalItems === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.totalItems, meta.page * meta.limit);

  return (
    <section className="rounded-[28px] border border-[#e7d7b6] bg-white p-6 shadow-[0_18px_40px_rgba(194,157,86,0.10)]">
      <div className="flex flex-col gap-4 border-b border-[#efdfbc] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a07a2d]">
            User list
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-[#2f2a21]">
            Search, page, and open user details
          </h2>
        </div>
        <div className="w-full sm:w-[320px]">
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by name, username, or role"
            className="h-11 w-full rounded-xl border border-[#e4cca0] bg-[#fffaf0] px-4 text-sm text-[#2f2a21] shadow-sm outline-none transition focus:border-[#cf9a39] focus:ring-2 focus:ring-[#f2d491]"
          />
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-[22px] border border-[#ecdebf]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#fff4d7] text-[#4e4637]">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Username</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Connections</th>
                <th className="px-4 py-3 font-semibold">Database labels</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {!loading && !users.length ? (
                <tr>
                  <td className="px-4 py-10 text-center text-[#7b6a48]" colSpan={7}>
                    No users matched your search.
                  </td>
                </tr>
              ) : null}
              {users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => onRowClick(user)}
                  className="cursor-pointer border-t border-[#f1e5ca] transition hover:bg-[#fff8e7]"
                >
                  <td className="px-4 py-4 font-semibold text-[#2f2a21]">{user.name}</td>
                  <td className="px-4 py-4 text-[#6f6146]">@{user.username}</td>
                  <td className="px-4 py-4 text-[#6f6146]">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        user.isActive
                          ? "border-[#c9d8b0] bg-[#f6faef] text-[#50652b]"
                          : "border-[#e1a0a0] bg-[#fff1f1] text-[#9f2b2b]"
                      }`}
                    >
                      {user.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center rounded-full border border-[#ead29d] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9f7322]">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-[#6f6146]">{user.totalConnections}</td>
                  <td className="max-w-[260px] px-4 py-4 text-[#6f6146]">
                    {user.connections.length
                      ? user.connections
                          .map((connection) =>
                            `${connection.label || connection.database}${
                              connection.kind === "merged" ? " (merged)" : ""
                            }`
                          )
                          .join(", ")
                      : "No connection"}
                  </td>
                  <td className="px-4 py-4 text-[#6f6146]">{formatTableDate(user.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-[#6f6146]">
          {loading
            ? "Loading users..."
            : `Showing ${start} to ${end} of ${meta.totalItems} users`}
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
          {visiblePages.map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={`h-10 min-w-10 rounded-full px-3 text-sm font-semibold ${
                page === meta.page
                  ? "bg-[#c18a24] text-white"
                  : "border border-[#dfc58d] bg-[#fff8e7] text-[#6d5526]"
              }`}
            >
              {page}
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
    </section>
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

function formatTableDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
