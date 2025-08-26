/**
 * Mapping of deprecation warnings that have been issued once. This prevents flooding the console
 * with repeated warnings.
 * @type {Record<string, boolean>}
 */
const warnedOnceMap = {
  yaml_quote: false,
  uuid_read_only: false,
};

/**
 * Deprecation warning messages.
 * @type {Record<string, string>}
 */
const warningMessages = {
  yaml_quote:
    'The `yaml_quote` collection option is deprecated and will be removed in Sveltia CMS 1.0. ' +
    'Use the global `output.yaml.quote` option instead. ' +
    'https://github.com/sveltia/sveltia-cms#controlling-data-output',
  uuid_read_only:
    'The `read_only` option for the UUID widget is deprecated and will be removed in Sveltia CMS ' +
    '1.0. Use the `readonly` option instead.',
};

/**
 * Issue a deprecation warning if it hasn’t been issued yet.
 * @param {string} key Key of the warning to issue.
 * @param {string} [message] Custom message to display instead of the default one.
 */
export const warnDeprecation = (key, message) => {
  // Skip during tests
  if (import.meta.env.VITEST) {
    return;
  }

  if (!warnedOnceMap[key]) {
    // eslint-disable-next-line no-console
    console.warn(message ?? warningMessages[key]);
    warnedOnceMap[key] = true;
  }
};
