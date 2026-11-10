import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/** One SQLite file holds sign-in sessions (Better Auth tables) and saka's own tables. */
const SCHEMA = `
create table if not exists experiments (
  id text primary key, code text not null, product text not null,
  control_price real not null, test_price real not null, share real not null,
  unit_cost real not null, units_per_order real not null, prior_mean real not null, prior_sd real not null,
  status text not null default 'running', decision text, reason text,
  created_by text, created_at text not null, stopped_at text
);
create table if not exists events (
  id integer primary key autoincrement, experiment_id text not null, arm text not null, kind text not null,
  count integer not null default 1, amount real, order_id text, source text not null, created_at text not null
);
create unique index if not exists events_order_kind on events(order_id, kind) where order_id is not null;
create index if not exists events_exp on events(experiment_id);
create table if not exists evaluations (
  id integer primary key autoincrement, experiment_id text not null, at text not null,
  views integer not null, purchases integer not null, p10 real not null, p50 real not null, p90 real not null,
  prob real not null, e_p10 real not null, e_p90 real not null, decision text not null
);
create table if not exists prices (
  id integer primary key autoincrement, code text not null, price real not null,
  set_by text, set_at text not null, note text, active integer not null default 1
);
create table if not exists settings (key text primary key, value text not null);
create table if not exists subscribers (
  id text primary key, plan_id text, status text, email text, created_at text not null, updated_at text not null
);
create table if not exists actions (
  id integer primary key autoincrement, kind text not null, summary text not null,
  result text, ok integer not null, user_email text, created_at text not null
);
create table if not exists webhook_events (
  id text primary key, event_type text not null, resource_id text, verified integer not null,
  received_at text not null, summary text
);
`;

const g = globalThis as unknown as { __sakaDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__sakaDb) return g.__sakaDb;
  const file = path.resolve(process.cwd(), process.env.DATABASE_PATH ?? "./data/saka.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  // Rollback journal, not WAL: every commit lands in the main file, so restarts and redeploys never lose writes.
  d.exec("pragma journal_mode = delete; pragma busy_timeout = 5000; pragma foreign_keys = on;");
  d.exec(SCHEMA);
  g.__sakaDb = d;
  return d;
}

export const nowIso = () => new Date().toISOString();

export function getSetting(key: string): string | null {
  const row = db().prepare("select value from settings where key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
export function setSetting(key: string, value: string) {
  db().prepare("insert into settings(key, value) values(?, ?) on conflict(key) do update set value = excluded.value").run(key, value);
}

export function logAction(a: { kind: string; summary: string; result?: unknown; ok: boolean; userEmail?: string | null }) {
  db().prepare("insert into actions(kind, summary, result, ok, user_email, created_at) values(?, ?, ?, ?, ?, ?)")
    .run(a.kind, a.summary, a.result === undefined ? null : JSON.stringify(a.result), a.ok ? 1 : 0, a.userEmail ?? null, nowIso());
}
