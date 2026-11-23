const path = require("node:path");

const expoRoot = path.dirname(require.resolve("expo/package.json"));
const upstreamTransformer = require(path.join(
  expoRoot,
  "node_modules/@expo/metro-config/build/babel-transformer.js"
));

const MAPLIBRE_ENTRY = `${path.sep}maplibre-gl${path.sep}dist${path.sep}maplibre-gl.mjs`;
const WEB_LOCATION_EXPRESSION = '(typeof location !== "undefined" ? location.href : "")';

module.exports.transform = function transform(args) {
  const src = args.options?.platform === "web" && args.filename.endsWith(MAPLIBRE_ENTRY)
    ? args.src.replace(/\bimport\.meta\.url\b/g, WEB_LOCATION_EXPRESSION)
    : args.src;
  return upstreamTransformer.transform({ ...args, src });
};
