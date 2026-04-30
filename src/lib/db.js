import oracledb from 'oracledb';

const config = {
  user:          process.env.ORACLE_USER,
  password:      process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING,
};

let pool = null;

export async function getPool() {
  if (!pool) {
    oracledb.outFormat   = oracledb.OUT_FORMAT_OBJECT;
    oracledb.autoCommit  = true;
    pool = await oracledb.createPool({ ...config, poolMin: 2, poolMax: 10, poolIncrement: 1 });
  }
  return pool;
}

export async function query(sql, binds = {}, opts = {}) {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    return await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, ...opts });
  } finally {
    await conn.close();
  }
}

// Returns first row or null
export async function queryOne(sql, binds = {}) {
  const result = await query(sql, binds);
  return result.rows?.[0] ?? null;
}
