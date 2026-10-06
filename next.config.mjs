const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // jsdom is loaded at runtime by the found-content action; bundling it breaks its dynamic requires.
    serverComponentsExternalPackages: ["jsdom"],
    // Uploads travel through a Server Action. Vercel caps bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};
export default nextConfig;
