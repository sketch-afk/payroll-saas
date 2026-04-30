/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['oracledb']
  },
  images: {
    domains: ['lh3.googleusercontent.com']
  }
}
module.exports = nextConfig
