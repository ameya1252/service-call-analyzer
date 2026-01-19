import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen';

function normalizeUtterances(utterances: any[]) {
  if (!Array.isArray(utterances)) {
    return [];
  }
  return utterances.map((utt) => ({
    start: typeof utt.start === 'number' ? utt.start : 0,
    end: typeof utt.end === 'number' ? utt.end : 0,
    speaker: typeof utt.speaker === 'number' ? utt.speaker : 0,
    transcript: typeof utt.transcript === 'string' ? utt.transcript.trim() : '',
  }));
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing DEEPGRAM_API_KEY.' }, { status: 500 });
  }

  const formData = await request.formData();
  const audioFile = formData.get('audio');

  if (!audioFile || typeof audioFile === 'string') {
    return NextResponse.json({ error: 'No audio file provided.' }, { status: 400 });
  }

  const arrayBuffer = await audioFile.arrayBuffer();
  const contentType =
    audioFile.type && audioFile.type.startsWith('audio/')
      ? audioFile.type
      : 'audio/m4a';

  const url = new URL(DEEPGRAM_URL);
  url.searchParams.set('model', 'nova-2');
  url.searchParams.set('smart_format', 'true');
  url.searchParams.set('diarize', 'true');
  url.searchParams.set('punctuate', 'true');
  url.searchParams.set('utterances', 'true');
  url.searchParams.set('detect_language', 'true');

  const deepgramResponse = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': contentType,
    },
    body: Buffer.from(arrayBuffer as ArrayBuffer),
  });

  if (!deepgramResponse.ok) {
    const errorText = await deepgramResponse.text();
    return NextResponse.json(
      { error: 'Deepgram transcription failed.', detail: errorText },
      { status: 502 }
    );
  }

  const deepgramData = await deepgramResponse.json();
  const channel = deepgramData?.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];

  const transcript = typeof alternative?.transcript === 'string' ? alternative.transcript.trim() : '';
  const utterances = normalizeUtterances(alternative?.utterances || []);

  if (!utterances.length && transcript) {
    utterances.push({
      start: 0,
      end: deepgramData?.metadata?.duration ?? 0,
      speaker: 0,
      transcript,
    });
  }

  if (!transcript && !utterances.length) {
    return NextResponse.json(
      { error: 'Deepgram returned empty transcript.', detail: deepgramData },
      { status: 502 }
    );
  }

  return NextResponse.json({
    transcript,
    utterances,
    duration: deepgramData?.metadata?.duration ?? null,
    language: deepgramData?.results?.language ?? null,
  });
}
