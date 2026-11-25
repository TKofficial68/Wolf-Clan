// Removes the rows created by scripts/permission-tests.mjs.
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("delete from auth_attempts");
await client.query("delete from profiles where email like 'audit%@wolfclan.app'");
await client.query("delete from announcements where title like 'audit %'");
await client.query("delete from groups where name like 'audit group %'");
await client.query("delete from leaderboard_history where reason = 'audit'");
await client.query("delete from leaderboard_entries where points = 50");
await client.query("delete from reports where detail = 'audit'");
await client.query("delete from notifications where created_at > now() - interval '10 minutes'");
await client.query("delete from audit_logs where created_at > now() - interval '10 minutes'");
await client.query("delete from cleanup_jobs where started_at > now() - interval '20 minutes'");
await client.query("delete from hard_delete_jobs where created_at > now() - interval '20 minutes'");
await client.query("delete from deletion_tombstones where deleted_at > now() - interval '20 minutes'");
await client.query("delete from direct_conversations where not exists (select 1 from direct_conversation_members m where m.conversation_id = direct_conversations.id)");
console.log("audit rows cleaned");
await client.end();
