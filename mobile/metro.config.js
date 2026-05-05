// metro.config.js
//
// Default Expo Metro config. Customize here if you need symlinks
// (npm workspaces / pnpm), SVG transformer, or extra asset extensions.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
