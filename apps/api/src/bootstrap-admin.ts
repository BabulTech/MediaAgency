// Creates the Supabase login for the seeded administrator. Run once: npm run bootstrap-admin -w @mamp/api
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { supabaseIdentity } from './auth';
import { openDb } from './db';
import { users } from './schema';

async function main() {
  const db = await openDb();
  const [admin] = await db.select().from(users).where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com'));
  if (!admin) throw new Error('Seeded administrator not found');
  if (admin.authId) { console.log('Administrator already linked'); process.exit(0); }
  const password = randomBytes(12).toString('base64url');
  const authId = await supabaseIdentity().create(admin.email, password);
  await db.update(users).set({ authId }).where(eq(users.id, admin.id));
  console.log(`Admin login: ${admin.email} / ${password} (shown once)`);
  process.exit(0);
}
main();
