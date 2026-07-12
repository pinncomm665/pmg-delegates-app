/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Client router cache: re-showing a tab visited in the last 30s renders
  // instantly from cache (dynamic pages default to 0 = refetch every click).
  experimental: {
    staleTimes: { dynamic: 30 },
  },
};
export default nextConfig;
