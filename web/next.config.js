const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app lives in a subdirectory of the pm-intelligence-agent repo. The API routes import the
  // pipeline library at the repo root (../src/**), so the file-tracing root must be the repo root,
  // not web/ — otherwise those files (and the deps they pull in) get treated as out-of-scope and
  // dropped from the deployed serverless functions, so the imports 404 at runtime on Vercel.
  outputFileTracingRoot: path.join(__dirname, '..'),
};

module.exports = nextConfig;
