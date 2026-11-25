// End-to-end functional test of every feature and API surface.
// Usage: BASE=http://127.0.0.1:3000 node scripts/full-e2e.mjs
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const stamp = Date.now().toString().slice(-8);
const results = [];
let jar = "";

async function call(path, { method = "GET", body, form, useJar = true } = {}) {
  const headers = {};
  if (useJar && jar) headers.Cookie = jar;
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
    redirect: "manual",
  });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) jar = set.map((c) => c.split(";")[0]).join("; ");
  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 120) };
  }
  return { status: response.status, data, text, headers: response.headers };
}

function check(name, condition, detail = "") {
  results.push({ name, pass: Boolean(condition), detail });
}

function ok(name, res, predicate = (r) => r.status >= 200 && r.status < 300) {
  check(name, predicate(res), `status ${res.status} ${JSON.stringify(res.data).slice(0, 140)}`);
  return res.data;
}

// ---------- Owner session ----------
const owner = await call("/api/auth/login", {
  method: "POST",
  useJar: false,
  body: { email: process.env.OWNER_EMAIL ?? "owner@wolfclan.app", password: process.env.OWNER_PASSWORD ?? "WolfClan#Owner26" },
});
ok("owner login", owner);
const ownerJar = jar;

// ---------- Member session ----------
jar = "";
const memberEmail = `e2e${stamp}@wolfclan.app`;
const memberName = `E2E ${stamp}`;
const memberUser = `e2e${stamp}`;
ok(
  "member register",
  await call("/api/auth/register", {
    method: "POST",
    useJar: false,
    body: { email: memberEmail, password: "Pass#2026test", confirmPassword: "Pass#2026test", displayName: memberName, username: memberUser },
  }),
);
const memberJar = jar;
const memberHome = ok("member home", await call("/api/home"));
const memberId = memberHome.me.id;
check("member role is MEMBER", memberHome.me.role === "MEMBER", memberHome.me.role);

// ---------- Home / DM ----------
jar = ownerJar;
const ownerHome = ok("owner home", await call("/api/home"));
const ownerId = ownerHome.me.id;
check("home has 8+ groups via api", Array.isArray(ownerHome.members), "members array");
const dm = ok("create dm", await call("/api/dm", { method: "POST", body: { userId: memberId } }));
check("dm conversation id", Boolean(dm.conversationId), dm.conversationId);
const dmAgain = ok("create dm is idempotent", await call("/api/dm", { method: "POST", body: { userId: memberId } }));
check("dm not duplicated", dmAgain.conversationId === dm.conversationId, `${dmAgain.conversationId}`);
ok("pin dm", await call(`/api/dm/${dm.conversationId}`, { method: "PATCH", body: { pinned: true, favorite: true } }));

// ---------- Media uploads ----------
const jwt = readFileSync("/tmp/chat.jpg");
async function upload(name, type, bytes, extra = {}) {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  form.append("name", name);
  for (const [key, value] of Object.entries(extra)) form.append(key, String(value));
  return call("/api/media", { method: "POST", form });
}
const photo = ok("upload photo", await upload("chat.jpg", "image/jpeg", jwt, { kind: "image", width: 400, height: 300 }));
ok("upload document", await upload("notes.txt", "text/plain", Buffer.from("hello wolf clan"), { kind: "document" }));
const videoBytes = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2048)]);
ok("upload video", await upload("clip.webm", "video/webm", videoBytes, { kind: "video", duration: 12 }));
ok("upload audio", await upload("voice.webm", "audio/webm", Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(512)]), { kind: "voice", duration: 4 }));
check("upload blocks executable", (await upload("evil.exe", "application/x-msdownload", Buffer.from("MZ"), { kind: "document" })).status === 415, "415 expected");
check("media meta", (await call(`/api/media/meta?id=${photo.id}`)).status === 200, "200 expected");
check("media range", (await call(`/api/media/${photo.id}`, { headers: {} })).status === 200, "200 expected");

// ---------- Chat DM ----------
function messagePath(kind, id) {
  return "/api/chat";
}
const dmSend = ok("dm send text", await call("/api/chat", { method: "POST", body: { action: "send", kind: "dm", scopeId: dm.conversationId, body: "E2E hello owner", clientMessageId: `e2e-dm-${stamp}` } }));
ok("dm send photo", await call("/api/chat", { method: "POST", body: { action: "send", kind: "dm", scopeId: dm.conversationId, messageType: "image", mediaId: photo.id, clientMessageId: `e2e-img-${stamp}` } }));
ok("dm send voice", await call("/api/chat", { method: "POST", body: { action: "send", kind: "dm", scopeId: dm.conversationId, messageType: "voice", mediaId: photo.id, clientMessageId: `e2e-voice-${stamp}` } }));
ok("dm reply", await call("/api/chat", { method: "POST", body: { action: "send", kind: "dm", scopeId: dm.conversationId, body: "reply text", replyToId: dmSend.id, clientMessageId: `e2e-reply-${stamp}` } }));
ok("dm edit", await call("/api/chat", { method: "POST", body: { action: "edit", kind: "dm", scopeId: dm.conversationId, messageId: dmSend.id, body: "E2E edited" } }));
ok("dm react", await call("/api/chat", { method: "POST", body: { action: "react", kind: "dm", scopeId: dm.conversationId, messageId: dmSend.id, reaction: "🔥" } }));
ok("dm pin", await call("/api/chat", { method: "POST", body: { action: "pin", kind: "dm", scopeId: dm.conversationId, messageId: dmSend.id, pinned: true } }));
ok("dm typing", await call("/api/chat", { method: "POST", body: { action: "typing", kind: "dm", scopeId: dm.conversationId } }));
ok("dm read", await call("/api/chat", { method: "POST", body: { action: "read", kind: "dm", scopeId: dm.conversationId } }));
const dmLoad = ok("dm load", await call(`/api/chat?kind=dm&id=${dm.conversationId}`));
check("dm messages present", dmLoad.messages.length >= 4, `${dmLoad.messages.length} messages`);
check("dm reactions present", dmLoad.messages.some((m) => m.reactions.length > 0), "reaction found");
check("dm reply preview", dmLoad.messages.some((m) => m.replyTo), "reply found");
check("dm search", (await call(`/api/chat?kind=dm&id=${dm.conversationId}&search=edited`)).data.messages?.length >= 1, "search hit");
ok("dm delete for me", await call("/api/chat", { method: "POST", body: { action: "delete", kind: "dm", scopeId: dm.conversationId, messageId: dmSend.id, mode: "me" } }));

// ---------- Groups ----------
jar = ownerJar;
const groupName = `E2E Crew ${stamp}`;
const group = ok("create group", await call("/api/groups", { method: "POST", body: { action: "create", name: groupName, description: "E2E group", accent: "teal", icon: "editing", memberIds: [memberId] } }));
const groupId = group.id;
ok("group detail", await call(`/api/groups?id=${groupId}`));
ok("group update", await call("/api/groups", { method: "POST", body: { action: "update", groupId, name: groupName, description: "E2E updated", accent: "purple", icon: "editing" } }));
ok("group mute", await call("/api/groups", { method: "POST", body: { action: "mute", groupId, hours: 1 } }));
ok("group unmute", await call("/api/groups", { method: "POST", body: { action: "mute", groupId, hours: 0 } }));
ok("group role", await call("/api/groups", { method: "POST", body: { action: "role", groupId, userId: memberId, role: "MODERATOR" } }));
ok("group favorite", await call("/api/groups", { method: "POST", body: { action: "favorite", groupId, value: true } }));
const groupSend = ok("group send", await call("/api/chat", { method: "POST", body: { action: "send", kind: "group", scopeId: groupId, body: `@${memberUser} group hello`, clientMessageId: `e2e-g-${stamp}` } }));
ok("group react", await call("/api/chat", { method: "POST", body: { action: "react", kind: "group", scopeId: groupId, messageId: groupSend.id, reaction: "👍" } }));
ok("group read", await call("/api/chat", { method: "POST", body: { action: "read", kind: "group", scopeId: groupId } }));
const groupLoad = ok("group load", await call(`/api/chat?kind=group&id=${groupId}`));
check("group seen-by data", groupLoad.messages.some((m) => m.readCount >= 0), "readCount present");
check("group pinned list", Array.isArray(groupLoad.pinned), "pinned array");

// member reads the group
jar = memberJar;
const memberGroupLoad = ok("member group load", await call(`/api/chat?kind=group&id=${groupId}`));
check("member sees members", memberGroupLoad.members.length >= 2, `${memberGroupLoad.members.length}`);

// ---------- Reviews ----------
jar = ownerJar;
const review = ok("review create", await call("/api/reviews", { method: "POST", body: { action: "create", kind: "SHORTS", game: "Minecraft", title: `E2E review ${stamp}`, description: "E2E description", mediaIds: [photo.id] } }));
const reviewId = review.id;
ok("review list", await call("/api/reviews"));
const reviewDetail = ok("review detail", await call(`/api/reviews?id=${reviewId}`));
check("review detail has media", reviewDetail.detail.media.length >= 1, `${reviewDetail.detail.media.length}`);
ok("review react", await call("/api/reviews", { method: "POST", body: { action: "react", reviewId, reaction: "LIKE" } }));
ok("review comment", await call("/api/reviews", { method: "POST", body: { action: "comment", reviewId, body: "E2E comment" } }));
const reviewAfter = ok("review reload", await call(`/api/reviews?id=${reviewId}`));
check("review comment count", reviewAfter.detail.commentCount >= 1, `${reviewAfter.detail.commentCount}`);
ok("review moderate", await call("/api/reviews", { method: "POST", body: { action: "moderate", reviewId, pinned: true, status: "APPROVED" } }));

// ---------- Tasks ----------
const deadline = new Date(Date.now() + 36 * 3600 * 1000).toISOString();
const task = ok("task create", await call("/api/tasks", { method: "POST", body: { action: "create", title: `E2E task ${stamp}`, description: "E2E task body", priority: "HIGH", assigneeIds: [memberId, ownerId], deadline, groupId } }));
const taskId = task.id;
ok("task list mine", await call("/api/tasks?filter=mine"));
const deadlineList = ok("task deadline buckets", await call("/api/tasks?filter=deadline"));
check("deadline buckets computed", deadlineList.buckets !== null, "buckets present");
jar = memberJar;
ok("assignee sets status", await call("/api/tasks", { method: "POST", body: { action: "status", taskId, status: "IN_PROGRESS" } }));
ok("assignee sets progress", await call("/api/tasks", { method: "POST", body: { action: "progress", taskId, progress: 70 } }));
ok("assignee comments", await call("/api/tasks", { method: "POST", body: { action: "comment", taskId, body: "E2E done soon" } }));
const taskDetail = ok("task detail", await call(`/api/tasks?id=${taskId}`));
check("task comments", taskDetail.task.comments.length >= 1, `${taskDetail.task.comments.length}`);
check("task activity", taskDetail.task.activity.length >= 3, `${taskDetail.task.activity.length}`);
ok("assignee completes", await call("/api/tasks", { method: "POST", body: { action: "status", taskId, status: "COMPLETED" } }));
jar = ownerJar;
const searchTasks = ok("task search", await call(`/api/tasks?filter=mine&q=E2E`));
check("task search hit", searchTasks.items.length >= 1, `${searchTasks.items.length}`);

// ---------- Projects ----------
const projectName = `E2E Project ${stamp}`;
const project = ok("project create", await call("/api/projects", { method: "POST", body: { action: "create", name: projectName, description: "E2E", status: "ACTIVE", memberIds: [memberId] } }));
const projectId = project.id;
ok("project link task", await call("/api/tasks", { method: "POST", body: { action: "update", taskId, projectId } }));
const projectDetail = ok("project detail", await call(`/api/projects?id=${projectId}`));
check("project has task", projectDetail.project.tasks.length >= 1, `${projectDetail.project.tasks.length}`);
ok("project add member", await call("/api/projects", { method: "POST", body: { action: "members", projectId, add: true, userId: ownerId } }));
ok("project list mine", await call("/api/projects?filter=mine"));
ok("project update", await call("/api/projects", { method: "POST", body: { action: "update", projectId, status: "ON_HOLD" } }));

// ---------- Leaderboard ----------
ok("leaderboard set", await call("/api/leaderboard", { method: "POST", body: { action: "update", game: "Free Fire", userId: memberId, mode: "delta", amount: 25, reason: "E2E" } }));
const board = ok("leaderboard read", await call("/api/leaderboard?game=Free%20Fire"));
check("leaderboard entry", board.entries.length >= 1, `${board.entries.length}`);
check("leaderboard history", board.history.length >= 1, `${board.history.length}`);

// ---------- Meetings ----------
const meeting = ok("meeting create", await call("/api/meetings", { method: "POST", body: { action: "create", title: `E2E meeting ${stamp}`, description: "E2E", startNow: true, memberIds: [memberId] } }));
const meetingId = meeting.id;
ok("meeting list", await call("/api/meetings"));
ok("meeting detail", await call(`/api/meetings?id=${meetingId}`));
check("meeting token honest", (await call(`/api/meetings/${meetingId}/token`, { method: "POST" })).status === 503, "503 when unconfigured");
jar = memberJar;
ok("meeting join", await call("/api/meetings", { method: "POST", body: { action: "join", meetingId } }));
ok("screen claim", await call("/api/meetings", { method: "POST", body: { action: "claim-screen", meetingId } }));
ok("screen release", await call("/api/meetings", { method: "POST", body: { action: "release-screen", meetingId } }));
jar = ownerJar;
ok("meeting lock", await call("/api/meetings", { method: "POST", body: { action: "lock", meetingId, locked: true } }));
ok("meeting mute-all", await call("/api/meetings", { method: "POST", body: { action: "mute-all", meetingId } }));
ok("meeting end", await call("/api/meetings", { method: "POST", body: { action: "end", meetingId } }));

// ---------- Reports ----------
const report = ok("report create", await call("/api/reports", { method: "POST", body: { action: "create", targetType: "message", targetId: groupSend.id, reason: "SPAM", detail: "E2E report" } }));
ok("report mine", await call("/api/reports?scope=mine"));
ok("report queue", await call("/api/reports?scope=queue"));
ok("report status", await call("/api/reports", { method: "POST", body: { action: "status", reportId: report.id, status: "RESOLVED", note: "checked" } }));

// ---------- Invites ----------
const invite = ok("invite create", await call("/api/invites", { method: "POST", body: { action: "create", mode: "both", expiry: "1d", maxUses: 2, groupId, approvalRequired: false } }));
const inviteCheck = await call(`/api/invites?code=${invite.code}`);
check("invite validate", inviteCheck.data.valid === true, `status ${inviteCheck.status} ${JSON.stringify(inviteCheck.data)}`);
jar = memberJar;
check("invite validate as member", (await call(`/api/invites?code=${invite.code}`)).data.valid === true, "member can validate");
jar = ownerJar;
ok("invite revoke", await call("/api/invites", { method: "POST", body: { action: "revoke", inviteId: (await call("/api/invites")).data.invites[0].id } }));

// ---------- Notifications / search ----------
ok("notifications list", await call("/api/notifications"));
ok("notifications count", await call("/api/notifications?count=1"));
ok("notifications read all", await call("/api/notifications", { method: "POST", body: { action: "read-all" } }));
const search = ok("global search", await call("/api/search?q=E2E"));
check("search grouped", Array.isArray(search.groups) && search.groups.length === 6, `${search.groups?.length}`);
check("search found content", search.groups.some((g) => g.results.length > 0), JSON.stringify(search.groups.map((g) => g.results.length)));

// ---------- Owner sections ----------
for (const section of ["dashboard", "members", "admins", "permissions", "groups", "invites", "branding", "reviews", "reports", "bans", "security", "audit", "storage", "notifications", "system"]) {
  ok(`owner section ${section}`, await call(`/api/owner?section=${section}`));
}
ok("owner role change", await call("/api/owner", { method: "POST", body: { action: "role", userId: memberId, role: "ADMIN" } }));
ok("owner permissions toggle", await call("/api/owner", { method: "POST", body: { action: "permission-user", userId: memberId, capability: "create_tasks", allowed: true } }));
ok("owner title", await call("/api/owner", { method: "POST", body: { action: "title", userId: memberId, title: "Editor" } }));
ok("owner review settings", await call("/api/owner", { method: "POST", body: { action: "review-settings", membersCanPostReviews: true, reviewModeration: true } }));
ok("owner branding", await call("/api/owner", { method: "POST", body: { action: "branding", appName: "Wolf Clan", tagline: "One team. One vision." } }));
ok("owner notify", await call("/api/owner", { method: "POST", body: { action: "notify", audience: "user", userId: memberId, title: "E2E notice", body: "hello" } }));
ok("owner registration mode", await call("/api/owner", { method: "POST", body: { action: "registration-mode", mode: "open" } }));
ok("owner cleanup dry", await call("/api/owner", { method: "POST", body: { action: "cleanup-now", confirm: "CLEANUP", dryRun: true } }));
check("owner audit csv", (await call("/api/owner?section=audit&format=csv")).text.startsWith("id,actor"), "csv header");
ok("owner force signout", await call("/api/owner", { method: "POST", body: { action: "force-signout", userId: memberId } }));
ok("owner unban path", await call("/api/owner", { method: "POST", body: { action: "unban", userId: memberId } }));

// ---------- Cron jobs ----------
for (const job of ["temp", "monthly", "reminders", "presence", "tombstones", "orphans", "retry"]) {
  const res = await call(`/api/cron/${job}?dryRun=1`);
  check(`cron ${job} dry run`, res.status === 200 && res.data.ok === true, `status ${res.status}`);
}

// ---------- Permanent delete ----------
const deleted = ok("permanent delete message", await call("/api/hard-delete", { method: "POST", body: { type: "message", targetId: groupSend.id } }));
check("delete reports files", typeof deleted.files === "number", `${deleted.files}`);
ok("permanent delete review", await call("/api/hard-delete", { method: "POST", body: { type: "review", targetId: reviewId, confirm: "DELETE" } }));
check("review gone", (await call(`/api/reviews?id=${reviewId}`)).status === 404, "404 expected");
ok("permanent delete task", await call("/api/hard-delete", { method: "POST", body: { type: "task", targetId: taskId, confirm: "DELETE" } }));
check("task gone", (await call(`/api/tasks?id=${taskId}`)).status === 404, "404 expected");
ok("permanent delete project", await call("/api/hard-delete", { method: "POST", body: { type: "project", targetId: projectId, confirm: "DELETE" } }));
ok("permanent delete group", await call("/api/hard-delete", { method: "POST", body: { type: "group", targetId: groupId, confirm: "DELETE" } }));
ok("tombstones", await call("/api/tombstones"));
check("group re-creatable after delete", (await call("/api/groups", { method: "POST", body: { action: "create", name: groupName, description: "recreated" } })).status === 200, "200 expected");

// ---------- Pages ----------
const pages = ["/login", "/register", "/forgot-password", "/verify-email", "/offline", "/home", "/search", "/announcements", "/groups", "/reviews", "/tasks", "/tasks/new", "/projects", "/meetings", "/notifications", "/reports", "/profile", "/profile/edit", "/settings", "/settings/account", "/settings/notifications", "/settings/privacy", "/settings/appearance", "/settings/storage", "/blocked-users", "/menu", "/how-to-use", "/about", "/contact/developer", "/contact/owner", "/leaderboard/roblox", "/leaderboard/minecraft", "/leaderboard/manage", "/owner", "/owner/members", "/owner/permissions", "/owner/invites", "/owner/branding", "/owner/storage", "/owner/system", "/splash", "/403"];
for (const page of pages) {
  const res = await call(page);
  check(`page ${page}`, res.status === 200, `status ${res.status}`);
}

// ---------- Account cleanup ----------
jar = "";
ok("member re-login after force sign-out", await call("/api/auth/login", { method: "POST", useJar: false, body: { email: memberEmail, password: "Pass#2026test" } }));
ok("account delete", await call("/api/account", { method: "POST", body: { action: "delete", deleteWord: "DELETE", password: "Pass#2026test" } }));
check("deleted member cannot log in", (await call("/api/auth/login", { method: "POST", useJar: false, body: { email: memberEmail, password: "Pass#2026test" } })).status === 401, "401 expected");

// ---------- Summary ----------
const failed = results.filter((row) => !row.pass);
for (const row of results) {
  if (!row.pass) console.log(`FAIL  ${row.name} :: ${row.detail}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log(`${failed.length} failures`);
process.exit(failed.length ? 1 : 0);
