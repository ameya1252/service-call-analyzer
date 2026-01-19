# Service Call Analyzer

AI-powered service call analysis that surfaces what happened, what mattered, and what should change.

A production-clean Next.js app that transcribes and analyzes field-service calls. Upload audio or record directly in the browser to get a diarized transcript, stage-by-stage insights, and evidence-backed recommendations.

## What this delivers

- Audio input via upload (.mp3, .m4a, .wav) or live browser recording
- Deepgram transcription with speaker diarization for long-form calls
- Full transcript rendered in the UI, segmented by service call stage
- OpenAI-assisted analysis grounded in exact quotes and timestamps
- Clear, skimmable layout for sales, ops, and leadership reviews
- No database or persistence (transcripts live in memory only)

## Tech stack

- Next.js App Router + React
- TypeScript
- Custom CSS
- Deepgram speech-to-text
- OpenAI for analysis

## Environment variables

Create a `.env.local` with:

```
DEEPGRAM_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Vercel

1. Push the repo to GitHub.
2. Create a new Vercel project.
3. Add `DEEPGRAM_API_KEY` and `OPENAI_API_KEY` in Vercel env vars.
4. Deploy.

## Why No Database?

Analysis is intentionally ephemeral. Calls are processed in-memory to preserve privacy, avoid storing sensitive conversations, and keep the system stateless and easy to deploy.

## Design Decisions

- Human-grounded insights (AI assists, doesn't decide)
- Evidence-first analysis (every claim needs a quote)
- Operator-facing clarity (skimmable in under 2 minutes)

## Project structure

```
app/
  api/
    analyze/route.ts     # OpenAI analysis
    transcribe/route.ts  # Deepgram transcription
  globals.css            # Styles
  layout.tsx             # Root layout
  page.tsx               # UI and client logic
next.config.js
```

## Notes

- The OpenAI prompt is designed to keep analysis grounded in the transcript. Missing evidence is explicitly noted.
- The transcript panel shows full call content grouped by required stages. If a stage has no evidence, it is still reported.
