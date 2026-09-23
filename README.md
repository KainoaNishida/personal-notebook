# Personal Note Taker

This notebook is for my own use, at least for now.

The daily journal is the anchor. Gym, paper reading, topic research, art, and reading are flexible goals; an unfinished activity is not a failed day. Each notebook should feel suited to its subject, with particular attention to the interface and scientific paper workspace.

## Project status

Commonplace V1 implementation, September 22, 2026: React/TypeScript/Vite, CodeMirror, PDF.js, and Supabase. The frontend and private backend are deployed at [Commonplace](https://commonplace-kainoa-nishidas-projects.vercel.app). Gemini server credentials and password recovery are configured. **In release verification:** owner sign-in and hosted end-to-end acceptance remain open. See [implementation status](docs/IMPLEMENTATION-STATUS.md) and [deployment setup](docs/DEPLOYMENT.md).

## Run and verify

Use Node 24 and npm. Run `npm ci`, copy `.env.example` to the ignored `.env.local`, then `npm run dev`.

Set `VITE_DEMO_MODE=true` for a local design preview. Preview data stays in that browser; AI is unavailable and sync is not simulated. Production always disables preview mode. For the real application, configure Supabase following the deployment guide and leave preview mode false.

```sh
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:production
npx deno check supabase/functions/explain/index.ts
```

The database harness uses PostgreSQL through PGlite with Auth/Storage role shims. Browser checks use synthetic content and the local preview adapter. Production requires additional real-service checks.

## Start here

- [Product contract](docs/REQUIREMENTS.md): scope, workflows, priorities, and acceptance criteria.
- [Questions and decisions](docs/DECISIONS.md): confirmed answers and remaining product choices.
- [Implementation roadmap](docs/ROADMAP.md): small milestones and technical validation work.
- [Portfolio integration](docs/PORTFOLIO-INTEGRATION.md): observed post format and proposed publishing boundary.
- [Science sample](docs/SCIENCE-SAMPLE.md): inspection of the supplied attention paper and a proposed acceptance exercise.
- [First project-post draft](docs/drafts/first-project-post.md): unpublished introduction to the project's purpose.

Confirmed direction: Obsidian-like Markdown editing, online computer-only use with sync, and explicitly requested science AI. The first usable release covers journaling and science; portfolio integration is immediately next, followed by complete art composition tools.

Support owner-uploaded visuals and AI-created equation decompositions/diagrams embedded in notes. Keep total app API usage within $20/month and aim to spend less. Portfolio submissions use GitHub pull requests for owner review before publication.

## Repository conventions

Keep private journals, PDFs, art uploads, credentials, and generated personal exports out of version control. Use synthetic examples for development. Application source is in `src`, backend migrations/functions in `supabase`, and verification in `tests`, `e2e` and `scripts`. Record significant product decisions in `docs/DECISIONS.md` and update acceptance criteria when scope changes.

This is a single-owner project. Public registration, teams, billing, and a general-purpose productivity platform are outside its scope.
