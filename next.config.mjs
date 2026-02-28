/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow access from any host (Tailscale IPs, LAN, etc.)
  allowedDevOrigins: ['http://100.92.92.27:3000', 'http://192.168.1.14:3000'],
};

export default nextConfig;
