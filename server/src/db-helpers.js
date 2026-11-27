export async function withTransaction(callback, databasePool) {
  if (typeof callback !== 'function') throw new TypeError('A transaction callback is required.');
  if (!databasePool || typeof databasePool.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool with connect() is required.');
  }
  const client = await databasePool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const result = await callback(client);
    await client.query('COMMIT');
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try { await client.query('ROLLBACK'); } catch { /* Preserve the original operation error. */ }
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function logActivity(action, entityType, entityId, description, userId = null, executor) {
  if (!executor || typeof executor.query !== 'function') throw new TypeError('An activity-log query executor is required.');
  await executor.query(
    'INSERT INTO activity_logs (action, entity_type, entity_id, description, user_id) VALUES ($1, $2, $3, $4, $5)',
    [action, entityType, entityId ?? null, description, userId ?? null]
  );
}
