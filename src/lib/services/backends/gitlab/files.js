/* eslint-disable no-await-in-loop */

import { getPathInfo } from '@sveltia/utils/file';
import { fetchLastCommit } from '$lib/services/backends/gitlab/commits';
import {
  repository,
  checkRepositoryAccess,
  fetchDefaultBranchName,
} from '$lib/services/backends/gitlab/repository';
import { fetchAPI, fetchGraphQL } from '$lib/services/backends/shared/api';
import { fetchAndParseFiles } from '$lib/services/backends/shared/fetch';
import { dataLoadedProgress } from '$lib/services/contents';

/**
 * @import {
 * Asset,
 * BaseFileListItem,
 * BaseFileListItemProps,
 * RepositoryContentsMap,
 * } from '$lib/types/private';
 */

/**
 * @typedef {object} GitLabUserInfo
 * @property {string} [id] GitLab user ID.
 * @property {string} [username] GitLab user username.
 */

/**
 * @typedef {object} GitLabCommit
 * @property {GitLabUserInfo | null} author Commit author’s GitLab user info.
 * @property {string} authorName Commit author’s full name.
 * @property {string} authorEmail Commit author’s email.
 * @property {string} committedDate Committed date.
 */

/**
 * @typedef {object} FetchFileListResponse
 * @property {object} project Project information.
 * @property {object} project.repository Repository information.
 * @property {object} project.repository.tree Tree information.
 * @property {object} project.repository.tree.blobs Blobs information.
 * @property {{ type: string, path: string, sha: string }[]} project.repository.tree.blobs.nodes
 * List of file blobs.
 * @property {object} project.repository.tree.blobs.pageInfo Pagination information.
 * @property {string} project.repository.tree.blobs.pageInfo.endCursor Cursor for the next page.
 * @property {boolean} project.repository.tree.blobs.pageInfo.hasNextPage Whether there are more
 * pages to fetch.
 */

/**
 * @typedef {object} BlobItem
 * @property {string} size Size of the blob in bytes.
 * @property {string} rawTextBlob Raw text content of the blob.
 */

/**
 * @typedef {object} FetchBlobsResponse
 * @property {object} project Project information.
 * @property {object} project.repository Repository information.
 * @property {object} project.repository.blobs Blobs information.
 * @property {BlobItem[]} project.repository.blobs.nodes List of file blobs with their sizes and raw
 * text contents.
 */

/**
 * @typedef {object} FetchCommitsResponse
 * @property {object} project Project information.
 * @property {Record<string, { lastCommit: GitLabCommit }>} project.repository Mapping of file paths
 * to their last commit information.
 */

const FETCH_FILE_LIST_QUERY = `
  query($fullPath: String!, $branch: String!, $cursor: String!) {
    project(fullPath: $fullPath) {
      repository {
        tree(ref: $branch, recursive: true) {
          blobs(after: $cursor) {
            nodes {
              type
              path
              sha
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
      }
    }
  }
`;

/**
 * Fetch the repository’s complete file list, and return it in the canonical format.
 * @returns {Promise<BaseFileListItemProps[]>} File list.
 * @see https://docs.gitlab.com/api/graphql/reference/index.html#repositorytree
 * @see https://stackoverflow.com/questions/18952935/how-to-get-subfolders-and-files-using-gitlab-api
 */
const fetchFileList = async () => {
  /** @type {{ type: string, path: string, sha: string }[]} */
  const blobs = [];
  let cursor = '';

  // Since GitLab has a limit of 100 records per query, use pagination to fetch all the files
  for (;;) {
    const result = /** @type {FetchFileListResponse} */ (
      await fetchGraphQL(FETCH_FILE_LIST_QUERY, { cursor })
    );

    const {
      nodes,
      pageInfo: { endCursor, hasNextPage },
    } = result.project.repository.tree.blobs;

    blobs.push(...nodes);
    cursor = endCursor;

    if (!hasNextPage) {
      break;
    }
  }

  // The `size` is not available here; it will be retrieved in `fetchFileContents` below
  return blobs
    .filter(({ type }) => type === 'blob')
    .map(({ path, sha }) => ({ path, sha, size: 0, name: getPathInfo(path).basename }));
};

const FETCH_BLOBS_QUERY = `
  query($fullPath: String!, $branch: String!, $paths: [String!]!) {
    project(fullPath: $fullPath) {
      repository {
        blobs(ref: $branch, paths: $paths) {
          nodes {
            size
            rawTextBlob
          }
        }
      }
    }
  }
`;

/**
 * Fetch the blobs for the given file paths. This function retrieves the raw text contents of files
 * in the repository using the GitLab GraphQL API. It handles pagination by fetching a fixed number
 * of paths at a time, ensuring that the complexity score of the query does not exceed the limit. It
 * also updates the `dataLoadedProgress` store to reflect the progress of data loading.
 * @param {string[]} allPaths List of all file paths to fetch.
 * @returns {Promise<BlobItem[]>} Fetched blobs with their sizes and raw text contents.
 * @see https://docs.gitlab.com/api/graphql/reference/#repositoryblob
 * @see https://docs.gitlab.com/api/graphql/reference/#tree
 * @see https://forum.gitlab.com/t/graphql-api-read-raw-file/35389
 * @see https://docs.gitlab.com/api/graphql/#limits
 */
const fetchBlobs = async (allPaths) => {
  const paths = [...allPaths];
  /** @type {BlobItem[]} */
  const blobs = [];

  dataLoadedProgress.set(0);

  // Fetch all the text contents with the GraphQL API. Pagination would fail if `paths` becomes too
  // long, so we just use a fixed number of paths to iterate. The complexity score of this query is
  // 15 + (2 * node size) so 100 paths = 215 complexity, where the max number of records is 100 and
  // max complexity is 250 or 300
  for (;;) {
    const currentPaths = paths.splice(0, 100);

    const result = /** @type {FetchBlobsResponse} */ (
      await fetchGraphQL(FETCH_BLOBS_QUERY, { paths: currentPaths })
    );

    blobs.push(...result.project.repository.blobs.nodes);
    dataLoadedProgress.set(Math.ceil(((allPaths.length - paths.length) / allPaths.length) * 100));

    if (!paths.length) {
      break;
    }
  }

  dataLoadedProgress.set(undefined);

  return blobs;
};

/**
 * Generate the inner GraphQL query for fetching the last commit information of a file at the
 * specified path.
 * @param {string} path File path.
 * @param {number} index Index of the path in the current batch.
 * @returns {string} GraphQL query string for fetching the last commit information of the file at
 * the specified path.
 */
const getFetchCommitsInnerQuery = (path, index) => `
  tree_${index}: tree(ref: $branch, path: ${JSON.stringify(path)}) {
    lastCommit {
      author {
        id
        username
      }
      authorName
      authorEmail
      committedDate
    }
  }
`;

/**
 * Fetch commit information for each file in the repository. This function retrieves the last commit
 * information for each file path using the GitLab GraphQL API. It handles pagination by fetching a
 * fixed number of paths at a time, ensuring that the complexity score of the query does not exceed
 * the limit. The commit information includes the author’s GitLab user info, name, email, and
 * committed date.
 * @param {string[]} allPaths List of all file paths to fetch.
 * @returns {Promise<GitLabCommit[]>} Fetched commit information for each file.
 */
const fetchCommits = async (allPaths) => {
  const paths = [...allPaths];
  /** @type {GitLabCommit[]} */
  const commits = [];

  // The complexity score of this query is 5 + (18 * node size) so 13 paths = 239 complexity
  for (;;) {
    const currentPaths = paths.splice(0, 13);

    const query = `
      query($fullPath: String!, $branch: String!) {
        project(fullPath: $fullPath) {
          repository {
            ${currentPaths.map(getFetchCommitsInnerQuery).join('')}
          }
        }
      }
    `;

    const result = /** @type {FetchCommitsResponse} */ (await fetchGraphQL(query));

    commits.push(...Object.values(result.project.repository).map(({ lastCommit }) => lastCommit));

    if (!paths.length) {
      break;
    }
  }

  return commits;
};

/**
 * Parse the file contents from the API response.
 * @param {BaseFileListItem[]} fetchingFiles Base file list.
 * @param {BlobItem[]} blobs File sizes and raw text blobs.
 * @param {GitLabCommit[]} commits Commit information for each file.
 * @returns {Promise<RepositoryContentsMap>} Parsed file contents map.
 */
const parseFileContents = async (fetchingFiles, blobs, commits) => {
  const entries = fetchingFiles.map(({ path, sha }, index) => {
    const { size, rawTextBlob } = blobs[index];
    const commit = commits[index];

    const data = {
      sha,
      size: Number(size),
      text: rawTextBlob,
      meta: {},
    };

    if (commit) {
      const { author, authorName, authorEmail, committedDate } = commit;
      const { id, username } = author ?? {};
      const idMatcher = id?.match(/\d+/);

      data.meta = {
        commitAuthor: {
          name: authorName,
          email: authorEmail,
          id: idMatcher ? Number(idMatcher[0]) : undefined,
          login: username,
        },
        committedDate: new Date(committedDate),
      };
    }

    return [path, data];
  });

  return Object.fromEntries(entries);
};

/**
 * Fetch the metadata of entry/asset files as well as text file contents.
 * @param {BaseFileListItem[]} fetchingFiles Base file list.
 * @returns {Promise<RepositoryContentsMap>} Fetched contents map.
 */
const fetchFileContents = async (fetchingFiles) => {
  const allPaths = fetchingFiles.map(({ path }) => path);
  const blobs = await fetchBlobs(allPaths);
  // Fetch commit info only when there aren’t many files, because it’s costly
  const commits = allPaths.length < 100 ? await fetchCommits(allPaths) : [];

  return parseFileContents(fetchingFiles, blobs, commits);
};

/**
 * Fetch file list from the backend service, download/parse all the entry files, then cache them in
 * the {@link allEntries} and {@link allAssets} stores.
 */
export const fetchFiles = async () => {
  await checkRepositoryAccess();

  await fetchAndParseFiles({
    repository,
    fetchDefaultBranchName,
    fetchLastCommit,
    fetchFileList,
    fetchFileContents,
  });
};

/**
 * Fetch an asset as a Blob via the API. We use the `lfs` query parameter to ensure that GitLab
 * returns the file content even if it’s tracked by Git LFS.
 * @param {Asset} asset Asset to retrieve the file content.
 * @returns {Promise<Blob>} Blob data.
 * @see https://docs.gitlab.com/api/repository_files/#get-raw-file-from-repository
 */
export const fetchBlob = async (asset) => {
  const { owner, repo, branch = '' } = repository;
  const { path } = asset;

  return /** @type {Promise<Blob>} */ (
    fetchAPI(
      `/projects/${encodeURIComponent(`${owner}/${repo}`)}/repository/files` +
        `/${encodeURIComponent(path)}/raw?lfs=true&ref=${encodeURIComponent(branch)}`,
      { responseType: 'blob' },
    )
  );
};
