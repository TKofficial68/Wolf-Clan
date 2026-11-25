// Seeds the default groups and the owner settings singleton. Safe to re-run.
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const groups = [
  { slug: "announcements", name: "Announcements", accent: "blue", icon: "announce", restricted: true, description: "Important news, updates and announcements for everyone." },
  { slug: "reviews", name: "Review Shorts & Long Video", accent: "red", icon: "review", restricted: false, description: "Share your reviews, thoughts and feedback on shorts and long videos." },
  { slug: "minecraft", name: "Minecraft Group", accent: "green", icon: "minecraft", restricted: false, description: "Build, explore, survive — together!" },
  { slug: "free-fire", name: "Free Fire Group", accent: "orange", icon: "freefire", restricted: false, description: "Play. Share. Improve. Together." },
  { slug: "meeting", name: "Meeting Group", accent: "blue", icon: "meeting", restricted: false, description: "Team meetings, discussions and planning." },
  { slug: "other-games", name: "Other Games", accent: "teal", icon: "other-games", restricted: false, description: "Every other game the team plays, in one place." },
  { slug: "editing", name: "Editing", accent: "purple", icon: "editing", restricted: false, description: "Cuts, colour, sound — help each other raise the bar." },
  { slug: "video-ideas", name: "Video Ideas", accent: "amber", icon: "video-ideas", restricted: false, description: "Drop concepts and pick what the team makes next." },
];

const client = new pg.Client({ connectionString: url });
await client.connect();

const owner = await client.query("select id from profiles where role = 'OWNER' limit 1");
const ownerId = owner.rows[0]?.id ?? null;
const everyone = await client.query("select id, role from profiles");

for (const group of groups) {
  const existing = await client.query("select id from groups where slug = $1", [group.slug]);
  let groupId = existing.rows[0]?.id;
  if (!groupId) {
    const inserted = await client.query(
      `insert into groups (slug, name, description, accent, icon, post_restricted, is_system, created_by)
       values ($1,$2,$3,$4,$5,$6,true,$7) returning id`,
      [group.slug, group.name, group.description, group.accent, group.icon, group.restricted, ownerId],
    );
    groupId = inserted.rows[0].id;
    console.log(`created group ${group.slug}`);
  }
  for (const member of everyone.rows) {
    const role = member.role === "OWNER" || member.role === "ADMIN" ? "MODERATOR" : "MEMBER";
    await client.query(
      `insert into group_members (group_id, user_id, group_role, added_by)
       values ($1,$2,$3,$4) on conflict do nothing`,
      [groupId, member.id, role, ownerId],
    );
  }
}

await client.query("insert into owner_settings (id) values ('singleton') on conflict do nothing");
console.log(`seed complete: ${groups.length} default groups, ${everyone.rows.length} accounts enrolled`);
await client.end();
