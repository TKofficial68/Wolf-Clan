"use client";

import { useApp } from "./providers";
import { useViewer } from "./media-viewer-provider";
import { Avatar } from "./ui";

export function AvatarEnlarge({
  name,
  src,
  mediaId,
  size = 88,
}: {
  name: string;
  src: string | null;
  mediaId: string | null;
  size?: number;
}) {
  const { t } = useApp();
  const { open } = useViewer();
  return (
    <button
      type="button"
      disabled={!mediaId}
      onClick={() => {
        if (!mediaId) return;
        open({
          title: name,
          items: [
            {
              id: mediaId,
              thumbId: null,
              kind: "image",
              name,
              mime: "image/jpeg",
              size: 0,
              width: size,
              height: size,
              duration: null,
              expired: false,
              createdAt: new Date().toISOString(),
            },
          ],
          index: 0,
        });
      }}
      aria-label={mediaId ? t("viewer.open") : name}
      style={{ cursor: mediaId ? "zoom-in" : "default" }}
    >
      <Avatar name={name} src={src} size={size} />
    </button>
  );
}
