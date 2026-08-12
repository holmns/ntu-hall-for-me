import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Listing photos ride along in the post form's multipart body. The
      // browser caps each one at ~700KB and the action refuses more than six,
      // so this is the worst realistic case plus multipart overhead.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
