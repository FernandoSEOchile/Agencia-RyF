/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `standalone` empaqueta solo lo que la app necesita para correr, en vez de
  // subir node_modules entero al servidor. La imagen baja de ~1 GB a ~200 MB.
  output: "standalone",
};

module.exports = nextConfig;
