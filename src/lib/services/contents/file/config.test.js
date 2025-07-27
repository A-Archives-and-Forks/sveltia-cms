import { describe, expect, test } from 'vitest';

import {
  customFileFormats,
  detectFileExtension,
  detectFileFormat,
  getEntryPathRegEx,
  getFileConfig,
  getFrontMatterDelimiters,
} from '$lib/services/contents/file/config';

/**
 * @import { InternalI18nOptions } from '$lib/types/private';
 */

describe('Test detectFileExtension()', () => {
  test('returns custom extension from format', () => {
    // Mock custom file format
    customFileFormats.custom = { extension: 'custom' };

    expect(detectFileExtension({ format: /** @type {any} */ ('custom') })).toBe('custom');

    // Clean up
    delete customFileFormats.custom;
  });

  test('returns provided extension', () => {
    expect(detectFileExtension({ extension: 'txt' })).toBe('txt');
  });

  test('returns yml for yaml format', () => {
    expect(detectFileExtension({ format: 'yaml' })).toBe('yml');
    expect(detectFileExtension({ format: 'yml' })).toBe('yml');
  });

  test('returns toml for toml format', () => {
    expect(detectFileExtension({ format: 'toml' })).toBe('toml');
  });

  test('returns json for json format', () => {
    expect(detectFileExtension({ format: 'json' })).toBe('json');
  });

  test('returns md as default', () => {
    expect(detectFileExtension({})).toBe('md');
    expect(detectFileExtension({ format: /** @type {any} */ ('unknown') })).toBe('md');
  });

  test('prioritizes custom extension over provided extension', () => {
    customFileFormats.custom = { extension: 'custom' };

    expect(detectFileExtension({ extension: 'txt', format: /** @type {any} */ ('custom') })).toBe(
      'custom',
    );

    // Clean up
    delete customFileFormats.custom;
  });

  test('prioritizes provided extension over format', () => {
    expect(detectFileExtension({ extension: 'txt', format: 'yaml' })).toBe('txt');
  });
});

describe('Test detectFileFormat()', () => {
  test('returns provided format', () => {
    expect(detectFileFormat({ extension: 'md', format: 'json' })).toBe('json');
    expect(
      detectFileFormat({ extension: 'md', format: /** @type {any} */ ('custom-format') }),
    ).toBe('custom-format');
  });

  test('detects yaml from extension', () => {
    expect(detectFileFormat({ extension: 'yaml' })).toBe('yaml');
    expect(detectFileFormat({ extension: 'yml' })).toBe('yaml');
  });

  test('detects toml from extension', () => {
    expect(detectFileFormat({ extension: 'toml' })).toBe('toml');
  });

  test('detects json from extension', () => {
    expect(detectFileFormat({ extension: 'json' })).toBe('json');
  });

  test('detects frontmatter from markdown extensions', () => {
    const markdownExtensions = ['md', 'mkd', 'mkdn', 'mdwn', 'mdown', 'markdown'];

    markdownExtensions.forEach((ext) => {
      expect(detectFileFormat({ extension: ext })).toBe('frontmatter');
    });
  });

  test('returns yaml-frontmatter as default', () => {
    expect(detectFileFormat({ extension: 'txt' })).toBe('yaml-frontmatter');
    expect(detectFileFormat({ extension: 'unknown' })).toBe('yaml-frontmatter');
  });
});

describe('Test getEntryPathRegEx()', () => {
  const baseI18nOptions = {
    i18nEnabled: false,
    allLocales: ['en', 'fr'],
    initialLocales: ['en', 'fr'],
    defaultLocale: 'en',
    structure: /** @type {const} */ ('single_file'),
    omitDefaultLocaleFromFileName: false,
    canonicalSlug: { key: 'translationKey', value: '{{slug}}' },
  };

  test('generates regex without i18n', () => {
    const _i18n = {
      ...baseI18nOptions,
      structureMap: {
        i18nSingleFile: false,
        i18nMultiFile: false,
        i18nMultiFolder: false,
        i18nRootMultiFolder: false,
      },
    };

    const regex = getEntryPathRegEx({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      _i18n,
    });

    expect(regex.source).toBe('^content\\/posts\\/(?<subPath>[^/]+?)\\.md$');
    expect('content/posts/my-post.md'.match(regex)?.groups?.subPath).toBe('my-post');
  });

  test('generates regex with subPath template', () => {
    const _i18n = {
      ...baseI18nOptions,
      structureMap: {
        i18nSingleFile: false,
        i18nMultiFile: false,
        i18nMultiFolder: false,
        i18nRootMultiFolder: false,
      },
    };

    const regex = getEntryPathRegEx({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      subPath: '{{year}}/{{slug}}',
      _i18n,
    });

    expect(regex.source).toBe('^content\\/posts\\/(?<subPath>[^/]+?\\/[^/]+?)\\.md$');
    expect('content/posts/2023/my-post.md'.match(regex)?.groups?.subPath).toBe('2023/my-post');
  });

  test('generates regex with index file name', () => {
    const _i18n = {
      ...baseI18nOptions,
      structureMap: {
        i18nSingleFile: false,
        i18nMultiFile: false,
        i18nMultiFolder: false,
        i18nRootMultiFolder: false,
      },
    };

    const regex = getEntryPathRegEx({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      subPath: '{{slug}}/index',
      indexFileName: '_index',
      _i18n,
    });

    expect(regex.source).toBe('^content\\/posts\\/(?<subPath>[^/]+?\\/index|_index)\\.md$');
    expect('content/posts/my-post/index.md'.match(regex)?.groups?.subPath).toBe('my-post/index');
    expect('content/posts/_index.md'.match(regex)?.groups?.subPath).toBe('_index');
  });

  test('generates regex with multi-file i18n', () => {
    const _i18n = {
      ...baseI18nOptions,
      structureMap: {
        i18nSingleFile: false,
        i18nMultiFile: true,
        i18nMultiFolder: false,
        i18nRootMultiFolder: false,
      },
    };

    const regex = getEntryPathRegEx({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      _i18n,
    });

    expect(regex.source).toBe('^content\\/posts\\/(?<subPath>[^/]+?)\\.(?<locale>en|fr)\\.md$');
    expect('content/posts/my-post.en.md'.match(regex)?.groups?.locale).toBe('en');
    expect('content/posts/my-post.fr.md'.match(regex)?.groups?.locale).toBe('fr');
  });

  test('generates regex with omitDefaultLocaleFromFileName', () => {
    const _i18n = {
      ...baseI18nOptions,
      omitDefaultLocaleFromFileName: true,
      structureMap: {
        i18nSingleFile: false,
        i18nMultiFile: true,
        i18nMultiFolder: false,
        i18nRootMultiFolder: false,
      },
    };

    const regex = getEntryPathRegEx({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      _i18n,
    });

    expect(regex.source).toBe('^content\\/posts\\/(?<subPath>[^/]+?)(?:\\.(?<locale>fr))?\\.md$');
    expect('content/posts/my-post.md'.match(regex)?.groups?.locale).toBeUndefined();
    expect('content/posts/my-post.fr.md'.match(regex)?.groups?.locale).toBe('fr');
  });

  test('generates regex with multi-folder i18n', () => {
    const _i18n = {
      ...baseI18nOptions,
      structureMap: {
        i18nSingleFile: false,
        i18nMultiFile: false,
        i18nMultiFolder: true,
        i18nRootMultiFolder: false,
      },
    };

    const regex = getEntryPathRegEx({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      _i18n,
    });

    expect(regex.source).toBe('^content\\/posts\\/(?<locale>en|fr)\\/(?<subPath>[^/]+?)\\.md$');
    expect('content/posts/en/my-post.md'.match(regex)?.groups?.locale).toBe('en');
    expect('content/posts/fr/my-post.md'.match(regex)?.groups?.locale).toBe('fr');
  });

  test('generates regex with root multi-folder i18n', () => {
    const _i18n = {
      ...baseI18nOptions,
      structureMap: {
        i18nSingleFile: false,
        i18nMultiFile: false,
        i18nMultiFolder: false,
        i18nRootMultiFolder: true,
      },
    };

    const regex = getEntryPathRegEx({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      _i18n,
    });

    expect(regex.source).toBe('^(?<locale>en|fr)\\/content\\/posts\\/(?<subPath>[^/]+?)\\.md$');
    expect('en/content/posts/my-post.md'.match(regex)?.groups?.locale).toBe('en');
    expect('fr/content/posts/my-post.md'.match(regex)?.groups?.locale).toBe('fr');
  });

  test('handles empty basePath', () => {
    const _i18n = {
      ...baseI18nOptions,
      structureMap: {
        i18nSingleFile: false,
        i18nMultiFile: false,
        i18nMultiFolder: false,
        i18nRootMultiFolder: false,
      },
    };

    const regex = getEntryPathRegEx({
      extension: 'md',
      format: 'frontmatter',
      basePath: '',
      _i18n,
    });

    expect(regex.source).toBe('^(?<subPath>[^/]+?)\\.md$');
    expect('my-post.md'.match(regex)?.groups?.subPath).toBe('my-post');
  });
});

describe('Test getFrontMatterDelimiters()', () => {
  test('returns custom string delimiter as pair', () => {
    expect(getFrontMatterDelimiters({ format: 'frontmatter', delimiter: '###' })).toEqual([
      '###',
      '###',
    ]);
  });

  test('returns custom array delimiter', () => {
    expect(getFrontMatterDelimiters({ format: 'frontmatter', delimiter: ['<<<', '>>>'] })).toEqual([
      '<<<',
      '>>>',
    ]);
  });

  test('returns JSON delimiters for json-frontmatter', () => {
    expect(getFrontMatterDelimiters({ format: 'json-frontmatter' })).toEqual(['{', '}']);
  });

  test('returns TOML delimiters for toml-frontmatter', () => {
    expect(getFrontMatterDelimiters({ format: 'toml-frontmatter' })).toEqual(['+++', '+++']);
  });

  test('returns YAML delimiters for yaml-frontmatter', () => {
    expect(getFrontMatterDelimiters({ format: 'yaml-frontmatter' })).toEqual(['---', '---']);
  });

  test('returns undefined for unknown format', () => {
    expect(getFrontMatterDelimiters({ format: /** @type {any} */ ('unknown') })).toBeUndefined();
  });

  test('handles empty string delimiter', () => {
    expect(getFrontMatterDelimiters({ format: 'frontmatter', delimiter: '' })).toBeUndefined();
  });

  test('handles whitespace-only delimiter', () => {
    expect(getFrontMatterDelimiters({ format: 'frontmatter', delimiter: '   ' })).toBeUndefined();
  });

  test('handles array with wrong length', () => {
    expect(
      getFrontMatterDelimiters({ format: 'frontmatter', delimiter: ['only-one'] }),
    ).toBeUndefined();
    expect(
      getFrontMatterDelimiters({ format: 'frontmatter', delimiter: ['one', 'two', 'three'] }),
    ).toBeUndefined();
  });
});

describe('Test getFileConfig()', () => {
  const rawFolderCollection = {
    name: 'posts',
    folder: '/content/posts',
  };

  const rawFileCollection = {
    name: 'data',
    files: [],
  };

  const rawFileCollectionFrontMatterFile = {
    name: 'members',
    file: 'data/members.md',
    fields: [],
  };

  const rawFileCollectionYamlFile = {
    name: 'members',
    file: 'data/members.yml',
    fields: [],
  };

  const rawFileCollectionJsonFile = {
    name: 'members',
    file: 'data/members.json',
    fields: [],
  };

  /** @type {InternalI18nOptions} */
  const i18nDisabled = {
    i18nEnabled: false,
    allLocales: ['_default'],
    initialLocales: ['_default'],
    defaultLocale: '_default',
    structure: 'single_file',
    structureMap: {
      i18nSingleFile: false,
      i18nMultiFile: false,
      i18nMultiFolder: false,
      i18nRootMultiFolder: false,
    },
    canonicalSlug: { key: 'translationKey', value: '{{slug}}' },
    omitDefaultLocaleFromFileName: false,
  };

  /** @type {InternalI18nOptions} */
  const i18nSingleFile = {
    i18nEnabled: false,
    allLocales: ['en', 'fr'],
    initialLocales: ['en', 'fr'],
    defaultLocale: 'en',
    structure: 'single_file',
    structureMap: {
      i18nSingleFile: true,
      i18nMultiFile: false,
      i18nMultiFolder: false,
      i18nRootMultiFolder: false,
    },
    canonicalSlug: { key: 'translationKey', value: '{{slug}}' },
    omitDefaultLocaleFromFileName: false,
  };

  /** @type {InternalI18nOptions} */
  const i18nMultiFile = {
    i18nEnabled: true,
    allLocales: ['en', 'fr'],
    initialLocales: ['en', 'fr'],
    defaultLocale: 'en',
    structure: 'multiple_files',
    structureMap: {
      i18nSingleFile: false,
      i18nMultiFile: true,
      i18nMultiFolder: false,
      i18nRootMultiFolder: false,
    },
    canonicalSlug: { key: 'translationKey', value: '{{slug}}' },
    omitDefaultLocaleFromFileName: false,
  };

  /** @type {InternalI18nOptions} */
  const i18nMultiFolder = {
    i18nEnabled: true,
    allLocales: ['en', 'fr'],
    initialLocales: ['en', 'fr'],
    defaultLocale: 'en',
    structure: 'multiple_folders',
    structureMap: {
      i18nSingleFile: false,
      i18nMultiFile: false,
      i18nMultiFolder: true,
      i18nRootMultiFolder: false,
    },
    canonicalSlug: { key: 'translationKey', value: '{{slug}}' },
    omitDefaultLocaleFromFileName: false,
  };

  /** @type {InternalI18nOptions} */
  const i18nRootMultiFolder = {
    i18nEnabled: true,
    allLocales: ['en', 'fr'],
    initialLocales: ['en', 'fr'],
    defaultLocale: 'en',
    structure: 'multiple_folders_i18n_root',
    structureMap: {
      i18nSingleFile: false,
      i18nMultiFile: false,
      i18nMultiFolder: false,
      i18nRootMultiFolder: true,
    },
    canonicalSlug: { key: 'translationKey', value: '{{slug}}' },
    omitDefaultLocaleFromFileName: false,
  };

  test('entry collection without i18n', () => {
    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
        },
        _i18n: i18nDisabled,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?)\.md$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          path: '{{slug}}/index',
        },
        _i18n: i18nDisabled,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      subPath: '{{slug}}/index',
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?\/index)\.md$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          path: '{{slug}}/index',
          format: 'yaml-frontmatter',
        },
        _i18n: i18nDisabled,
      }),
    ).toEqual({
      extension: 'md',
      format: 'yaml-frontmatter',
      basePath: 'content/posts',
      subPath: '{{slug}}/index',
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?\/index)\.md$/,
      fullPath: undefined,
      fmDelimiters: ['---', '---'],
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          extension: 'yml',
          yaml_quote: true,
        },
        _i18n: i18nDisabled,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?)\.yml$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: true,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          extension: 'json',
        },
        _i18n: i18nDisabled,
      }),
    ).toEqual({
      extension: 'json',
      format: 'json',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?)\.json$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });
  });

  test('entry collection with single-file i18n', () => {
    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
        },
        _i18n: i18nSingleFile,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?)\.md$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          path: '{{slug}}/index',
        },
        _i18n: i18nSingleFile,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      subPath: '{{slug}}/index',
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?\/index)\.md$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          path: '{{slug}}/index',
          format: 'yaml-frontmatter',
        },
        _i18n: i18nSingleFile,
      }),
    ).toEqual({
      extension: 'md',
      format: 'yaml-frontmatter',
      basePath: 'content/posts',
      subPath: '{{slug}}/index',
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?\/index)\.md$/,
      fullPath: undefined,
      fmDelimiters: ['---', '---'],
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          extension: 'yml',
          yaml_quote: true,
        },
        _i18n: i18nSingleFile,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?)\.yml$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: true,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          extension: 'json',
        },
        _i18n: i18nSingleFile,
      }),
    ).toEqual({
      extension: 'json',
      format: 'json',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?)\.json$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });
  });

  test('entry collection with multi-file i18n', () => {
    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?)\.(?<locale>en|fr)\.md$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          path: '{{slug}}/index',
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      subPath: '{{slug}}/index',
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?\/index)\.(?<locale>en|fr)\.md$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          path: '{{slug}}/index',
          format: 'yaml-frontmatter',
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'md',
      format: 'yaml-frontmatter',
      basePath: 'content/posts',
      subPath: '{{slug}}/index',
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?\/index)\.(?<locale>en|fr)\.md$/,
      fullPath: undefined,
      fmDelimiters: ['---', '---'],
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          extension: 'yml',
          yaml_quote: true,
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?)\.(?<locale>en|fr)\.yml$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: true,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          extension: 'json',
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'json',
      format: 'json',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^content\/posts\/(?<subPath>[^/]+?)\.(?<locale>en|fr)\.json$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });
  });

  test('entry collection with multi-folder i18n', () => {
    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
        },
        _i18n: i18nMultiFolder,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^content\/posts\/(?<locale>en|fr)\/(?<subPath>[^/]+?)\.md$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          path: '{{slug}}/index',
        },
        _i18n: i18nMultiFolder,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      subPath: '{{slug}}/index',
      fullPathRegEx: /^content\/posts\/(?<locale>en|fr)\/(?<subPath>[^/]+?\/index)\.md$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          path: '{{slug}}/index',
          format: 'yaml-frontmatter',
        },
        _i18n: i18nMultiFolder,
      }),
    ).toEqual({
      extension: 'md',
      format: 'yaml-frontmatter',
      basePath: 'content/posts',
      subPath: '{{slug}}/index',
      fullPathRegEx: /^content\/posts\/(?<locale>en|fr)\/(?<subPath>[^/]+?\/index)\.md$/,
      fullPath: undefined,
      fmDelimiters: ['---', '---'],
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          extension: 'yml',
          yaml_quote: true,
        },
        _i18n: i18nMultiFolder,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^content\/posts\/(?<locale>en|fr)\/(?<subPath>[^/]+?)\.yml$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: true,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          extension: 'json',
        },
        _i18n: i18nMultiFolder,
      }),
    ).toEqual({
      extension: 'json',
      format: 'json',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^content\/posts\/(?<locale>en|fr)\/(?<subPath>[^/]+?)\.json$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });
  });

  test('entry collection with multi-folder-at-root i18n', () => {
    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
        },
        _i18n: i18nRootMultiFolder,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^(?<locale>en|fr)\/content\/posts\/(?<subPath>[^/]+?)\.md$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          path: '{{slug}}/index',
        },
        _i18n: i18nRootMultiFolder,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: 'content/posts',
      subPath: '{{slug}}/index',
      fullPathRegEx: /^(?<locale>en|fr)\/content\/posts\/(?<subPath>[^/]+?\/index)\.md$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          path: '{{slug}}/index',
          format: 'yaml-frontmatter',
        },
        _i18n: i18nRootMultiFolder,
      }),
    ).toEqual({
      extension: 'md',
      format: 'yaml-frontmatter',
      basePath: 'content/posts',
      subPath: '{{slug}}/index',
      fullPathRegEx: /^(?<locale>en|fr)\/content\/posts\/(?<subPath>[^/]+?\/index)\.md$/,
      fullPath: undefined,
      fmDelimiters: ['---', '---'],
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          extension: 'yml',
          yaml_quote: true,
        },
        _i18n: i18nRootMultiFolder,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^(?<locale>en|fr)\/content\/posts\/(?<subPath>[^/]+?)\.yml$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: true,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFolderCollection,
          extension: 'json',
        },
        _i18n: i18nRootMultiFolder,
      }),
    ).toEqual({
      extension: 'json',
      format: 'json',
      basePath: 'content/posts',
      subPath: undefined,
      fullPathRegEx: /^(?<locale>en|fr)\/content\/posts\/(?<subPath>[^/]+?)\.json$/,
      fullPath: undefined,
      fmDelimiters: undefined,
      yamlQuote: false,
    });
  });

  test('file collection without i18n', () => {
    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
        },
        file: {
          ...rawFileCollectionFrontMatterFile,
        },
        _i18n: i18nDisabled,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.md',
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          format: 'yaml-frontmatter',
        },
        file: {
          ...rawFileCollectionYamlFile,
        },
        _i18n: i18nDisabled,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml-frontmatter',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.yml',
      fmDelimiters: ['---', '---'],
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          extension: 'yml',
          yaml_quote: true,
        },
        file: {
          ...rawFileCollectionYamlFile,
        },
        _i18n: i18nDisabled,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.yml',
      fmDelimiters: undefined,
      yamlQuote: true,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          extension: 'json',
        },
        file: {
          ...rawFileCollectionJsonFile,
        },
        _i18n: i18nDisabled,
      }),
    ).toEqual({
      extension: 'json',
      format: 'json',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.json',
      fmDelimiters: undefined,
      yamlQuote: false,
    });
  });

  test('file collection with single-file i18n', () => {
    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
        },
        file: {
          ...rawFileCollectionFrontMatterFile,
        },
        _i18n: i18nSingleFile,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.md',
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          format: 'yaml-frontmatter',
        },
        file: {
          ...rawFileCollectionYamlFile,
        },
        _i18n: i18nSingleFile,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml-frontmatter',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.yml',
      fmDelimiters: ['---', '---'],
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          extension: 'yml',
          yaml_quote: true,
        },
        file: {
          ...rawFileCollectionYamlFile,
        },
        _i18n: i18nSingleFile,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.yml',
      fmDelimiters: undefined,
      yamlQuote: true,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          extension: 'json',
        },
        file: {
          ...rawFileCollectionJsonFile,
        },
        _i18n: i18nSingleFile,
      }),
    ).toEqual({
      extension: 'json',
      format: 'json',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.json',
      fmDelimiters: undefined,
      yamlQuote: false,
    });
  });

  test('file collection with multi-file i18n', () => {
    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
        },
        file: {
          ...rawFileCollectionFrontMatterFile,
          file: 'data/members.{{locale}}.md',
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.en.md',
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          format: 'yaml-frontmatter',
        },
        file: {
          ...rawFileCollectionYamlFile,
          file: 'data/members.{{locale}}.yml',
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml-frontmatter',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.en.yml',
      fmDelimiters: ['---', '---'],
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          extension: 'yml',
          yaml_quote: true,
        },
        file: {
          ...rawFileCollectionYamlFile,
          file: 'data/members.{{locale}}.yml',
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.en.yml',
      fmDelimiters: undefined,
      yamlQuote: true,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          extension: 'json',
        },
        file: {
          ...rawFileCollectionJsonFile,
          file: 'data/members.{{locale}}.json',
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'json',
      format: 'json',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.en.json',
      fmDelimiters: undefined,
      yamlQuote: false,
    });
  });

  test('file collection with multi-folder i18n', () => {
    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
        },
        file: {
          ...rawFileCollectionFrontMatterFile,
          file: 'data/{{locale}}/members.md',
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'md',
      format: 'frontmatter',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/en/members.md',
      fmDelimiters: undefined,
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          format: 'yaml-frontmatter',
        },
        file: {
          ...rawFileCollectionYamlFile,
          file: 'data/{{locale}}/members.yml',
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml-frontmatter',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/en/members.yml',
      fmDelimiters: ['---', '---'],
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          extension: 'yml',
          yaml_quote: true,
        },
        file: {
          ...rawFileCollectionYamlFile,
          file: 'data/{{locale}}/members.yml',
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'yml',
      format: 'yaml',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/en/members.yml',
      fmDelimiters: undefined,
      yamlQuote: true,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          extension: 'json',
        },
        file: {
          ...rawFileCollectionJsonFile,
          file: 'data/{{locale}}/members.json',
        },
        _i18n: i18nMultiFile,
      }),
    ).toEqual({
      extension: 'json',
      format: 'json',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/en/members.json',
      fmDelimiters: undefined,
      yamlQuote: false,
    });
  });

  test('file collection with format override', () => {
    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
        },
        file: {
          ...rawFileCollectionFrontMatterFile,
          format: 'yaml-frontmatter',
        },
        _i18n: i18nDisabled,
      }),
    ).toEqual({
      extension: 'md',
      format: 'yaml-frontmatter',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.md',
      fmDelimiters: ['---', '---'],
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          format: 'yaml-frontmatter',
        },
        file: {
          ...rawFileCollectionFrontMatterFile,
          format: 'toml-frontmatter',
        },
        _i18n: i18nDisabled,
      }),
    ).toEqual({
      extension: 'md',
      format: 'toml-frontmatter',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.md',
      fmDelimiters: ['+++', '+++'],
      yamlQuote: false,
    });

    expect(
      getFileConfig({
        rawCollection: {
          ...rawFileCollection,
          format: 'yaml-frontmatter',
        },
        file: {
          ...rawFileCollectionJsonFile,
          format: 'json',
        },
        _i18n: i18nDisabled,
      }),
    ).toEqual({
      extension: 'json',
      format: 'json',
      basePath: undefined,
      subPath: undefined,
      fullPathRegEx: undefined,
      fullPath: 'data/members.json',
      fmDelimiters: undefined,
      yamlQuote: false,
    });
  });
});
