"use client";

import { useState } from "react";
import { deleteTicketAction, setTicketStatusAction } from "@/app/actions";
import { TICKET_STATUSES, type Ticket, type TicketStatus } from "@/lib/tickets";
import { formatDate } from "@/lib/format";

const STATUS_STYLE: Record<TicketStatus, string> = {
  open: "bg-[#3a2f0c] text-[var(--color-warn)]",
  planned: "bg-[#24405c] text-[#cfe3ff]",
  done: "bg-[#12351f] text-[var(--color-accent)]",
  declined: "bg-[#2a2a2a] text-[var(--color-muted)]",
};

export default function TicketList({ tickets }: { tickets: Ticket[] }) {
  const [filter, setFilter] = useState<TicketStatus | "all">("all");
  const shown = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);

  if (tickets.length === 0) {
    return (
      <div className="panel px-5 py-10 text-center text-sm text-[var(--color-muted)]">
        Nothing filed yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["all", ...TICKET_STATUSES] as const).map((option) => (
          <button
            key={option}
            className={`btn ${filter === option ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter(option)}
          >
            {option}
            {option !== "all" && (
              <span className="opacity-70">
                {tickets.filter((t) => t.status === option).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {shown.map((ticket) => (
          <li key={ticket.id} className="panel px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[ticket.status]}`}
                  >
                    {ticket.status}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                    {ticket.kind}
                  </span>
                  <span className="font-medium">{ticket.title}</span>
                </div>
                {ticket.body && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--color-muted)]">
                    {ticket.body}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                  {ticket.reporter ? `${ticket.reporter} · ` : ""}
                  {formatDate(ticket.createdAt)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <form action={setTicketStatusAction}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <select
                    name="status"
                    // Keyed so the control re-mounts on the new status; an
                    // uncontrolled defaultValue would keep showing the old one
                    // after the server revalidates.
                    key={ticket.status}
                    defaultValue={ticket.status}
                    className="field py-1 text-xs"
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  >
                    {TICKET_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </form>
                <form action={deleteTicketAction}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <button className="text-xs text-[var(--color-muted)] underline hover:text-[var(--color-warn)]">
                    delete
                  </button>
                </form>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
