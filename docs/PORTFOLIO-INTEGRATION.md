# Portfolio integration investigation

Inspected the public `main` branch of [KainoaNishida/portfolio](https://github.com/KainoaNishida/portfolio) on September 22, 2026. This is a source inspection, not verification of the deployed website or deployment credentials.

## Observed implementation

- [package.json](https://github.com/KainoaNishida/portfolio/blob/main/package.json): React/Vite application; a deployment script references `gh-pages`. This does not establish which deployment path is currently active.
- [src/content/blog.js](https://github.com/KainoaNishida/portfolio/blob/main/src/content/blog.js): exported `blogContent` object containing a `posts` array. Observed post fields include numeric `id`, `title`, display-string `date`, `tags`, `excerpt`, `content`, and optional `customMessage`/`solved`. Current sample posts have null content.
- [src/pages/BlogPage.jsx](https://github.com/KainoaNishida/portfolio/blob/main/src/pages/BlogPage.jsx): imports `blogContent` and renders its posts through `BlogPost`.
- [src/components/BlogPost.jsx](https://github.com/KainoaNishida/portfolio/blob/main/src/components/BlogPost.jsx): when content is present, renders an array of sections with optional `heading`, `paragraphs`, `list`, and `code`. It does not currently implement journal image blocks, rendered math, or structured citation links.

The inspected blog path is source-backed. No publishing endpoint is established by these files. Do not assume Markdown/MDX support or a CMS write API.

## Proposed boundary

Confirmed priority: implement this immediately after the initial journaling/science release, ahead of the complete art workflow. The first published post should introduce this project and its purpose. A local [editorial draft](drafts/first-project-post.md) is available for review; it has not been published and its implementation-status paragraph must be refreshed before publication.

The journal owns private content and editable drafts. A separate portfolio adapter takes an explicitly approved draft snapshot and produces public content. It must not expose the private journal store or raw private attachment links.

A draft should retain title, date, summary, tags, body, takeaways, selected public assets, and source links. Internal source-entry IDs and PDF annotation IDs remain private unless deliberately translated into public citations.

## Selected delivery: GitHub pull request

The owner prefers a GitHub PR to review before the post goes live. Use Submit for review to create or update a content/assets branch and PR. Keep a stable draft-to-PR mapping so retries do not duplicate submissions. Do not auto-merge. An export may be useful as a fallback, but direct live publication is not the selected initial workflow.

Track draft, submitting, awaiting review, closed without merge, merged/awaiting deployment, and published states distinctly, with recoverable error states. Return the PR URL on submission. Do not label PR creation or merge alone as successful live publication; verify the actual deployment or report its status as unknown. Revisions are explicitly submitted snapshots, not background mirroring of private notebook edits.

No portfolio files were changed and no PR was created during requirements setup. GitHub credentials, exact renderer changes, and the deployment-status integration remain implementation decisions.

## Rich-content decision

Text sections can map to the existing schema, with takeaways represented as a headed list. Images, equation rendering, and clickable citations require an agreed renderer/schema extension or a migration to a richer format. The app must not silently flatten equations or lose images while claiming full-fidelity publication.

Before implementation, verify current source again, choose stable post identity and date formatting, determine image storage and public URLs, decide how private PDF references become public paper/page citations, and confirm actual deployment behavior. Repeated publication requests must update/reuse the same publication identity rather than produce duplicates.
