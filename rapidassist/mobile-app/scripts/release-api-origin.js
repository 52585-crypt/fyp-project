function validateReleaseApiOrigin(value) {
  if (!value?.trim()) {
    throw new Error('EXPO_PUBLIC_API_URL is required for release builds. Set it to the deployed staging or production HTTPS API origin.');
  }

  const message = 'EXPO_PUBLIC_API_URL must be a deployed HTTPS origin without credentials, a path, query, or fragment for release builds.';
  const origin = value.trim();
  // Require the original string to be an origin before URL parsing can normalize it.
  if (!/^https:\/\/[^/\\?#\s]+\/?$/i.test(origin)) throw new Error(message);

  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(message);
  }

  const hostname = url.hostname.replace(/\.$/, '');
  if (
    url.username || url.password || origin.includes('@') ||
    hostname === 'localhost' || hostname.endsWith('.localhost') ||
    /^(127\.|\[::ffff:7f)/.test(hostname) ||
    ['10.0.2.2', '10.0.3.2', '0.0.0.0', '[::]', '[::1]'].includes(hostname)
  ) {
    throw new Error(message);
  }
}

module.exports = { validateReleaseApiOrigin };
