# Service Call Analyzer

AI-powered service call analysis that surfaces what happened, what mattered, and what should change.

Hosted on Railway.

## Run locally

1) `npm install`  
2) `npm run dev`  
3) Open `http://localhost:3000`

## Environment

Create `.env.local`:

```
DEEPGRAM_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

## Notes

- No database; analysis runs in memory.
- Insights are grounded in transcript evidence.
