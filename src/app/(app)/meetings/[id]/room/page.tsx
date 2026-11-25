import { MeetingRoomScreen } from "@/components/meetings-screen";
export default async function MeetingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MeetingRoomScreen meetingId={id} />;
}
