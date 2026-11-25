import { MeetingJoinScreen } from "@/components/meetings-screen";
export default async function MeetingJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MeetingJoinScreen token={token} />;
}
