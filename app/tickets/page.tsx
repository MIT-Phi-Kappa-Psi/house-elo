import { listTickets } from "@/lib/queries";
import TicketForm from "./ticket-form";
import TicketList from "./ticket-list";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const tickets = await listTickets();
  const open = tickets.filter((t) => t.status === "open").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Found a bug or want something changed? File it here. Everything filed is
          visible to everyone — triage decides what actually gets built.
        </p>
      </div>

      <TicketForm />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          {tickets.length} filed · {open} open
        </h2>
        <TicketList tickets={tickets} />
      </section>
    </div>
  );
}
