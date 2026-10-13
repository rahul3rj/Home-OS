/**
 * Metro configuration.
 *
 * The only thing this changes is WebAssembly support, which `expo-sqlite` needs
 * on web. iOS, Android and Expo Go are unaffected.
 *
 * Why it exists: a production web export works without it because
 * `expo-sqlite/localStorage/install` is documented as a no-op on web and gets
 * dropped from the bundle. Metro does not tree-shake in dev, so the same import
 * is resolved eagerly and `expo start --web` fails to build. Handling `.wasm`
 * plus the cross-origin isolation headers fixes dev only.
 *
 * The app is mobile-first; this exists so web is usable for quick visual checks,
 * not because web is a target.
 *
 * Docs: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/#web-setup
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

// WebAssembly instantiation needs SharedArrayBuffer, which needs these headers.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};

module.exports = config;
