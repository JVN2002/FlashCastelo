async function writeAuditLog(client, payload) {
  const {
    userId = null,
    action,
    entity,
    entityId = null,
    metadata = null,
    ipAddress = null,
    userAgent = null
  } = payload;

  await client.query(
    `
      INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [userId, action, entity, entityId, metadata, ipAddress, userAgent]
  );
}

module.exports = { writeAuditLog };
