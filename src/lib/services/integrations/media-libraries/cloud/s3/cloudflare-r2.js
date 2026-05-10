import { get } from 'svelte/store';

import { cmsConfig } from '$lib/services/config';

import { listS3Objects, searchS3Objects, uploadToS3 } from './core';

/**
 * @import {
 * ExternalAsset,
 * MediaLibraryFetchOptions,
 * MediaLibraryService,
 * } from '$lib/types/private';
 * @import { CmsConfig, MediaField, S3MediaLibrary } from '$lib/types/public';
 */

/**
 * Map of Cloudflare R2 jurisdiction identifiers to their endpoint infixes.
 * @type {Record<string, string>}
 * @see https://github.com/sveltia/sveltia-cms/issues/752
 * @see https://developers.cloudflare.com/r2/reference/data-location/#jurisdictional-restrictions
 */
const JURISDICTION_INFIXES = {
  default: '',
  eu: 'eu.',
  fedramp: 'fedramp.',
};

/**
 * Build the Cloudflare R2 S3 API endpoint for the given account and jurisdiction.
 * @param {S3MediaLibrary} libOptions Library options.
 * @returns {string} Endpoint URL.
 */
const getEndpoint = ({ account_id: accountId, jurisdiction = 'default' }) => {
  const infix = JURISDICTION_INFIXES[jurisdiction] ?? '';

  return `https://${accountId}.${infix}r2.cloudflarestorage.com`;
};

/**
 * Get Cloudflare R2 library options from site config.
 * @internal
 * @param {CmsConfig | MediaField} [config] CMS configuration or field configuration.
 * @returns {S3MediaLibrary | false | undefined} Configuration object, or `false` if explicitly
 * disabled.
 */
export const getLibraryOptions = (config = get(cmsConfig)) =>
  config?.media_libraries?.cloudflare_r2 ??
  (config?.media_library?.name === 'cloudflare_r2'
    ? /** @type {S3MediaLibrary} */ (config?.media_library)
    : undefined);

/**
 * Check if Cloudflare R2 integration is enabled.
 * @param {MediaField} [fieldConfig] Field configuration.
 * @returns {boolean} True if enabled, false otherwise.
 */
export const isEnabled = (fieldConfig) => {
  const options = getLibraryOptions(fieldConfig) ?? getLibraryOptions();

  return !!(options && options.access_key_id && options.bucket && options.account_id);
};

/**
 * List files from Cloudflare R2.
 * @param {MediaLibraryFetchOptions} options Options containing the configuration.
 * @returns {Promise<ExternalAsset[]>} Assets.
 */
export const list = async (options) => {
  const { fieldConfig } = options;
  const libOptions = getLibraryOptions(fieldConfig) ?? getLibraryOptions();

  if (!libOptions) {
    return Promise.reject(new Error('Cloudflare R2 configuration is not available'));
  }

  // R2 uses auto region
  const config = {
    ...libOptions,
    region: 'auto',
    endpoint: getEndpoint(libOptions),
  };

  return listS3Objects(config, options);
};

/**
 * Search files in Cloudflare R2.
 * @param {string} query Search query.
 * @param {MediaLibraryFetchOptions} options Options containing the configuration.
 * @returns {Promise<ExternalAsset[]>} Assets.
 */
export const search = async (query, options) => {
  const { fieldConfig } = options;
  const libOptions = getLibraryOptions(fieldConfig) ?? getLibraryOptions();

  if (!libOptions) {
    return Promise.reject(new Error('Cloudflare R2 configuration is not available'));
  }

  // R2 uses auto region
  const config = {
    ...libOptions,
    region: 'auto',
    endpoint: getEndpoint(libOptions),
  };

  return searchS3Objects(query, config, options);
};

/**
 * Upload files to Cloudflare R2.
 * @param {File[]} files Files to upload.
 * @param {MediaLibraryFetchOptions} options Options containing the configuration.
 * @returns {Promise<ExternalAsset[]>} Uploaded assets.
 */
export const upload = async (files, options) => {
  const { fieldConfig } = options;
  const libOptions = getLibraryOptions(fieldConfig) ?? getLibraryOptions();

  if (!libOptions) {
    return Promise.reject(new Error('Cloudflare R2 configuration is not available'));
  }

  // R2 uses auto region
  const config = {
    ...libOptions,
    region: 'auto',
    endpoint: getEndpoint(libOptions),
  };

  return uploadToS3(files, config, options);
};

/**
 * Cloudflare R2 media library service integration.
 * @type {MediaLibraryService}
 */
export default {
  serviceType: 'cloud_storage',
  serviceId: 'cloudflare_r2',
  serviceLabel: 'Cloudflare R2',
  serviceURL: 'https://www.cloudflare.com/developer-platform/r2/',
  showServiceLink: true,
  hotlinking: true,
  authType: 'api_key',
  developerURL: 'https://developers.cloudflare.com/r2/',
  apiKeyURL: 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens',
  apiKeyPattern: /^[A-Za-z0-9/+=]{40,}$/,
  isEnabled,
  list,
  search,
  upload,
};
