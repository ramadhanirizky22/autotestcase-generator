/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Playwright pulls native binaries; mark as external so Next.js
  // doesn't try to bundle it. (Next 14 key.)
  experimental: {
    serverComponentsExternalPackages: ["playwright", "playwright-core", "exceljs"],
  },
};

module.exports = nextConfig;
