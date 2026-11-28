import type { MetadataRoute } from "next";

const publicPages = ["/", "/pricing", "/how-we-know", "/territory", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages.map((path) => ({
    url: `https://responsehvac.com${path}`,
  }));
}
