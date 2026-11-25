import { ProjectDetailScreen } from "@/components/projects-screen";
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetailScreen projectId={id} />;
}
