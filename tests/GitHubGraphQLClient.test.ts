import fetch from 'node-fetch';
import { GitHubGraphQLClient, GitHubPRAnalyzer } from '../src/index';

jest.mock('node-fetch');
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('GitHubGraphQLClient', () => {
  const mockToken = 'test-token';
  let client: GitHubGraphQLClient;

  beforeEach(() => {
    client = new GitHubGraphQLClient({ token: mockToken });
    mockFetch.mockClear();
  });

  describe('constructor', () => {
    it('should create client with provided token', () => {
      const testClient = new GitHubGraphQLClient({ token: 'my-token' });
      expect(testClient).toBeInstanceOf(GitHubGraphQLClient);
    });

    it('should use environment variable if no token provided', () => {
      process.env.GITHUB_TOKEN = 'env-token';
      const testClient = new GitHubGraphQLClient();
      expect(testClient).toBeInstanceOf(GitHubGraphQLClient);
      delete process.env.GITHUB_TOKEN;
    });

    it('should throw error if no token provided', () => {
      delete process.env.GITHUB_TOKEN;
      expect(() => new GitHubGraphQLClient()).toThrow(
        'GitHub token is required. Set GITHUB_TOKEN environment variable or pass token in config.'
      );
    });

    it('should use custom baseUrl if provided', () => {
      const customUrl = 'https://github.enterprise.com/api/graphql';
      const testClient = new GitHubGraphQLClient({ 
        token: mockToken, 
        baseUrl: customUrl 
      });
      expect(testClient).toBeInstanceOf(GitHubGraphQLClient);
    });
  });

  describe('query', () => {
    it('should make successful GraphQL query', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: { viewer: { login: 'testuser' } }
        })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await client.query('{ viewer { login } }');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/graphql',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'GitHub-GraphQL-Client/1.0.0',
          },
          body: JSON.stringify({
            query: '{ viewer { login } }',
            variables: {},
          }),
        }
      );
      expect(result).toEqual({ viewer: { login: 'testuser' } });
    });

    it('should handle HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      await expect(client.query('{ viewer { login } }')).rejects.toThrow(
        'HTTP 401: Unauthorized'
      );
    });

    it('should handle GraphQL errors', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          errors: [{ message: 'Field not found' }]
        })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      await expect(client.query('{ invalid { field } }')).rejects.toThrow(
        'GraphQL errors: Field not found'
      );
    });

    it('should handle missing data', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({})
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      await expect(client.query('{ viewer { login } }')).rejects.toThrow(
        'No data returned from GraphQL query'
      );
    });

    it('should pass variables to query', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: { repository: { name: 'test-repo' } }
        })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const variables = { owner: 'testowner', name: 'test-repo' };
      await client.query('query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { name } }', variables);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/graphql',
        expect.objectContaining({
          body: JSON.stringify({
            query: 'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { name } }',
            variables,
          }),
        })
      );
    });
  });

  describe('getPullRequestsWithCommentsSince', () => {
    it('should fetch pull requests with comments', async () => {
      const mockData = {
        repository: {
          pullRequests: {
            nodes: [
              {
                id: 'PR_1',
                number: 1,
                title: 'Test PR',
                body: 'Test body',
                state: 'OPEN',
                createdAt: '2023-01-01T00:00:00Z',
                updatedAt: '2023-01-02T00:00:00Z',
                url: 'https://github.com/owner/repo/pull/1',
                author: { login: 'testuser', avatarUrl: 'https://avatar.url' },
                comments: { nodes: [], totalCount: 0 },
                reviewComments: { nodes: [], totalCount: 0 }
              }
            ],
            pageInfo: { hasNextPage: false },
            totalCount: 1
          }
        }
      };

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockData })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await client.getPullRequestsWithCommentsSince(
        'owner',
        'repo',
        '2023-01-01T00:00:00Z'
      );

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should pass pagination parameters', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            repository: {
              pullRequests: {
                nodes: [],
                pageInfo: { hasNextPage: false },
                totalCount: 0
              }
            }
          }
        })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      await client.getPullRequestsWithCommentsSince(
        'owner',
        'repo',
        '2023-01-01T00:00:00Z',
        50,
        'cursor123'
      );

      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse(call[1]!.body as string);
      expect(body.variables).toEqual({
        owner: 'owner',
        repo: 'repo',
        since: '2023-01-01T00:00:00Z',
        first: 50,
        after: 'cursor123'
      });
    });
  });

  describe('getAllPullRequestsWithCommentsSince', () => {
    it('should handle pagination automatically', async () => {
      const page1Data = {
        repository: {
          pullRequests: {
            nodes: [{ id: 'PR_1', number: 1, title: 'PR 1', state: 'OPEN', createdAt: '2023-01-01T00:00:00Z', updatedAt: '2023-01-02T00:00:00Z', url: 'https://github.com/owner/repo/pull/1', author: { login: 'user1', avatarUrl: 'https://avatar1.url' }, comments: { nodes: [], totalCount: 0 }, reviewComments: { nodes: [], totalCount: 0 } }],
            pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
            totalCount: 2
          }
        }
      };

      const page2Data = {
        repository: {
          pullRequests: {
            nodes: [{ id: 'PR_2', number: 2, title: 'PR 2', state: 'CLOSED', createdAt: '2023-01-03T00:00:00Z', updatedAt: '2023-01-04T00:00:00Z', url: 'https://github.com/owner/repo/pull/2', author: { login: 'user2', avatarUrl: 'https://avatar2.url' }, comments: { nodes: [], totalCount: 0 }, reviewComments: { nodes: [], totalCount: 0 } }],
            pageInfo: { hasNextPage: false },
            totalCount: 2
          }
        }
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ data: page1Data })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ data: page2Data })
        } as any);

      const result = await client.getAllPullRequestsWithCommentsSince(
        'owner',
        'repo',
        '2023-01-01T00:00:00Z'
      );

      expect(result).toHaveLength(2);
      expect(result[0]!.number).toBe(1);
      expect(result[1]!.number).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when no PRs found', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            repository: {
              pullRequests: {
                nodes: [],
                pageInfo: { hasNextPage: false },
                totalCount: 0
              }
            }
          }
        })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await client.getAllPullRequestsWithCommentsSince(
        'owner',
        'repo',
        '2023-01-01T00:00:00Z'
      );

      expect(result).toEqual([]);
    });
  });

  describe('static utility methods', () => {
    describe('formatDate', () => {
      it('should format date to ISO string', () => {
        const date = new Date('2023-01-01T12:00:00Z');
        const result = GitHubGraphQLClient.formatDate(date);
        expect(result).toBe('2023-01-01T12:00:00.000Z');
      });
    });

    describe('daysAgo', () => {
      it('should return date string for days ago', () => {
        const result = GitHubGraphQLClient.daysAgo(7);
        const resultDate = new Date(result);
        const now = new Date();
        const daysDiff = Math.round((now.getTime() - resultDate.getTime()) / (1000 * 60 * 60 * 24));
        expect(daysDiff).toBe(7);
      });

      it('should handle zero days', () => {
        const result = GitHubGraphQLClient.daysAgo(0);
        const today = new Date();
        const resultDate = new Date(result);
        expect(resultDate.toDateString()).toBe(today.toDateString());
      });
    });
  });
});

describe('GitHubPRAnalyzer', () => {
  let client: GitHubGraphQLClient;
  let analyzer: GitHubPRAnalyzer;

  beforeEach(() => {
    client = new GitHubGraphQLClient({ token: 'test-token' });
    analyzer = new GitHubPRAnalyzer(client);
    mockFetch.mockClear();
  });

  describe('getPRSummary', () => {
    it('should return correct summary statistics', async () => {
      const mockPRs = [
        {
          id: 'PR_1',
          number: 1,
          title: 'PR 1',
          state: 'OPEN' as const,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-02T00:00:00Z',
          url: 'https://github.com/owner/repo/pull/1',
          author: { login: 'user1', avatarUrl: 'https://avatar1.url' },
          comments: { nodes: [], totalCount: 2 },
          reviewComments: { nodes: [], totalCount: 1 }
        },
        {
          id: 'PR_2',
          number: 2,
          title: 'PR 2',
          state: 'MERGED' as const,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-02T00:00:00Z',
          mergedAt: '2023-01-03T00:00:00Z',
          url: 'https://github.com/owner/repo/pull/2',
          author: { login: 'user2', avatarUrl: 'https://avatar2.url' },
          comments: { nodes: [], totalCount: 3 },
          reviewComments: { nodes: [], totalCount: 2 }
        },
        {
          id: 'PR_3',
          number: 3,
          title: 'PR 3',
          state: 'CLOSED' as const,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-02T00:00:00Z',
          url: 'https://github.com/owner/repo/pull/3',
          author: { login: 'user1', avatarUrl: 'https://avatar1.url' },
          comments: { nodes: [], totalCount: 1 },
          reviewComments: { nodes: [], totalCount: 0 }
        }
      ];

      jest.spyOn(client, 'getAllPullRequestsWithCommentsSince').mockResolvedValue(mockPRs);

      const result = await analyzer.getPRSummary('owner', 'repo', '2023-01-01T00:00:00Z');

      expect(result).toEqual({
        totalPRs: 3,
        openPRs: 1,
        closedPRs: 1,
        mergedPRs: 1,
        totalComments: 6,
        totalReviewComments: 3,
        prsByAuthor: {
          user1: 2,
          user2: 1
        }
      });
    });

    it('should handle empty PR list', async () => {
      jest.spyOn(client, 'getAllPullRequestsWithCommentsSince').mockResolvedValue([]);

      const result = await analyzer.getPRSummary('owner', 'repo', '2023-01-01T00:00:00Z');

      expect(result).toEqual({
        totalPRs: 0,
        openPRs: 0,
        closedPRs: 0,
        mergedPRs: 0,
        totalComments: 0,
        totalReviewComments: 0,
        prsByAuthor: {}
      });
    });
  });
});