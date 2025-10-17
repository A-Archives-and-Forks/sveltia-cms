import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockLocalStorage = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

const mockBackend = {
  signIn: vi.fn(),
  signOut: vi.fn(),
  fetchFiles: vi.fn(),
};

const mockBackendStore = { subscribe: vi.fn() };
const mockSiteConfigStore = { subscribe: vi.fn() };
const mockUser = { set: vi.fn() };
const mockDataLoaded = { set: vi.fn() };
const mockPrefs = { update: vi.fn() };
const mockGoto = vi.fn();
const mockParseLocation = vi.fn();
const mockGet = vi.fn();
const mockGetLocaleText = vi.fn();
const mockBackendName = { set: vi.fn() };
const mockSiteConfig = { backend: { name: 'github' } };

vi.mock('@sveltia/utils/storage', () => ({
  LocalStorage: mockLocalStorage,
}));

vi.mock('@sveltia/utils/object', () => ({
  isObject: vi.fn((obj) => obj !== null && typeof obj === 'object'),
}));

vi.mock('svelte/store', () => ({
  get: mockGet,
  writable: vi.fn((initial) => ({
    set: vi.fn(),
    subscribe: vi.fn(),
    update: vi.fn(),
    initial,
  })),
}));

vi.mock('svelte-i18n', () => ({
  _: mockGetLocaleText,
}));

vi.mock('$lib/services/app/navigation', () => ({
  goto: mockGoto,
  parseLocation: mockParseLocation,
}));

vi.mock('$lib/services/backends', () => ({
  backend: mockBackendStore,
  backendName: mockBackendName,
}));

vi.mock('$lib/services/config', () => ({
  siteConfig: mockSiteConfigStore,
}));

vi.mock('$lib/services/contents', () => ({
  dataLoaded: mockDataLoaded,
}));

vi.mock('$lib/services/user', () => ({
  user: mockUser,
}));

vi.mock('$lib/services/user/prefs', () => ({
  prefs: mockPrefs,
}));

describe('auth service', () => {
  /** @type {any} */
  let authModule;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockGet.mockImplementation((store) => {
      // Handle the backend store
      if (store === mockBackendStore) {
        return mockBackend;
      }

      // Handle the siteConfig store
      if (store === mockSiteConfigStore) {
        return mockSiteConfig;
      }

      // Handle the translation function (_)
      if (store === mockGetLocaleText) {
        return mockGetLocaleText;
      }

      // Default to returning the siteConfig for other store access
      return mockSiteConfig;
    });

    mockGetLocaleText.mockImplementation((/** @type {string} */ key) => {
      /** @type {Record<string, string>} */
      const translations = {
        unexpected_error: 'Unexpected error',
        'sign_in_error.not_project_root': 'Not project root error',
        'sign_in_error.picker_dismissed': 'Picker dismissed',
        'sign_in_error.authentication_aborted': 'Authentication aborted',
        'sign_in_error.invalid_token': 'The provided token is invalid',
      };

      return translations[key] || key;
    });
    mockParseLocation.mockReturnValue({ path: '/' });

    // Import the module after mocks are set up
    authModule = await import('./auth.js');

    // Spy on the exported stores rather than reassigning them
    vi.spyOn(authModule.signInError, 'set');
    vi.spyOn(authModule.unauthenticated, 'set');
    vi.spyOn(authModule.signingIn, 'set');
  });

  describe('resetError', () => {
    it('should reset signInError to initial state', () => {
      authModule.resetError();

      expect(authModule.signInError.set).toHaveBeenCalledWith({
        message: '',
        context: 'authentication',
      });
    });
  });

  describe('logError', () => {
    it('should set signInError with cause message', () => {
      const error = new Error('Test error');

      error.cause = { message: 'Cause message' };

      authModule.logError(error);

      expect(authModule.signInError.set).toHaveBeenCalledWith({
        message: 'Cause message',
        context: 'authentication',
      });
    });

    it('should handle NotFoundError', () => {
      const error = new Error('Not found');

      error.name = 'NotFoundError';
      mockGetLocaleText.mockReturnValue('Not project root error');

      authModule.logError(error);

      expect(authModule.signInError.set).toHaveBeenCalledWith({
        message: 'Not project root error',
        context: 'authentication',
      });
    });

    it('should handle AbortError for local backend', () => {
      const error = new Error('Aborted');

      error.name = 'AbortError';
      mockGet.mockImplementation((store) => {
        if (store === mockBackendName) return 'local';

        return mockGetLocaleText;
      });
      mockGetLocaleText.mockReturnValue('Picker dismissed error');

      authModule.logError(error);

      expect(authModule.signInError.set).toHaveBeenCalledWith({
        message: 'Picker dismissed error',
        context: 'authentication',
      });
    });

    it('should handle AbortError for non-local backend', () => {
      const error = new Error('Aborted');

      error.name = 'AbortError';
      mockGet.mockImplementation((store) => {
        if (store === mockBackendName) return 'github';

        return mockGetLocaleText;
      });
      mockGetLocaleText.mockReturnValue('Authentication aborted error');

      authModule.logError(error);

      expect(authModule.signInError.set).toHaveBeenCalledWith({
        message: 'Authentication aborted error',
        context: 'authentication',
      });
    });

    it('should use fallback message when no cause', () => {
      const error = new Error('Test error');

      mockGetLocaleText.mockReturnValue('Unexpected error');

      authModule.logError(error);

      expect(authModule.signInError.set).toHaveBeenCalledWith({
        message: 'Unexpected error',
        context: 'authentication',
      });
    });

    it('should set custom context when provided', () => {
      const error = new Error('Test error');

      error.cause = { message: 'Data fetch error' };

      authModule.logError(error, 'dataFetch');

      expect(authModule.signInError.set).toHaveBeenCalledWith({
        message: 'Data fetch error',
        context: 'dataFetch',
      });
    });
  });

  describe('signInAutomatically', () => {
    it('should return early if user cache is empty object', async () => {
      mockLocalStorage.get.mockResolvedValue({});

      await authModule.signInAutomatically();

      expect(mockBackend.signIn).not.toHaveBeenCalled();
      // Should not call unauthenticated.set because function returns early
      expect(authModule.unauthenticated.set).not.toHaveBeenCalled();
    });

    it('should check multiple cache sources', async () => {
      mockLocalStorage.get
        .mockResolvedValueOnce(null) // sveltia-cms.user
        .mockResolvedValueOnce(null) // decap-cms-user
        .mockResolvedValueOnce({ token: 'netlify-token', backendName: 'github' }); // netlify-cms-user

      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockSiteConfigStore) return mockSiteConfig;
        if (store === mockGetLocaleText) return mockGetLocaleText;

        return mockSiteConfig;
      });
      mockBackend.signIn.mockResolvedValue({ token: 'netlify-token' });
      mockBackend.fetchFiles.mockResolvedValue(undefined);

      await authModule.signInAutomatically();

      expect(mockLocalStorage.get).toHaveBeenCalledWith('sveltia-cms.user');
      expect(mockLocalStorage.get).toHaveBeenCalledWith('decap-cms-user');
      expect(mockLocalStorage.get).toHaveBeenCalledWith('netlify-cms-user');
      expect(authModule.signingIn.set).toHaveBeenCalledWith(true);
      expect(authModule.signingIn.set).toHaveBeenCalledWith(false);
    });

    it('should sign in with cached user data and set signingIn state', async () => {
      const cachedUser = {
        token: 'test-token',
        backendName: 'github',
      };

      mockLocalStorage.get.mockImplementation((key) => {
        if (key === 'sveltia-cms.user') return Promise.resolve(cachedUser);

        return Promise.resolve(null);
      });
      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockSiteConfigStore) return mockSiteConfig;
        if (store === mockGetLocaleText) return mockGetLocaleText;

        return mockSiteConfig;
      });
      mockBackend.signIn.mockResolvedValue(cachedUser);
      mockBackend.fetchFiles.mockResolvedValue(undefined);

      await authModule.signInAutomatically();

      expect(mockUser.set).toHaveBeenCalledWith(cachedUser); // Set before sign-in
      expect(authModule.signingIn.set).toHaveBeenCalledWith(true);
      expect(mockBackend.signIn).toHaveBeenCalledWith({
        token: 'test-token',
        refreshToken: undefined,
        auto: true,
      });
      expect(authModule.signingIn.set).toHaveBeenCalledWith(false);
      expect(authModule.unauthenticated.set).toHaveBeenCalledWith(false);
      expect(mockUser.set).toHaveBeenCalledWith(cachedUser); // Set after sign-in
      expect(mockBackend.fetchFiles).toHaveBeenCalled();
    });

    it('should handle QR code authentication', async () => {
      const encodedData = btoa(JSON.stringify({ token: 'qr-token', prefs: { theme: 'dark' } }));

      mockLocalStorage.get.mockResolvedValue(null);
      mockParseLocation.mockReturnValue({
        path: {
          /**
           * Mock match function.
           * @returns {object} Match result with groups.
           */
          match: () => ({ groups: { encodedData } }),
        },
      });
      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockSiteConfigStore) return mockSiteConfig;
        if (store === mockGetLocaleText) return mockGetLocaleText;

        return mockSiteConfig;
      });
      mockBackend.signIn.mockResolvedValue({ token: 'qr-token' });
      mockBackend.fetchFiles.mockResolvedValue(undefined);

      await authModule.signInAutomatically();

      expect(mockGoto).toHaveBeenCalledWith('', { replaceState: true });
      expect(authModule.signingIn.set).toHaveBeenCalledWith(true);
      expect(mockBackend.signIn).toHaveBeenCalledWith({
        token: 'qr-token',
        refreshToken: undefined,
        auto: true,
      });
      expect(authModule.signingIn.set).toHaveBeenCalledWith(false);
      expect(mockPrefs.update).toHaveBeenCalled();
    });

    it('should handle invalid QR code data gracefully', async () => {
      const encodedData = btoa('invalid json data');

      mockLocalStorage.get.mockResolvedValue(null);
      mockParseLocation.mockReturnValue({
        path: {
          /**
           * Mock match function.
           * @returns {object} Match result with groups.
           */
          match: () => ({ groups: { encodedData } }),
        },
      });
      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockSiteConfigStore) return mockSiteConfig;
        if (store === mockGetLocaleText) return mockGetLocaleText;

        return mockSiteConfig;
      });

      await authModule.signInAutomatically();

      // Should handle the parsing error gracefully (lines 132-133)
      expect(mockGoto).toHaveBeenCalledWith('', { replaceState: true });
      // Should not attempt to sign in with invalid data
      expect(mockBackend.signIn).not.toHaveBeenCalled();
    });

    it('should use local backend when cached user has proxy backendName', async () => {
      // Test line 104 - when _user?.backendName === 'proxy', it should use 'local'
      const cachedUser = { token: 'test-token', backendName: 'proxy' };

      mockLocalStorage.get.mockResolvedValue(cachedUser);
      mockParseLocation.mockReturnValue({
        path: {
          /**
           * Mock match function that returns null.
           * @returns {null} Null match result.
           */
          match: () => null,
        },
      });
      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockSiteConfigStore) return mockSiteConfig;
        if (store === mockGetLocaleText) return mockGetLocaleText;

        return mockSiteConfig;
      });
      mockBackend.signIn.mockResolvedValue(cachedUser);
      mockBackend.fetchFiles.mockResolvedValue(undefined);

      await authModule.signInAutomatically();

      // Should set backendName to 'local' when cached user has 'proxy' backend
      expect(mockBackendName.set).toHaveBeenCalledWith('local');
    });

    it('should handle QR code path without encoded data', async () => {
      // Test line 116 - when path.match() returns null or has no groups
      mockLocalStorage.get.mockResolvedValue(null);
      mockParseLocation.mockReturnValue({
        path: {
          /**
           * Mock match function that returns object without groups.
           * @returns {object} Match result without groups property.
           */
          match: () => ({}), // No groups property
        },
      });
      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockSiteConfigStore) return mockSiteConfig;
        if (store === mockGetLocaleText) return mockGetLocaleText;

        return mockSiteConfig;
      });

      await authModule.signInAutomatically();

      // Should not call goto or attempt QR code authentication
      expect(mockGoto).not.toHaveBeenCalled();
      expect(mockBackend.signIn).not.toHaveBeenCalled();
    });

    it('should handle sign in failure gracefully', async () => {
      const cachedUser = { token: 'test-token', backendName: 'github' };

      mockLocalStorage.get.mockResolvedValue(cachedUser);
      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockSiteConfigStore) return mockSiteConfig;
        if (store === mockGetLocaleText) return mockGetLocaleText;

        return mockSiteConfig;
      });
      mockBackend.signIn.mockRejectedValue(new Error('Sign in failed'));

      await authModule.signInAutomatically();

      expect(mockUser.set).toHaveBeenCalledWith(cachedUser); // Set before sign-in
      expect(authModule.signingIn.set).toHaveBeenCalledWith(true);
      expect(authModule.signingIn.set).toHaveBeenCalledWith(false);
      expect(mockUser.set).toHaveBeenCalledWith(undefined); // Reset after failure
      expect(authModule.unauthenticated.set).toHaveBeenCalledWith(true);
    });

    it('should handle fetch files failure with auth error', async () => {
      const cachedUser = { token: 'test-token', backendName: 'github' };

      mockLocalStorage.get.mockResolvedValue(cachedUser);
      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockSiteConfigStore) return mockSiteConfig;
        if (store === mockGetLocaleText) return mockGetLocaleText;

        return mockSiteConfig;
      });
      mockBackend.signIn.mockResolvedValue(cachedUser);

      const fetchError = new Error('Fetch failed');

      fetchError.cause = { status: 401 };
      mockBackend.fetchFiles.mockRejectedValue(fetchError);

      await authModule.signInAutomatically();

      expect(authModule.unauthenticated.set).toHaveBeenCalledWith(true);
    });

    it('should handle fetch files failure with non-auth error', async () => {
      const cachedUser = { token: 'test-token', backendName: 'github' };

      mockLocalStorage.get.mockResolvedValue(cachedUser);
      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockSiteConfigStore) return mockSiteConfig;
        if (store === mockGetLocaleText) return mockGetLocaleText;

        return mockSiteConfig;
      });
      mockBackend.signIn.mockResolvedValue(cachedUser);

      const fetchError = new Error('Network error');

      fetchError.cause = { status: 500 };
      mockBackend.fetchFiles.mockRejectedValue(fetchError);

      await authModule.signInAutomatically();

      expect(authModule.signInError.set).toHaveBeenCalled();
    });
  });

  describe('signInManually', () => {
    it('should sign in with provided credentials and set signingIn state', async () => {
      const user = { token: 'manual-token' };

      mockGet.mockReturnValue(mockBackend);
      mockBackend.signIn.mockResolvedValue(user);
      mockBackend.fetchFiles.mockResolvedValue(undefined);

      await authModule.signInManually('github', 'manual-token');

      expect(authModule.signingIn.set).toHaveBeenCalledWith(true);
      expect(mockBackend.signIn).toHaveBeenCalledWith({
        token: 'manual-token',
        auto: false,
      });
      expect(authModule.signingIn.set).toHaveBeenCalledWith(false);
      expect(authModule.unauthenticated.set).toHaveBeenCalledWith(false);
      expect(mockUser.set).toHaveBeenCalledWith(user);
      expect(mockBackend.fetchFiles).toHaveBeenCalled();
    });

    it('should handle sign in failure and set signingIn state', async () => {
      mockGet.mockImplementation((store) => {
        if (store === mockBackend) return mockBackend;
        if (store === mockGetLocaleText) return mockGetLocaleText;
        if (store && typeof store.subscribe === 'function') return mockSiteConfig;

        return mockBackend;
      });

      const signInError = new Error('Invalid token');

      mockBackend.signIn.mockRejectedValue(signInError);

      await authModule.signInManually('github', 'invalid-token');

      expect(authModule.signingIn.set).toHaveBeenCalledWith(true);
      expect(authModule.signingIn.set).toHaveBeenCalledWith(false);
      expect(authModule.unauthenticated.set).toHaveBeenCalledWith(true);
      expect(authModule.signInError.set).toHaveBeenCalled();
    });

    it('should handle PAT token authentication failure', async () => {
      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockGetLocaleText) return mockGetLocaleText;
        if (store && typeof store.subscribe === 'function') return mockSiteConfig;

        return mockBackend;
      });

      const signInError = new Error('Unauthorized');

      signInError.cause = { status: 401 };
      mockBackend.signIn.mockRejectedValue(signInError);
      mockGetLocaleText.mockReturnValue('The provided token is invalid');

      await authModule.signInManually('github', 'invalid-pat-token');

      expect(authModule.signingIn.set).toHaveBeenCalledWith(true);
      expect(authModule.signingIn.set).toHaveBeenCalledWith(false);
      expect(authModule.unauthenticated.set).toHaveBeenCalledWith(true);
      // Lines 210-214 should be covered - specific error for invalid PAT
      expect(authModule.signInError.set).toHaveBeenCalledWith({
        message: 'The provided token is invalid',
        context: 'authentication',
      });
    });

    it('should handle sign in failure without token (OAuth flow)', async () => {
      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockGetLocaleText) return mockGetLocaleText;
        if (store && typeof store.subscribe === 'function') return mockSiteConfig;

        return mockBackend;
      });

      const signInError = new Error('Unauthorized');

      signInError.cause = { status: 401 };
      mockBackend.signIn.mockRejectedValue(signInError);

      // No token provided - OAuth flow
      await authModule.signInManually('github');

      expect(authModule.signingIn.set).toHaveBeenCalledWith(true);
      expect(authModule.signingIn.set).toHaveBeenCalledWith(false);
      expect(authModule.unauthenticated.set).toHaveBeenCalledWith(true);
      // Should use general error handling (else branch of lines 210-214)
      expect(authModule.signInError.set).toHaveBeenCalled();
    });

    it('should return early if sign in returns no user', async () => {
      mockGet.mockReturnValue(mockBackend);
      mockBackend.signIn.mockResolvedValue(null);

      await authModule.signInManually('github', 'token');

      expect(authModule.signingIn.set).toHaveBeenCalledWith(true);
      expect(authModule.signingIn.set).toHaveBeenCalledWith(false);
      expect(authModule.unauthenticated.set).toHaveBeenCalledWith(true);
      // Lines 226-227 should be covered - early return when no user
      expect(mockUser.set).not.toHaveBeenCalled();
      expect(mockBackend.fetchFiles).not.toHaveBeenCalled();
    });

    it('should return early if no backend', async () => {
      mockGet.mockReturnValue(null);

      await authModule.signInManually('github', 'token');

      expect(mockBackend.signIn).not.toHaveBeenCalled();
      expect(authModule.signingIn.set).not.toHaveBeenCalled();
    });

    it('should handle fetch files failure', async () => {
      const user = { token: 'manual-token' };

      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockGetLocaleText) return mockGetLocaleText;

        return mockSiteConfig;
      });
      mockBackend.signIn.mockResolvedValue(user);

      const fetchError = new Error('Fetch failed');

      mockBackend.fetchFiles.mockRejectedValue(fetchError);

      await authModule.signInManually('github', 'manual-token');

      expect(authModule.signingIn.set).toHaveBeenCalledWith(true);
      expect(authModule.signingIn.set).toHaveBeenCalledWith(false);
      // User is still authenticated even if fetchFiles fails
      expect(authModule.unauthenticated.set).toHaveBeenCalledWith(false);
      expect(mockUser.set).toHaveBeenCalledWith(user);
      expect(authModule.signInError.set).toHaveBeenCalled();
    });
  });

  describe('signOut', () => {
    it('should sign out and reset state', async () => {
      mockGet.mockReturnValue(mockBackend);
      mockBackend.signOut.mockResolvedValue(undefined);

      await authModule.signOut();

      expect(mockBackend.signOut).toHaveBeenCalled();
      expect(mockLocalStorage.set).toHaveBeenCalledWith('sveltia-cms.user', {});
      expect(mockBackendName.set).toHaveBeenCalledWith(undefined);
      expect(mockUser.set).toHaveBeenCalledWith(undefined);
      expect(authModule.unauthenticated.set).toHaveBeenCalledWith(true);
      expect(mockDataLoaded.set).toHaveBeenCalledWith(false);
    });

    it('should redirect to logout URL when configured', async () => {
      const mockSiteConfigWithLogout = {
        backend: { name: 'github' },
        logout_redirect_url: 'https://example.com/goodbye',
      };

      mockGet.mockImplementation((store) => {
        if (store === mockBackendStore) return mockBackend;
        if (store === mockSiteConfigStore) return mockSiteConfigWithLogout;

        return mockSiteConfigWithLogout;
      });
      mockBackend.signOut.mockResolvedValue(undefined);

      // Mock window.location
      const originalWindow = global.window;

      global.window = /** @type {any} */ ({ location: { href: '' } });

      await authModule.signOut();

      // Lines 256-257 should be covered - redirect when logout_redirect_url is set
      expect(global.window.location.href).toBe('https://example.com/goodbye');

      // Restore
      global.window = originalWindow;
    });
  });
});
