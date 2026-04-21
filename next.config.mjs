const basePath = process.env.BASE_PATH && process.env.BASE_PATH !== '/'
  ? process.env.BASE_PATH.replace(/\/$/, '')
  : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  // Allow access from any host (Tailscale IPs, LAN, etc.)
  allowedDevOrigins: ['http://100.92.92.27:3000', 'http://192.168.1.14:3000'],
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
