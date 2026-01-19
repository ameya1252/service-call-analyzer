import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Utterance = {
  start: number;
  end: number;
  speaker: number;
  transcript: string;
};

const REQUIRED_STAGES = [
  'Introduction',
  'Problem Diagnosis',
  'Solution Explanation',
  'Upsell Attempts',
  'Maintenance Plan Offer',
  'Closing & Thank You',
];

function formatTimestamp(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return '00:00';
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

function buildUtteranceList(utterances: Utterance[]) {
  return utterances
    .map((utt, index) => {
      const timestamp = formatTimestamp(utt.start);
      const speakerLabel = `Speaker ${utt.speaker + 1}`;
      const text = utt.transcript.replace(/\s+/g, ' ').trim();
      return `#${index} [${timestamp}] ${speakerLabel}: ${text}`;
    })
    .join('\n');
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing OPENAI_API_KEY.' }, { status: 500 });
  }

  const body = await request.json();
  const utterances = Array.isArray(body?.utterances) ? (body.utterances as Utterance[]) : [];
  let transcript = typeof body?.transcript === 'string' ? body.transcript : '';

  if (!utterances.length && transcript) {
    utterances.push({ start: 0, end: 0, speaker: 0, transcript });
  }

  if (!transcript && utterances.length) {
    transcript = utterances.map((utt) => utt.transcript).join(' ');
  }

  if (!utterances.length && !transcript) {
    return NextResponse.json({ error: 'Transcript and utterances are required.' }, { status: 400 });
  }

  const utteranceList = buildUtteranceList(utterances);

  const systemPrompt = `You are an assistant for analyzing field-service calls. You must ground every insight in the transcript. Never invent details. If evidence is missing, say so explicitly and set evidence to null.`;

  const userPrompt = `Analyze the service call transcript. Use only the utterances provided.

Return JSON with these keys:
- callType: { label, rationale, evidence: [{ quote, timestamp }] }
- primaryInsight: string
- stages: array of 6 objects, one per required stage in this exact order: ${REQUIRED_STAGES.join(
    ', '
  )}. Each stage: { stage, summary, startIndex, endIndex, evidence: [{ quote, timestamp }] }
- salesSignals: [{ signal, interpretation, evidence: { quote, timestamp } }]
- decisionReadinessSignals: [{ signal, evidence: { quote, timestamp } }]
- conversationDynamics: [{ observation, evidence: { quote, timestamp } | null }]
- expansionVsAddOns: { expansion: [{ point, evidence: { quote, timestamp } }], addOns: [{ point, evidence: { quote, timestamp } }] }
- conversionDrivers: [{ driver, evidence: { quote, timestamp } }]
- whatActuallyMattered: [{ insight, evidence: { quote, timestamp } | null }]
- productProblems: [{ problem }]
- aiDisclosure: string
- humanJudgmentNote: string
- intentionalTradeoffs: string
- whatWentWell: [{ point, evidence: { quote, timestamp } }]
- whatWasMissed: [{ point, evidence: { quote, timestamp } | null }]
- recommendations: [{ action, rationale, timing, evidence: { quote, timestamp } | null }]
- nextBestActions: [{ action, timing, why, how }]
- keyMoments: [{ type: "success"|"risk"|"opportunity", timestamp, quote, takeaway }]
- ifNosoWereLiveHere: [{ automation, trigger, outcome }]

Rules:
- Evidence quotes must be exact phrases from the utterances.
- Timestamps must match the utterance list (mm:ss).
- startIndex/endIndex refer to utterance indices. Use null if stage not present.
- Keep summaries concise, 1-2 sentences max.
- Make whatWasMissed concrete and specific; avoid generic filler.
- primaryInsight must be 1-2 sentences explaining the primary blocker to conversion, emphasizing decision friction (not price/trust), with no generic sales language.
- callType label should be explicit when a service call includes sales activity (e.g., "Service Call with Sales Conversion Component").
- Conversation dynamics must address conversion mechanics and avoid polite/general praise. Prefer observations like: talk/listen imbalance, short affirmations vs open-ended engagement, spikes in engagement around money/comfort, overload before decision framing, momentum loss without recap.
- ConversionDrivers should read like a deal narrative (preference, emotional/comfort drivers, financing impact, single blocker). Use higher-signal framing like comfort/emotional drivers vs technical detail when supported.
- WhatWasMissed should include concrete sales misses: recap of options, explicit confirmation question, follow-up time, timing of financing, decision framing.
- Recommendations must be specific with when/why/how and reflect operational next steps (not generic follow-up). Prefer: 2-option recap, monthly payment framing, explicit financing blocker check, follow-up within 48 hours if relevant.
- NextBestActions should read like automated triggers, not human advice, and be similarly specific (timing + trigger + action).
- Use the term "customer" consistently (avoid switching to client/homeowner).
- If evidence is null, phrase the item as an observational insight without referencing missing quotes.
- IfNosoWereLiveHere must read like system automation: auto-send 2-option summary, flag financing interest, set 48-hour no-response reminder, and include one behavior addressing multi-decision-maker friction.
- Avoid "asking for estimates" as a decision signal unless explicitly stated; prefer signals tied to stated preferences, value drivers, or narrowing language.
- Recommendations should be one notch more operational (concise 2-option email, monthly payment ranges, next steps) with explicit timing.
- IfNosoWereLiveHere should include trigger + outcome (reduced drop-off, faster decision loop).
- Standardize terminology: use "technician" consistently (avoid "representative").
- Upsell Attempts should focus only on true upsell behaviors (rebates, higher-efficiency options, duct sealing). Reframe guarantees as trust-building, not upsell evidence.
- WhatWasMissed must explicitly note the technician did not engage the second decision-maker despite references.
- whatActuallyMattered should summarize 3-4 key human insights about intent, decision friction, and buying motivation.
- productProblems should list 2-3 operational gaps phrased as system gaps (product-oriented, not field notes), generalized beyond this call, without proposing solutions.
- aiDisclosure should be a single sentence noting AI was used for transcription and extraction, while insights reflect human judgment and prioritization.
- humanJudgmentNote should be 2-3 sentences distinguishing what AI handled reliably (transcription/extraction) versus what required contextual human interpretation (prioritization, decision friction); keep calm, factual tone.
- intentionalTradeoffs should be exactly one sentence explaining one analysis intentionally not included and why it would not change the outcome.
- Language pass: remove hedging (e.g., "appears", "seems", "may have"); keep sentences short and crisp for <2 minute skim; do not add new insights or change structure.
- Avoid repeating the same rebate detail across multiple sections; mention rebates in only one section if possible.
- Respond with only valid JSON. Do not include any text before or after the JSON object.

Utterances:
${utteranceList}`;

  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text();
    return NextResponse.json(
      { error: 'OpenAI analysis failed.', detail: errorText },
      { status: 502 }
    );
  }

  const openaiData = await openaiResponse.json();
  const content = openaiData?.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: 'No analysis content returned.' }, { status: 502 });
  }

  try {
    const sanitized = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(sanitized);
    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to parse analysis JSON.', detail: String(error) },
      { status: 502 }
    );
  }
}
