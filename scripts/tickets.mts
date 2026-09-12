/**
 * The ticket queue lives in the database and has no page in the app — anyone
 * can file through the "?" button, nobody browses what others filed. This is
 * how to read and triage it.
 *
 *   npm run tickets                     all, untriaged first
 *   npm run tickets -- open             only that status
 *   npm run tickets -- --json           machine-readable
 *   npm run tickets -- planned <id>     move a ticket
 *   npm run tickets -- rm <id>          delete one
 */
import "./env.mts";
import { closeDriver } from "../lib/db.js";
import {
  deleteTicket,
  listTickets,
  setTicketStatus,
} from "../lib/queries.js";
import { TICKET_STATUSES, type TicketStatus } from "../lib/tickets.js";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const statusArg = args.find((a) => TICKET_STATUSES.includes(a as TicketStatus)) as
  | TicketStatus
  | undefined;
const id = args.find((a) => /^[0-9a-f-]{36}$/i.test(a));

if (id && args.includes("rm")) {
  await deleteTicket(id);
  console.log(`Deleted ${id}.`);
} else if (id && statusArg) {
  await setTicketStatus(id, statusArg);
  console.log(`Moved ${id} to ${statusArg}.`);
} else {
  const all = await listTickets();
  const tickets = statusArg ? all.filter((t) => t.status === statusArg) : all;

  if (asJson) {
    console.log(JSON.stringify(tickets, null, 2));
  } else if (tickets.length === 0) {
    console.log(statusArg ? `No ${statusArg} tickets.` : "No tickets filed.");
  } else {
    for (const t of tickets) {
      const when = t.createdAt.toISOString().slice(0, 10);
      console.log(
        `\n[${t.status.toUpperCase()}] ${t.kind}  ${when}` +
          (t.reporter ? `  — ${t.reporter}` : ""),
      );
      console.log(`  ${t.title}`);
      if (t.body) for (const line of t.body.split("\n")) console.log(`    ${line}`);
      console.log(`  id: ${t.id}`);
    }
    const counts = TICKET_STATUSES.map(
      (s) => `${all.filter((t) => t.status === s).length} ${s}`,
    ).join(" · ");
    console.log(`\n${all.length} total — ${counts}`);
  }
}

await closeDriver();
