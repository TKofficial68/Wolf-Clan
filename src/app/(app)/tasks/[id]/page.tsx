import { TaskDetailScreen } from "@/components/tasks-screen";
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskDetailScreen taskId={id} />;
}
