import { MeetingLobbyScreen } from "@/components/meetings-screen";
export default async function MeetingLobbyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MeetingLobbyScreen meetingId={id} />;
}
