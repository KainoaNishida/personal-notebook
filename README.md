# Kai’s Notebook

A private notebook for writing, daily reflections, and studying research papers. Built with React, CodeMirror, and Supabase, with Markdown, math, PDF annotations, and notebook-specific labels.

This notebook is for my own use, at least for now.

The [Graphite interface](docs/GRAPHITE.md) uses a spacious writing canvas, a responsive navigation drawer, and self-hosted typography. Today retains its 14-day Activity tracker and account-synced hours.

The [Reading log](docs/READING-LOG.md) tracks books, minutes, dates, and optional expandable notes, with account sync and newest sessions first.

## Development

Use Node 24, then run `npm ci` and `npm run dev`. See [deployment and configuration](docs/DEPLOYMENT.md) for setup.

Run `npm test`, `npm run test:db`, `npm run build`, and `npm run test:e2e` to verify changes.

## Branding and compatibility

Display branding lives in `src/branding.ts`; `index.html` also supplies the browser title before React loads. New backup filenames use `kais-notebook-YYYY-MM-DD.zip`; existing backups remain importable.

The app was previously called Kai’s Journal. Historical documentation retains that context. Legacy storage bucket names, database schemas, local recovery/preview keys, split-pane preferences, and deterministic entry-ID namespaces deliberately retain their original identifiers. Renaming these would break access to existing data. Repository and deployment URLs are unchanged.
