import { SearchScreen } from "@/components/search-screen";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const { file } = await searchParams;
  return <SearchScreen fileId={file} />;
}
