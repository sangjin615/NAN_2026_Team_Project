const SENSITIVE_CONFIG_KEYS = /(?:api[-_]?key|authorization|bearer|token|secret|password|requestHeaders)/i;

export function assertPublicGenerationConfig(config) {
  const sensitiveKeys = Object.keys(config || {}).filter((key) => SENSITIVE_CONFIG_KEYS.test(key));
  if (sensitiveKeys.length) throw new Error(`generation API secrets must not be stored in api-config.json: ${sensitiveKeys.join(', ')}`);
  return config;
}

export function resolveGenerationApiConfig(publicConfig, runtimeConfig = globalThis.__NAN_GENERATION_API_CONFIG__) {
  assertPublicGenerationConfig(publicConfig);
  const runtime = runtimeConfig && typeof runtimeConfig === 'object' ? runtimeConfig : {};
  return { ...publicConfig, ...runtime };
}
