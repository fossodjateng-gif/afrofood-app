// Explicit operator tool. Reads a JSON object from stdin; never reads browser
// users, never logs the password/hash and never creates privileged defaults.
import { randomUUID, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
async function main() {
let input = '';
for await (const chunk of process.stdin) input += chunk;
const user = JSON.parse(input);
const username = String(user.username || '').trim().toLowerCase();
if ((user.id !== undefined && (typeof user.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(user.id))) || !username || username.length > 80 || !['admin', 'cashier', 'kitchen'].includes(user.role)
  || typeof user.active !== 'boolean' || typeof user.password !== 'string' || user.password.length < 12 || user.password.length > 256
  || (user.role !== 'admin' && !String(user.cashierEventId || '').trim())) throw new Error('Invalid explicit staff account');
const salt = randomBytes(16).toString('hex');
const key = await promisify(scrypt)(user.password, salt, 64, { N: 16384, r: 8, p: 1 });
const hash = `scrypt-v1:${salt}:${key.toString('hex')}`;
user.password = undefined;
if (!process.argv.includes('--apply')) {
  process.stdout.write('Validated. Dry run only; no DB connection. Use --apply explicitly to provision.\n');
} else {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  await sql.transaction([
    sql`INSERT INTO staff_users (id, username, password_hash, role, active, cashier_event_id)
      VALUES (${user.id || randomUUID()}, ${username}, ${hash}, ${user.role}, ${user.active}, ${user.cashierEventId || null})
      ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role, active = EXCLUDED.active, cashier_event_id = EXCLUDED.cashier_event_id, updated_at = NOW()`,
    sql`UPDATE staff_sessions SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id IN (SELECT id FROM staff_users WHERE username = ${username})`,
  ]);
  process.stdout.write('Staff account provisioned; existing sessions revoked.\n');
}

}
try { await main(); }
catch { process.stderr.write('Provisioning failed. Check input or Preview configuration.\n'); process.exitCode = 1; }
