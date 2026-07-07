const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app lives in a subdirectory of the pm-intelligence-agent repo, which has its own
  // root-level package-lock.json for the unrelated Node library — without this, Next.js guesses
  // the wrong workspace root and warns on every build.
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
