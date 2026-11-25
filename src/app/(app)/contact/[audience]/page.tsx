import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ContactForm } from "@/components/contact-form";

export default async function ContactPage({ params }: { params: Promise<{ audience: string }> }) {
  await requireUser();
  const { audience } = await params;
  if (audience !== "developer" && audience !== "owner") notFound();
  return <ContactForm audience={audience} />;
}
