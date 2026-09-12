/** Ticket queue integration tests. Skipped without TEST_DATABASE_URL. */
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { closeDriver, sql } from "../lib/db";
import { schemaStatements } from "../lib/schema";
import {
  createTicket,
  deleteTicket,
  listTickets,
  setTicketStatus,
} from "../lib/queries";

const url = process.env.TEST_DATABASE_URL;
const opts = { skip: url ? false : "set TEST_DATABASE_URL to run" };
if (url) process.env.DATABASE_URL = url;

before(async () => {
  if (!url) return;
  for (const statement of schemaStatements()) await sql().raw(statement);
});

beforeEach(async () => {
  if (!url) return;
  await sql()`truncate tickets restart identity cascade`;
});

after(async () => {
  if (!url) return;
  await closeDriver();
});

test("a filed ticket starts open", opts, async () => {
  const ticket = await createTicket({ title: "Ratings look wrong", kind: "bug" });
  assert.equal(ticket.status, "open");
  assert.equal(ticket.kind, "bug");
  assert.equal((await listTickets()).length, 1);
});

test("optional fields round-trip", opts, async () => {
  await createTicket({
    title: "Add darts",
    body: "We play it every week.\nTwo lines.",
    reporter: "Jackson",
    kind: "idea",
  });
  const [ticket] = await listTickets();
  assert.equal(ticket.reporter, "Jackson");
  assert.match(ticket.body!, /every week/);
  assert.equal(ticket.kind, "idea");
});

test("open tickets sort ahead of settled ones", opts, async () => {
  const done = await createTicket({ title: "Already fixed", kind: "bug" });
  await setTicketStatus(done.id, "done");
  const declined = await createTicket({ title: "Not doing", kind: "idea" });
  await setTicketStatus(declined.id, "declined");
  await createTicket({ title: "Needs triage", kind: "bug" });
  const planned = await createTicket({ title: "Queued", kind: "idea" });
  await setTicketStatus(planned.id, "planned");

  const titles = (await listTickets()).map((t) => t.title);
  assert.deepEqual(titles, ["Needs triage", "Queued", "Already fixed", "Not doing"]);
});

test("triage moves a ticket and stamps updated_at", opts, async () => {
  const ticket = await createTicket({ title: "Something", kind: "bug" });
  await setTicketStatus(ticket.id, "planned");
  const [updated] = await listTickets();
  assert.equal(updated.status, "planned");
  assert.ok(updated.updatedAt >= ticket.updatedAt);
});

test("deleting removes a ticket", opts, async () => {
  const ticket = await createTicket({ title: "Noise", kind: "bug" });
  await deleteTicket(ticket.id);
  assert.equal((await listTickets()).length, 0);
});

test("the database rejects a status outside the allowed set", opts, async () => {
  const ticket = await createTicket({ title: "Guarded", kind: "bug" });
  // The driver's query object is a thenable, not a Promise; assert.rejects
  // requires a real one, so await it inside an async fn.
  await assert.rejects(async () => {
    await sql()`update tickets set status = 'bogus' where id = ${ticket.id}`;
  }, /ticket_status/);
});
