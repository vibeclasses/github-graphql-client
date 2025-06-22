"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const github_graphql_client_1 = __importStar(require("./github-graphql-client"));
// Example 1: Basic usage - get PRs and comments since a specific date
async function basicExample() {
    const client = new github_graphql_client_1.default();
    try {
        // Get PRs updated since 7 days ago
        const since = github_graphql_client_1.default.daysAgo(7);
        const response = await client.getPullRequestsWithCommentsSince('facebook', 'react', since);
        console.log(`Found ${response.repository.pullRequests.totalCount} PRs`);
        response.repository.pullRequests.nodes.forEach(pr => {
            console.log(`PR #${pr.number}: ${pr.title}`);
            console.log(`  Comments: ${pr.comments.totalCount}`);
            console.log(`  Review Comments: ${pr.reviewComments.totalCount}`);
            console.log(`  State: ${pr.state}`);
            console.log('---');
        });
    }
    catch (error) {
        console.error('Error fetching PRs:', error);
    }
}
// Example 2: Get all PRs with pagination handled automatically
async function getAllPRsExample() {
    const client = new github_graphql_client_1.default();
    try {
        const since = github_graphql_client_1.default.daysAgo(30); // Last 30 days
        const allPRs = await client.getAllPullRequestsWithCommentsSince('microsoft', 'vscode', since);
        console.log(`Total PRs in last 30 days: ${allPRs.length}`);
        // Show PRs with most comments
        const sortedByComments = allPRs
            .sort((a, b) => b.comments.totalCount - a.comments.totalCount)
            .slice(0, 5);
        console.log('\nTop 5 PRs by comment count:');
        sortedByComments.forEach((pr, index) => {
            console.log(`${index + 1}. PR #${pr.number}: ${pr.title}`);
            console.log(`   Comments: ${pr.comments.totalCount + pr.reviewComments.totalCount}`);
        });
    }
    catch (error) {
        console.error('Error:', error);
    }
}
// Example 3: Using the analyzer for summary statistics
async function analyzeRepositoryActivity() {
    const client = new github_graphql_client_1.default();
    const analyzer = new github_graphql_client_1.GitHubPRAnalyzer(client);
    try {
        const since = github_graphql_client_1.default.daysAgo(14); // Last 2 weeks
        const summary = await analyzer.getPRSummary('vercel', 'next.js', since);
        console.log('Repository Activity Summary (Last 2 weeks):');
        console.log(`Total PRs: ${summary.totalPRs}`);
        console.log(`Open: ${summary.openPRs}`);
        console.log(`Merged: ${summary.mergedPRs}`);
        console.log(`Closed: ${summary.closedPRs}`);
        console.log(`Total Comments: ${summary.totalComments}`);
        console.log(`Total Review Comments: ${summary.totalReviewComments}`);
        console.log('\nMost Active Contributors:');
        const sortedAuthors = Object.entries(summary.prsByAuthor)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);
        sortedAuthors.forEach(([author, count], index) => {
            console.log(`${index + 1}. ${author}: ${count} PRs`);
        });
    }
    catch (error) {
        console.error('Error analyzing repository:', error);
    }
}
// Example 4: Custom query for specific data
async function customQueryExample() {
    const client = new github_graphql_client_1.default();
    // Custom query to get repository info and recent issues
    const customQuery = `
    query GetRepoInfo($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        name
        description
        stargazerCount
        forkCount
        primaryLanguage {
          name
        }
        issues(first: 5, states: OPEN, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes {
            number
            title
            createdAt
            author {
              login
            }
          }
        }
      }
    }
  `;
    try {
        const result = await client.query(customQuery, {
            owner: 'typescript',
            repo: 'typescript'
        });
        const repo = result.repository;
        console.log(`Repository: ${repo.name}`);
        console.log(`Description: ${repo.description}`);
        console.log(`Stars: ${repo.stargazerCount}`);
        console.log(`Forks: ${repo.forkCount}`);
        console.log(`Primary Language: ${repo.primaryLanguage?.name}`);
        console.log('\nRecent Issues:');
        repo.issues.nodes.forEach((issue) => {
            console.log(`#${issue.number}: ${issue.title} (by ${issue.author.login})`);
        });
    }
    catch (error) {
        console.error('Error with custom query:', error);
    }
}
// Example 5: Working with specific date ranges
async function dateRangeExample() {
    const client = new github_graphql_client_1.default();
    // Get PRs from a specific date
    const specificDate = new Date('2024-01-01');
    const since = github_graphql_client_1.default.formatDate(specificDate);
    try {
        const response = await client.getPullRequestsWithCommentsSince('nodejs', 'node', since, 10 // Limit to 10 PRs
        );
        console.log(`PRs since ${specificDate.toDateString()}:`);
        response.repository.pullRequests.nodes.forEach(pr => {
            const createdAt = new Date(pr.createdAt);
            console.log(`PR #${pr.number}: ${pr.title} (${createdAt.toDateString()})`);
            // Show recent comments
            if (pr.comments.nodes.length > 0) {
                console.log('  Recent comments:');
                pr.comments.nodes.slice(0, 3).forEach(comment => {
                    const commentDate = new Date(comment.createdAt);
                    console.log(`    - ${comment.author.login} (${commentDate.toDateString()}): ${comment.body.slice(0, 50)}...`);
                });
            }
        });
    }
    catch (error) {
        console.error('Error:', error);
    }
}
// Run examples (uncomment the one you want to test)
// basicExample();
// getAllPRsExample();
// analyzeRepositoryActivity();
// customQueryExample();
// dateRangeExample();
//# sourceMappingURL=usage.js.map