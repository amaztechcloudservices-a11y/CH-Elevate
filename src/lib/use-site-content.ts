"use client";

import { useEffect, useState } from "react";

import {
  defaultCmsSnapshot,
  type CmsSnapshot,
} from "@/lib/cms";

let cachedSnapshot: CmsSnapshot | undefined;

export function useSiteContent() {
  const [snapshot, setSnapshot] = useState<CmsSnapshot>(
    cachedSnapshot ?? defaultCmsSnapshot,
  );

  useEffect(() => {
    let active = true;

    fetch("/api/site-content", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Content is unavailable.");
        const result = (await response.json()) as {
          ok?: boolean;
          data?: CmsSnapshot;
        };
        if (!result.data) throw new Error("Content is unavailable.");
        return result.data;
      })
      .then((content) => {
        if (!active) return;
        cachedSnapshot = content;
        setSnapshot(content);
      })
      .catch(() => {
        // Deployment-safe defaults remain visible if the database is
        // temporarily unavailable.
      });

    return () => {
      active = false;
    };
  }, []);

  return snapshot;
}
