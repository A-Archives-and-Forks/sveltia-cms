import { parseFields } from '$lib/services/config/parser/fields';

/**
 * @import { CollectionFile, FileCollection, SiteConfig } from '$lib/types/public';
 * @import { ConfigParserCollectors } from '$lib/types/private';
 */

/**
 * Parse and validate a single collection file configuration.
 * @param {object} context Context.
 * @param {SiteConfig} context.siteConfig Raw site configuration.
 * @param {FileCollection} context.collection Collection config to parse.
 * @param {CollectionFile} context.collectionFile File config to parse.
 * @param {ConfigParserCollectors} collectors Collectors.
 */
export const parseCollectionFile = ({ siteConfig, collection, collectionFile }, collectors) => {
  const { fields } = collectionFile;

  parseFields(fields, { siteConfig, collection, collectionFile }, collectors);
};

/**
 * Parse and validate multiple collection file configurations.
 * @param {object} context Context.
 * @param {SiteConfig} context.siteConfig Raw site configuration.
 * @param {FileCollection} context.collection Collection config to parse.
 * @param {ConfigParserCollectors} collectors Collectors.
 */
export const parseCollectionFiles = ({ siteConfig, collection }, collectors) => {
  const { files } = collection;

  files.forEach((collectionFile) => {
    parseCollectionFile({ siteConfig, collection, collectionFile }, collectors);
  });
};
