/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone output for containerized deployments
  output: "standalone",
};

module.exports = nextConfig;
