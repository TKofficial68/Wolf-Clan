// One-time owner bootstrap. Creates a real Owner account only when none exists.
import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const email = (process.env.OWNER_EMAIL ?? "owner@wolfclan.app").toLowerCase();
const password = process.env.OWNER_PASSWORD ?? "WolfClan#Owner26";
const displayName = process.env.OWNER_DISPLAY_NAME ?? "Wolf Owner";
const username = (process.env.OWNER_USERNAME ?? "owner").toLowerCase();

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
const passwordHash = `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;

const client = new pg.Client({ connectionString: url });
await client.connect();
const existing = await client.query("select id from profiles where role = 'OWNER' limit 1");
if (existing.rows.length) {
  console.log("Owner already exists; nothing created.");
} else {
  const inserted = await client.query(
    `insert into profiles (email, password_hash, username, display_name, role, email_verified)
     values ($1,$2,$3,$4,'OWNER',true) returning id`,
    [email, passwordHash, username, displayName],
  );
  await client.query("insert into user_settings (user_id) values ($1) on conflict do nothing", [inserted.rows[0].id]);
  await client.query("insert into user_presence (user_id, status, last_seen_at) values ($1,'offline',now()) on conflict do nothing", [
    inserted.rows[0].id,
  ]);
  console.log(`Owner created: ${email} / ${username}`);
  console.log(`Password: ${password}`);
}
await client.end();
