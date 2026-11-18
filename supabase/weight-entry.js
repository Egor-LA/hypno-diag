// Точка входа функции опросника по весу. Собирается в supabase/functions/weight/index.js (npm run build:weight).
import postgres from 'npm:postgres@3.4.5';
import worker from '../weight/src/index.js';
import { makePgDb } from '../worker/src/pg.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL'), {
  max: 3,
  prepare: false,
  types: { bigint: { to: 20, from: [20], parse: (x) => Number(x), serialize: (x) => String(x) } },
});
const DB = makePgDb((q, params) => sql.unsafe(q, params));

Deno.serve((req) => worker.fetch(req, { ...Deno.env.toObject(), DB }));
