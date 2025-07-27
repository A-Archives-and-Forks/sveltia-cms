import { get } from 'svelte/store';

import { siteConfig } from '$lib/services/config';
import { getCollectionLabel } from '$lib/services/contents/collection';
import { user } from '$lib/services/user';

/**
 * @import {
 * CommitOptions,
 * FileChange,
 * InternalSiteConfig,
 * User,
 * } from '$lib/types/private';
 */

/**
 * Default commit message templates.
 * @see https://decapcms.org/docs/configuration-options/#commit-message-templates
 */
const DEFAULT_COMMIT_MESSAGES = {
  create: 'Create {{collection}} “{{slug}}”',
  update: 'Update {{collection}} “{{slug}}”',
  delete: 'Delete {{collection}} “{{slug}}”',
  uploadMedia: 'Upload “{{path}}”',
  deleteMedia: 'Delete “{{path}}”',
  openAuthoring: '{{message}}',
};

/**
 * Create a Git commit message.
 * @param {FileChange[]} changes File changes to be saved.
 * @param {CommitOptions} options Commit options.
 * @returns {string} Formatted message.
 */
export const createCommitMessage = (
  changes,
  { commitType = 'update', collection, skipCI = undefined },
) => {
  const {
    backend: {
      commit_messages: customCommitMessages = {},
      automatic_deployments: autoDeployEnabled,
    },
  } = /** @type {InternalSiteConfig} */ (get(siteConfig));

  const { login = '', name = '' } = /** @type {User} */ (get(user));
  const [firstSlug = ''] = changes.map((item) => item.slug).filter(Boolean);
  const [firstPath, ...remainingPaths] = changes.map(({ path }) => path);
  const collectionLabel = collection ? getCollectionLabel(collection, { useSingular: true }) : '';
  // @ts-ignore
  let message = customCommitMessages[commitType] || DEFAULT_COMMIT_MESSAGES[commitType] || '';

  if (['create', 'update', 'delete'].includes(commitType)) {
    message = message
      .replaceAll('{{slug}}', firstSlug)
      .replaceAll('{{collection}}', collectionLabel)
      .replaceAll('{{path}}', firstPath)
      .replaceAll('{{author-login}}', login)
      .replaceAll('{{author-name}}', name);
  }

  if (['uploadMedia', 'deleteMedia'].includes(commitType)) {
    message = message
      .replaceAll('{{path}}', firstPath)
      .replaceAll('{{author-login}}', login)
      .replaceAll('{{author-name}}', name);

    if (remainingPaths.length) {
      message += ` +${remainingPaths.length}`;
    }
  }

  if (['openAuthoring'].includes(commitType)) {
    message = message
      .replaceAll('{{message}}', commitType)
      .replaceAll('{{author-login}}', login)
      .replaceAll('{{author-name}}', name);
  }

  // If requested, disable automatic deployments by using the standard `[skip ci]` prefix supported
  // by major CI/CD providers, including GitHub Actions and Cloudflare Pages. To avoid unexpected
  // data retention, deployments for deletion commits are not skipped.
  // https://docs.github.com/en/actions/managing-workflow-runs/skipping-workflow-runs
  // https://docs.gitlab.com/ee/ci/pipelines/#skip-a-pipeline
  // https://developers.cloudflare.com/pages/platform/branch-build-controls/#skip-builds
  if (
    !['delete', 'deleteMedia'].includes(commitType) &&
    (skipCI === undefined ? autoDeployEnabled === false : skipCI === true)
  ) {
    message = `[skip ci] ${message}`;
  }

  return message;
};
