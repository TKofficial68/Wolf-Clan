// API-level permission matrix tests. Run against a running server:
//   BASE=http://127.0.0.1:3000 OWNER_EMAIL=... OWNER_PASSWORD=... node scripts/permission-tests.mjs
// Prints a markdown table; exits non-zero when a cell does not match the matrix.
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const stamp = Date.now();
const results = [];

async function call(path, { method = "GET", body, jar } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (jar) headers.Cookie = jar;
  const response = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  return { status: response.status, data, jar: response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}

function expect(name, actor, actual, allowed) {
  const pass = allowed ? actual >= 200 && actual < 300 : actual === 401 || actual === 403 || actual === 404;
  results.push({ name, actor, status: actual, expected: allowed ? "allowed" : "refused", pass });
}

const ownerLogin = await call("/api/auth/login", { method: "POST", body: { email: process.env.OWNER_EMAIL ?? "owner@wolfclan.app", password: process.env.OWNER_PASSWORD ?? "WolfClan#Owner26" } });
if (ownerLogin.status !== 200) {
  console.error("owner login failed", ownerLogin.status, ownerLogin.data);
  process.exit(1);
}
const owner = ownerLogin.jar;
const ownerHome = await call("/api/home", { jar: owner });
const ownerId = ownerHome.data.me.id;

const memberEmail = `audit${stamp}@wolfclan.app`;
const memberRegister = await call("/api/auth/register", {
  method: "POST",
  body: { email: memberEmail, password: "Audit#2026pass", confirmPassword: "Audit#2026pass", displayName: `Audit ${stamp}`, username: `audit${stamp}` },
});
if (!memberRegister.jar) {
  console.error("SETUP FAILED: the member session was not created:", memberRegister.status, memberRegister.data);
  console.error("If this is `rate_limited`, run `node --env-file=.env scripts/cleanup-audit.mjs` first (it clears auth attempts).");
  process.exit(2);
}
const member = memberRegister.jar;
const memberHome = await call("/api/home", { jar: member });
const memberId = memberHome.data.me.id;

// New accounts must always be Member
results.push({ name: "registration role is MEMBER", actor: "new account", status: `${memberHome.data.me.role}`, expected: "MEMBER", pass: memberHome.data.me.role === "MEMBER" });

const groups = await call("/api/groups?scope=all", { jar: owner });
// Own throwaway group so the smoke run never edits or deletes a default group.
const groupName = `audit group ${stamp}`;
const created = await call("/api/groups", { method: "POST", jar: owner, body: { action: "create", name: groupName, description: "permission test", memberIds: [memberId] } });
const groupId = created.data.id;
if (!groupId || created.status !== 200) {
  console.error("SETUP FAILED: test group not created", created.status, created.data);
  process.exit(2);
}

// Signed-out
expect("home api", "signed-out", (await call("/api/home")).status, false);
expect("chat load", "signed-out", (await call(`/api/chat?kind=group&id=${groupId}`)).status, false);
expect("owner dashboard", "signed-out", (await call("/api/owner?section=dashboard")).status, false);

// Member vs Owner-only areas
expect("owner dashboard", "member", (await call("/api/owner?section=dashboard", { jar: member })).status, false);
expect("owner audit csv", "member", (await call("/api/owner?section=audit&format=csv", { jar: member })).status, false);
expect("owner dashboard", "owner", (await call("/api/owner?section=dashboard", { jar: owner })).status, true);

// Chat
const memberMessage = await call("/api/chat", { method: "POST", jar: member, body: { action: "send", kind: "group", scopeId: groupId, body: "audit member message", clientMessageId: `audit-m-${stamp}` } });
expect("send own message", "member", memberMessage.status, true);
const ownerMessage = await call("/api/chat", { method: "POST", jar: owner, body: { action: "send", kind: "group", scopeId: groupId, body: "audit owner message", clientMessageId: `audit-o-${stamp}` } });
expect("send own message", "owner", ownerMessage.status, true);
expect("delete others' message for everyone", "member", (await call("/api/chat", { method: "POST", jar: member, body: { action: "delete", kind: "group", scopeId: groupId, messageId: ownerMessage.data.id, mode: "all" } })).status, false);
expect("pin in group", "member", (await call("/api/chat", { method: "POST", jar: member, body: { action: "pin", kind: "group", scopeId: groupId, messageId: ownerMessage.data.id, pinned: true } })).status, false);
expect("pin in group", "owner", (await call("/api/chat", { method: "POST", jar: owner, body: { action: "pin", kind: "group", scopeId: groupId, messageId: ownerMessage.data.id, pinned: true } })).status, true);
expect("delete others' message for everyone", "owner", (await call("/api/chat", { method: "POST", jar: owner, body: { action: "delete", kind: "group", scopeId: groupId, messageId: memberMessage.data.id, mode: "all" } })).status, true);

// Restricted announcements group
const announcementsGroup = groupId;
if (announcementsGroup) {
  await call("/api/groups", { method: "POST", jar: owner, body: { action: "update", groupId: announcementsGroup, postRestricted: true } });
  expect("post in restricted group", "member", (await call("/api/chat", { method: "POST", jar: member, body: { action: "send", kind: "group", scopeId: announcementsGroup, body: "audit restricted", clientMessageId: `audit-r-${stamp}` } })).status, false);
  expect("post in restricted group", "owner", (await call("/api/chat", { method: "POST", jar: owner, body: { action: "send", kind: "group", scopeId: announcementsGroup, body: "audit allowed", clientMessageId: `audit-a-${stamp}` } })).status, true);
}

// Non-member group access
const outsiderGroup = (await call("/api/groups", { method: "POST", jar: owner, body: { action: "create", name: `audit private ${stamp}` } })).data.id;
expect("read group without membership", "member", (await call(`/api/chat?kind=group&id=${outsiderGroup}`, { jar: member })).status, false);
await call("/api/groups", { method: "POST", jar: owner, body: { action: "delete", groupId: outsiderGroup, confirmName: `audit private ${stamp}` } });

// Announcements, groups, reviews, tasks, projects, meetings, leaderboard, reports
expect("create announcement", "member", (await call("/api/announcements", { method: "POST", jar: member, body: { title: "audit", body: "audit body" } })).status, false);
expect("create announcement", "owner", (await call("/api/announcements", { method: "POST", jar: owner, body: { title: `audit ${stamp}`, body: "audit body" } })).status, true);
expect("create group", "member", (await call("/api/groups", { method: "POST", jar: member, body: { action: "create", name: `audit group ${stamp}` } })).status, false);
expect("moderate review", "member", (await call("/api/reviews", { method: "POST", jar: member, body: { action: "moderate", reviewId: "00000000-0000-0000-0000-000000000000", status: "HIDDEN" } })).status, false);
expect("create task", "member", (await call("/api/tasks", { method: "POST", jar: member, body: { action: "create", title: "audit", assigneeIds: [memberId] } })).status, false);
expect("manage leaderboard", "member", (await call("/api/leaderboard", { method: "POST", jar: member, body: { action: "update", game: "Roblox", userId: memberId, mode: "set", amount: 50, reason: "audit" } })).status, false);
expect("manage leaderboard", "owner", (await call("/api/leaderboard", { method: "POST", jar: owner, body: { action: "update", game: "Roblox", userId: memberId, mode: "set", amount: 50, reason: "audit" } })).status, true);
expect("create meeting", "member", (await call("/api/meetings", { method: "POST", jar: member, body: { action: "create", title: "audit meeting", startNow: true } })).status, false);
expect("reports queue", "member", (await call("/api/reports?scope=queue", { jar: member })).status, false);
expect("submit report", "member", (await call("/api/reports", { method: "POST", jar: member, body: { action: "create", targetType: "message", targetId: ownerMessage.data.id, reason: "SPAM", detail: "audit" } })).status, true);
expect("invites list", "member", (await call("/api/invites", { jar: member })).status, false);
expect("invites list", "owner", (await call("/api/invites", { jar: owner })).status, true);
expect("cron worker", "api without secret", (await call("/api/cron/temp")).status, false);
expect("permanent delete owner content", "member", (await call("/api/hard-delete", { method: "POST", jar: member, body: { type: "message", targetId: ownerMessage.data.id } })).status, false);
expect("permanent delete own content", "member", (await call("/api/hard-delete", { method: "POST", jar: member, body: { type: "message", targetId: memberMessage.data.id } })).status, true);

// cleanup
// The group used by this run is created for the test, so cleanup never touches a default group.
await call("/api/groups", { method: "POST", jar: owner, body: { action: "delete", groupId, confirmName: groupName } });
await call("/api/owner", { method: "POST", jar: owner, body: { action: "ban", userId: memberId, reason: "audit cleanup", hours: 0 } });

const failed = results.filter((row) => !row.pass);
console.log("| # | Action | Actor | HTTP | Expected | Result |");
console.log("| --- | --- | --- | --- | --- | --- |");
results.forEach((row, index) => {
  console.log(`| ${index + 1} | ${row.name} | ${row.actor} | ${row.status} | ${row.expected} | ${row.pass ? "PASS" : "FAIL"} |`);
});
console.log(`\n${results.length - failed.length}/${results.length} cells matched the matrix.`);
process.exit(failed.length ? 1 : 0);
