import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/faq", "/login", "/llms.txt"],
        disallow: ["/dashboard", "/api/", "/status/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
