/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Shared UI/lib package is shipped as TypeScript source — compile it with the app.
  transpilePackages: ["@pmg/team-ui"],
  // Client router cache: re-showing a tab visited in the last 30s renders
  // instantly from cache (dynamic pages default to 0 = refetch every click).
  experimental: {
    staleTimes: { dynamic: 30 },
  },
};
export default nextConfig;
