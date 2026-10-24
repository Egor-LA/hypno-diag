// Точка входа Supabase Edge Function. Собирается в supabase/functions/diag/index.js (npm run build).
import postgres from 'npm:postgres@3.4.5';
import worker from '../worker/src/index.js';
import { makePgDb, applySchema } from '../worker/src/pg.js';
import schemaSql from '../worker/schema.sql';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL'), {
  max: 3,
  prepare: false,
  types: { bigint: { to: 20, from: [20], parse: (x) => Number(x), serialize: (x) => String(x) } },
});
const query = (q, params) => sql.unsafe(q, params);
const DB = makePgDb(query);
let ready = null;

Deno.serve(async (req) => {
  ready ??= applySchema(query, schemaSql).catch((e) => { ready = null; throw e; });
  await ready;
  const env = { ...Deno.env.toObject(), DB };
  return worker.fetch(req, env);
});
