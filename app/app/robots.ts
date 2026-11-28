import type { MetadataRoute } from "next";

const privatePaths = [
  "/admin",
  "/api",
  "/auth",
  "/billing",
  "/checkout",
  "/dashboard",
  "/direct-mail",
  "/forgot-password",
  "/login",
  "/onboarding",
  "/reset-password",
  "/settings",
  "/signup",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "Googlebot", allow: "/", disallow: privatePaths },
      { userAgent: "Bingbot", allow: "/", disallow: privatePaths },
      { userAgent: "OAI-SearchBot", allow: "/", disallow: privatePaths },
      { userAgent: "*", allow: "/", disallow: privatePaths },
    ],
    sitemap: "https://responsehvac.com/sitemap.xml",
  };
}
