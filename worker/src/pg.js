// Тонкая прослойка: интерфейс D1 (prepare/bind/first/all/run/batch) поверх Postgres.
// query(sql, params) должен вернуть массив строк.
export function makePgDb(query) {
  const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
  const norm = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
  const exec = async (sql, params) => norm(await query(toPg(sql), params));
  const stmt = (sql, params = []) => ({
    sql,
    params,
    bind: (...p) => stmt(sql, p),
    first: async () => (await exec(sql, params))[0] ?? null,
    all: async () => ({ results: await exec(sql, params) }),
    run: async () => { await exec(sql, params); return { success: true }; },
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => { for (const s of stmts) await exec(s.sql, s.params); return []; },
  };
}

export async function applySchema(query, schemaSql) {
  for (const part of schemaSql.split(';')) {
    if (part.trim()) await query(part, []);
  }
}
