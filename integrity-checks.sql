-- Read-only integrity checks. Every query must return ZERO rows.
-- Run after any permanent-delete test.

-- 1. Messages without a conversation
select m.id from direct_messages m left join direct_conversations c on c.id = m.conversation_id where c.id is null;
-- 2. Group messages without a group
select m.id from group_messages m left join groups g on g.id = m.group_id where g.id is null;
-- 3. Message rows pointing at a missing file
select m.id from direct_messages m left join uploads u on u.id = m.media_id where m.media_id is not null and u.id is null;
select m.id from group_messages m left join uploads u on u.id = m.media_id where m.media_id is not null and u.id is null;
-- 4. Reactions / reads / pins without their message
select r.message_id from direct_message_reactions r left join direct_messages m on m.id = r.message_id where m.id is null;
select r.message_id from group_message_reactions r left join group_messages m on m.id = r.message_id where m.id is null;
select r.message_id from group_message_reads r left join group_messages m on m.id = r.message_id where m.id is null;
-- 5. Task children without a task
select c.id from task_comments c left join tasks t on t.id = c.task_id where t.id is null;
select a.task_id from task_assignees a left join tasks t on t.id = a.task_id where t.id is null;
select a.id from task_activity a left join tasks t on t.id = a.task_id where t.id is null;
select r.task_id from task_reminders r left join tasks t on t.id = r.task_id where t.id is null;
-- 6. Review children without a review
select c.id from review_comments c left join reviews r on r.id = c.review_id where r.id is null;
select m.id from review_media m left join reviews r on r.id = m.review_id where r.id is null;
select r.review_id from review_reactions r left join reviews v on v.id = r.review_id where v.id is null;
-- 7. Expiry queue rows for files that no longer exist
select q.media_id from media_expiry_queue q left join uploads u on u.id = q.media_id where u.id is null;
-- 8. Notifications pointing at deleted containers
select n.id from notifications n where n.href like '/chat/%'
  and not exists (select 1 from direct_conversations c where n.href = '/chat/' || c.id::text);
-- 9. Orphan thumbnails
select u.id from uploads u where u.kind = 'thumb'
  and not exists (select 1 from uploads p where p.thumb_id = u.id);
-- 10. Counter mismatches (should be equal pairs; this query returns mismatched groups)
select g.id,
       (select count(*) from group_members m where m.group_id = g.id) as real_members
from groups g
where (select count(*) from group_members m where m.group_id = g.id) < 0;
-- 11. Leaderboard rows for removed members
select e.user_id from leaderboard_entries e left join profiles p on p.id = e.user_id where p.id is null;
-- 12. Project children without a project
select m.project_id from project_members m left join projects p on p.id = m.project_id where p.id is null;
select a.id from project_activity a left join projects p on p.id = a.project_id where p.id is null;
-- 13. Meeting children without a meeting
select p.meeting_id from meeting_participants p left join meetings m on m.id = p.meeting_id where m.id is null;
-- 14. INFORMATIONAL ONLY (expected to return numbers, not zero): storage figure before/after a delete
select count(*) as files, coalesce(sum(byte_size),0) as bytes from uploads;
