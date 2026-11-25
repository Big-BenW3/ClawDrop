/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The SDK is TypeScript source in the workspace, not a built package.
  transpilePackages: ["@clawdrop/sdk"],
  // The repo root is also a Rust/Anchor workspace; keep Next's file tracing inside the app.
  outputFileTracingRoot: new URL(".", import.meta.url).pathname,
};
export default nextConfig;
