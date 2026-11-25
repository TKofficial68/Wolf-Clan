import { GroupScreen } from "@/components/group-screen";
export default async function GroupEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupScreen groupId={id} />;
}
