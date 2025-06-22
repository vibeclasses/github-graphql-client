import fetch from "node-fetch";

// Types for GitHub GraphQL API responses
export interface GitHubUser {
  login: string;
  name?: string;
  email?: string;
  avatarUrl: string;
}

export interface PullRequestComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: GitHubUser;
  url: string;
}

export interface ReviewComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: GitHubUser;
  path: string;
  line?: number;
  originalLine?: number;
  url: string;
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  body?: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  author: GitHubUser;
  url: string;
  comments: {
    nodes: PullRequestComment[];
    totalCount: number;
  };
  reviewComments: {
    nodes: ReviewComment[];
    totalCount: number;
  };
}

export interface PullRequestsResponse {
  repository: {
    pullRequests: {
      nodes: PullRequest[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor?: string;
      };
      totalCount: number;
    };
  };
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

export interface GitHubGraphQLClientConfig {
  token?: string;
  baseUrl?: string;
}

export class GitHubGraphQLClient {
  private token: string;
  private baseUrl: string;

  constructor(config: GitHubGraphQLClientConfig = {}) {
    this.token = config.token || process.env.GITHUB_TOKEN || "";
    this.baseUrl = config.baseUrl || "https://api.github.com/graphql";

    if (!this.token) {
      throw new Error(
        "GitHub token is required. Set GITHUB_TOKEN environment variable or pass token in config."
      );
    }
  }

  /**
   * Execute a custom GraphQL query
   */
  async query<T = unknown>(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "GitHub-GraphQL-Client/1.0.0",
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result: GraphQLResponse<T> = await response.json();

    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map((err) => err.message).join(", ");
      throw new Error(`GraphQL errors: ${errorMessages}`);
    }

    if (!result.data) {
      throw new Error("No data returned from GraphQL query");
    }

    return result.data;
  }

  /**
   * Get pull requests and their comments since a given date
   */
  async getPullRequestsWithCommentsSince(
    owner: string,
    repo: string,
    since: string,
    first: number = 20,
    after?: string
  ): Promise<PullRequestsResponse> {
    const query = `
      query GetPullRequestsWithComments(
        $owner: String!
        $repo: String!
        $since: DateTime!
        $first: Int!
        $after: String
      ) {
        repository(owner: $owner, name: $repo) {
          pullRequests(
            first: $first
            after: $after
            orderBy: { field: UPDATED_AT, direction: DESC }
            filterBy: { since: $since }
          ) {
            nodes {
              id
              number
              title
              body
              state
              createdAt
              updatedAt
              mergedAt
              url
              author {
                login
                ... on User {
                  name
                  email
                  avatarUrl
                }
              }
              comments(first: 100) {
                nodes {
                  id
                  body
                  createdAt
                  updatedAt
                  url
                  author {
                    login
                    ... on User {
                      name
                      email
                      avatarUrl
                    }
                  }
                }
                totalCount
              }
              reviewComments(first: 100) {
                nodes {
                  id
                  body
                  createdAt
                  updatedAt
                  path
                  line
                  originalLine
                  url
                  author {
                    login
                    ... on User {
                      name
                      email
                      avatarUrl
                    }
                  }
                }
                totalCount
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
            totalCount
          }
        }
      }
    `;

    return this.query<PullRequestsResponse>(query, {
      owner,
      repo,
      since,
      first,
      after,
    });
  }

  /**
   * Get all pull requests and comments since a given date (handles pagination automatically)
   */
  async getAllPullRequestsWithCommentsSince(
    owner: string,
    repo: string,
    since: string
  ): Promise<PullRequest[]> {
    const allPullRequests: PullRequest[] = [];
    let hasNextPage = true;
    let after: string | undefined;

    while (hasNextPage) {
      const response = await this.getPullRequestsWithCommentsSince(
        owner,
        repo,
        since,
        100, // Fetch more per page for efficiency
        after
      );

      allPullRequests.push(...response.repository.pullRequests.nodes);

      hasNextPage = response.repository.pullRequests.pageInfo.hasNextPage;
      after = response.repository.pullRequests.pageInfo.endCursor;
    }

    return allPullRequests;
  }

  /**
   * Utility method to format date for GitHub GraphQL API
   */
  static formatDate(date: Date): string {
    return date.toISOString();
  }

  /**
   * Utility method to create a date from days ago
   */
  static daysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return GitHubGraphQLClient.formatDate(date);
  }
}

// Example usage and helper functions
export class GitHubPRAnalyzer {
  constructor(private client: GitHubGraphQLClient) {}

  /**
   * Get summary statistics for pull requests since a given date
   */
  async getPRSummary(owner: string, repo: string, since: string) {
    const prs = await this.client.getAllPullRequestsWithCommentsSince(
      owner,
      repo,
      since
    );

    const summary = {
      totalPRs: prs.length,
      openPRs: prs.filter((pr) => pr.state === "OPEN").length,
      closedPRs: prs.filter((pr) => pr.state === "CLOSED").length,
      mergedPRs: prs.filter((pr) => pr.state === "MERGED").length,
      totalComments: prs.reduce((sum, pr) => sum + pr.comments.totalCount, 0),
      totalReviewComments: prs.reduce(
        (sum, pr) => sum + pr.reviewComments.totalCount,
        0
      ),
      prsByAuthor: this.groupByAuthor(prs),
    };

    return summary;
  }

  private groupByAuthor(prs: PullRequest[]) {
    const grouped: Record<string, number> = {};
    for (const pr of prs) {
      const author = pr.author.login;
      grouped[author] = (grouped[author] || 0) + 1;
    }
    return grouped;
  }
}

// Export default instance
export default GitHubGraphQLClient;
