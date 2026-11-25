import { ReviewDetailScreen } from "@/components/reviews-screen";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewDetailScreen reviewId={id} />;
}
