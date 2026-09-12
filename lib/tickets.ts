/**
 * Ticket vocabulary, kept free of any database import so client components can
 * use these values without pulling the Postgres driver into the browser bundle.
 */
export const TICKET_STATUSES = ["open", "planned", "done", "declined"] as const;
export const TICKET_KINDS = ["bug", "idea"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketKind = (typeof TICKET_KINDS)[number];

export type Ticket = {
  id: string;
  title: string;
  body: string | null;
  reporter: string | null;
  kind: TicketKind;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
};
