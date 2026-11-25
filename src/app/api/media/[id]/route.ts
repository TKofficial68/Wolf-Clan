import { getSessionUser } from "@/lib/auth";
import { canAccessMedia, mediaRow, readMediaChunk } from "@/lib/media-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const row = await mediaRow(id);
  if (!row) return new Response("Not found", { status: 404 });
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    return Response.json({ error: "expired" }, { status: 410 });
  }
  if (!(await canAccessMedia(viewer.id, viewer.role, id))) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  const safeName = (row.originalName ?? "file").replace(/["\\\r\n]/g, "_");
  const baseHeaders: Record<string, string> = {
    "Content-Type": row.mime,
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
  };

  const range = request.headers.get("range");
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), row.byteSize - 1) : row.byteSize - 1;
      if (start <= end && start < row.byteSize) {
        const length = end - start + 1;
        const chunk = await readMediaChunk(id, start, length);
        return new Response(new Uint8Array(chunk), {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${start}-${end}/${row.byteSize}`,
            "Content-Length": String(length),
          },
        });
      }
      return new Response("Range not satisfiable", { status: 416, headers: { "Content-Range": `bytes */${row.byteSize}` } });
    }
  }

  const full = await readMediaChunk(id, 0, row.byteSize);
  return new Response(new Uint8Array(full), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(row.byteSize) },
  });
}
