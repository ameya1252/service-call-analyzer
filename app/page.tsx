'use client';

import React, { useMemo, useRef, useState } from 'react';

type Utterance = {
  start: number;
  end: number;
  speaker: number;
  transcript: string;
};

type AnalysisResponse = {
  callType: {
    label: string;
    rationale: string;
    evidence: { quote: string; timestamp: string }[];
  };
  primaryInsight: string;
  stages: {
    stage: string;
    summary: string;
    startIndex: number | null;
    endIndex: number | null;
    evidence: { quote: string; timestamp: string }[];
  }[];
  salesSignals: { signal: string; interpretation: string; evidence: { quote: string; timestamp: string } }[];
  decisionReadinessSignals: { signal: string; evidence: { quote: string; timestamp: string } }[];
  conversationDynamics: { observation: string; evidence: { quote: string; timestamp: string } | null }[];
  expansionVsAddOns: {
    expansion: { point: string; evidence: { quote: string; timestamp: string } }[];
    addOns: { point: string; evidence: { quote: string; timestamp: string } }[];
  };
  conversionDrivers: { driver: string; evidence: { quote: string; timestamp: string } }[];
  whatActuallyMattered: { insight: string; evidence: { quote: string; timestamp: string } | null }[];
  productProblems: { problem: string }[];
  aiDisclosure: string;
  humanJudgmentNote: string;
  intentionalTradeoffs: string;
  whatWentWell: { point: string; evidence: { quote: string; timestamp: string } }[];
  whatWasMissed: { point: string; evidence: { quote: string; timestamp: string } | null }[];
  recommendations: { action: string; rationale: string; timing: string; evidence: { quote: string; timestamp: string } | null }[];
  nextBestActions: { action: string; timing: string; why: string; how: string }[];
  keyMoments: { type: 'success' | 'risk' | 'opportunity'; timestamp: string; quote: string; takeaway: string }[];
  ifNosoWereLiveHere: { automation: string; trigger: string; outcome: string }[];
};

const REQUIRED_STAGES = [
  'Introduction',
  'Problem Diagnosis',
  'Solution Explanation',
  'Upsell Attempts',
  'Maintenance Plan Offer',
  'Closing & Thank You',
];

const TECHNICIAN_TERMS = [
  'furnace',
  'hvac',
  'compressor',
  'thermostat',
  'duct',
  'filter',
  'igniter',
  'heat exchanger',
  'coil',
  'condenser',
  'refrigerant',
  'tonnage',
  'sear',
  'seer',
  'btu',
  'amp',
  'voltage',
  'warranty',
  'installation',
  'replace',
  'diagnose',
];

function inferSpeakerRoles(utterances: Utterance[]) {
  const speakerStats: Record<number, { words: number; techHits: number; questions: number }> = {};
  utterances.forEach((utt) => {
    const text = utt.transcript.toLowerCase();
    const words = text.split(/\s+/).filter(Boolean);
    if (!speakerStats[utt.speaker]) {
      speakerStats[utt.speaker] = { words: 0, techHits: 0, questions: 0 };
    }
    speakerStats[utt.speaker].words += words.length;
    speakerStats[utt.speaker].questions += (text.match(/\?/g) || []).length;
    TECHNICIAN_TERMS.forEach((term) => {
      if (text.includes(term)) {
        speakerStats[utt.speaker].techHits += 1;
      }
    });
  });

  const speakers = Object.keys(speakerStats).map(Number);
  if (!speakers.length) return {};

  speakers.sort((a, b) => speakerStats[b].words - speakerStats[a].words);
  const topSpeaker = speakers[0];
  const techScore = (id: number) =>
    speakerStats[id].techHits * 2 + speakerStats[id].words / 50 - speakerStats[id].questions;

  const technician = speakers.reduce((best, id) =>
    techScore(id) > techScore(best) ? id : best
  , topSpeaker);

  const roleBySpeaker: Record<number, 'TECHNICIAN' | 'CUSTOMER'> = {};
  speakers.forEach((id) => {
    roleBySpeaker[id] = id === technician ? 'TECHNICIAN' : 'CUSTOMER';
  });

  return roleBySpeaker;
}

function detectRoleByText(text: string) {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const techHits = TECHNICIAN_TERMS.reduce((acc, term) => (lower.includes(term) ? acc + 1 : acc), 0);
  const questionCount = (lower.match(/\?/g) || []).length;
  const shortResponse = words.length <= 6;
  const customerMarkers = ['i want', 'i like', 'i think', 'my wife', 'my husband', 'we should', 'not sure'];

  const customerMarkerHit = customerMarkers.some((marker) => lower.includes(marker));

  if (shortResponse || questionCount > 0 || customerMarkerHit) {
    if (techHits >= 2 && words.length > 20 && !customerMarkerHit) {
      return 'TECHNICIAN';
    }
    return 'CUSTOMER';
  }
  if (techHits >= 2 || words.length > 24) {
    return 'TECHNICIAN';
  }
  return 'CUSTOMER';
}

function buildTurns(utterances: Utterance[]) {
  const speakerRoles = inferSpeakerRoles(utterances);
  const hasDiarization = new Set(utterances.map((utt) => utt.speaker)).size >= 2;

  const turns: LabeledTurn[] = [];
  utterances.forEach((utt, index) => {
    const role = hasDiarization
      ? speakerRoles[utt.speaker] || 'TECHNICIAN'
      : detectRoleByText(utt.transcript);
    const last = turns[turns.length - 1];
    if (!last || last.role !== role) {
      turns.push({
        speakerId: hasDiarization ? utt.speaker : null,
        role,
        text: utt.transcript.trim(),
        startIndex: index,
        endIndex: index,
      });
      return;
    }
    last.text = `${last.text} ${utt.transcript.trim()}`.trim();
    last.endIndex = index;
  });

  return turns;
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return '--:--';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatQuote(quote: string) {
  return `"${quote}"`;
}

function stageBadgeClass(stage: string) {
  switch (stage) {
    case 'Introduction':
      return 'stage-introduction';
    case 'Problem Diagnosis':
      return 'stage-diagnosis';
    case 'Solution Explanation':
      return 'stage-solution';
    case 'Upsell Attempts':
      return 'stage-upsell';
    case 'Maintenance Plan Offer':
      return 'stage-maintenance';
    case 'Closing & Thank You':
      return 'stage-closing';
    default:
      return 'stage-generic';
  }
}

function groupUtterancesByStage(utterances: Utterance[], stages: AnalysisResponse['stages'] | null) {
  if (!utterances.length) return [];
  if (!stages?.length) {
    return [
      {
        stage: 'Transcript',
        summary: 'Ungrouped transcript (analysis not run yet).',
        utterances,
      },
    ];
  }

  const stageByIndex: Record<number, string> = {};
  stages.forEach((stage) => {
    if (stage.startIndex === null || stage.endIndex === null) return;
    for (let i = stage.startIndex; i <= stage.endIndex; i += 1) {
      stageByIndex[i] = stage.stage;
    }
  });

  const grouped: { stage: string; summary?: string; utterances: Utterance[] }[] = [];
  const addGroup = (stageName: string, utt: Utterance) => {
    const last = grouped[grouped.length - 1];
    if (!last || last.stage !== stageName) {
      const summary = stages.find((stage) => stage.stage === stageName)?.summary;
      grouped.push({ stage: stageName, summary, utterances: [utt] });
      return;
    }
    last.utterances.push(utt);
  };

  utterances.forEach((utt, index) => {
    const stage = stageByIndex[index] || 'Unmapped';
    addGroup(stage, utt);
  });

  return grouped;
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'transcribing' | 'analyzing' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [callDurationSeconds, setCallDurationSeconds] = useState<number | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [lastProcessedFile, setLastProcessedFile] = useState<File | null>(null);

  const groupedTranscript = useMemo(
    () => groupUtterancesByStage(utterances, analysis?.stages ?? null),
    [utterances, analysis?.stages]
  );
  const transcriptTurns = useMemo(() => buildTurns(utterances), [utterances]);
  const formatEvidence = (quote: string) => (
    <span className="quote-inline">{formatQuote(quote)}</span>
  );
  const callDateLabel = useMemo(
    () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    []
  );

  const buildAnalysisPlainText = (data: AnalysisResponse) => {
    const lines: string[] = [];
    const addSection = (title: string) => {
      if (lines.length) lines.push('');
      lines.push(title.toUpperCase());
    };
    const addBullets = (items: string[]) => {
      items.forEach((item) => lines.push(`- ${item}`));
    };

    const primarySignal = data.salesSignals[0] || data.decisionReadinessSignals[0];
    const secondarySignalCandidate = data.decisionReadinessSignals[0];
    const secondarySignal =
      secondarySignalCandidate && secondarySignalCandidate.signal !== primarySignal?.signal
        ? secondarySignalCandidate
        : data.salesSignals[1] || data.decisionReadinessSignals[1];

    addSection('Primary blocker to conversion');
    lines.push(data.primaryInsight);

    addSection('Call type');
    lines.push(data.callType.label);
    lines.push(data.callType.rationale);
    if (data.callType.evidence.length) {
      addBullets(data.callType.evidence.map((item) => formatQuote(item.quote)));
    }

    addSection('Top sales signal (high confidence)');
    if (primarySignal) {
      const detail =
        'interpretation' in primarySignal && primarySignal.interpretation
          ? ` — ${primarySignal.interpretation}`
          : '';
      lines.push(`${primarySignal.signal}${detail} (${formatQuote(primarySignal.evidence.quote)})`);
    } else {
      lines.push('No sales signal detected.');
    }

    addSection('Secondary signal (medium confidence)');
    if (secondarySignal) {
      const detail =
        'interpretation' in secondarySignal && secondarySignal.interpretation
          ? ` — ${secondarySignal.interpretation}`
          : '';
      lines.push(`${secondarySignal.signal}${detail} (${formatQuote(secondarySignal.evidence.quote)})`);
    } else {
      lines.push('No secondary signal detected.');
    }

    addSection('Conversation dynamics');
    addBullets(
      data.conversationDynamics.map((item) =>
        item.evidence ? `${item.observation} (${formatQuote(item.evidence.quote)})` : item.observation
      )
    );

    addSection('Expansion vs add-ons');
    lines.push('Expansion sale');
    addBullets(
      data.expansionVsAddOns.expansion.map(
        (item) => `${item.point} (${formatQuote(item.evidence.quote)})`
      )
    );
    lines.push('Add-ons');
    addBullets(
      data.expansionVsAddOns.addOns.map(
        (item) => `${item.point} (${formatQuote(item.evidence.quote)})`
      )
    );

    addSection('Why this call almost converted');
    addBullets(
      data.conversionDrivers.map((item) => `${item.driver} (${formatQuote(item.evidence.quote)})`)
    );

    addSection('What actually mattered in this call');
    addBullets(
      data.whatActuallyMattered.map((item) =>
        item.evidence ? `${item.insight} (${formatQuote(item.evidence.quote)})` : item.insight
      )
    );

    addSection('Product problems surfaced by this call');
    addBullets(data.productProblems.map((item) => item.problem));

    addSection('What went well');
    addBullets(
      data.whatWentWell.map((item) => `${item.point} (${formatQuote(item.evidence.quote)})`)
    );

    addSection('What was missed');
    addBullets(
      data.whatWasMissed.map((item) =>
        item.evidence ? `${item.point} (${formatQuote(item.evidence.quote)})` : item.point
      )
    );

    addSection('Recommendations');
    addBullets(
      data.recommendations.map((item) => {
        const evidence = item.evidence ? ` (${formatQuote(item.evidence.quote)})` : '';
        return `${item.action} — ${item.rationale} (Timing: ${item.timing})${evidence}`;
      })
    );

    addSection('Next best actions');
    addBullets(data.nextBestActions.map((item) => `${item.action} — ${item.timing}. ${item.why} ${item.how}`));

    addSection('Key moments');
    addBullets(
      data.keyMoments.map(
        (item) => `${item.type.toUpperCase()}: ${formatQuote(item.quote)} — ${item.takeaway}`
      )
    );

    addSection('If NOSO were live here');
    addBullets(
      data.ifNosoWereLiveHere.map(
        (item) => `${item.automation} — Trigger: ${item.trigger}. Outcome: ${item.outcome}`
      )
    );

    addSection('AI disclosure');
    lines.push(data.aiDisclosure);

    addSection('Why this required human judgment');
    lines.push(data.humanJudgmentNote);

    addSection('Intentional tradeoffs');
    lines.push(data.intentionalTradeoffs);

    return lines.join('\n');
  };

  const handleCopyAnalysis = async () => {
    if (!analysis) return;
    try {
      const text = buildAnalysisPlainText(analysis);
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 1600);
    } catch (copyError) {
      setCopySuccess(false);
    }
  };

  const canProcess = Boolean(selectedFile);

  const resetResults = () => {
    setTranscript('');
    setUtterances([]);
    setAnalysis(null);
    setError(null);
    setStatus('idle');
    setShowFullTranscript(false);
    setCallDurationSeconds(null);
    setLastProcessedFile(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      resetResults();
    } else {
      setSelectedFile(null);
    }
  };

  const processAudio = async (overrideFile?: File) => {
    if (!canProcess && !overrideFile) return;
    setStatus('transcribing');
    setError(null);
    setAnalysis(null);

    const fileToSend = overrideFile || selectedFile;

    if (!fileToSend) {
      setError('No file selected');
      setStatus('error');
      return;
    }
    setLastProcessedFile(fileToSend);

    try {
      console.log('About to append to FormData:', {
        fileToSend,
        isFile: fileToSend instanceof File,
        isBlob: fileToSend instanceof Blob,
        constructor: fileToSend?.constructor?.name,
      });

      if (!(fileToSend instanceof File) && !(fileToSend instanceof Blob)) {
        console.error('ERROR: fileToSend is not a File or Blob!', fileToSend);
        setError('File selection error - please try selecting the file again');
        setStatus('error');
        return;
      }

      const formData = new FormData();
      formData.append('audio', fileToSend);
      console.log('Client sending:', {
        name: fileToSend.name,
        type: fileToSend.type,
        size: fileToSend.size,
      });
      console.log('FormData audio entry:', formData.get('audio'));

      const transcribeResponse = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!transcribeResponse.ok) {
        const errorText = await transcribeResponse.text();
        throw new Error(errorText || 'Transcription failed.');
      }

      const transcribeData = await transcribeResponse.json();
      setTranscript(transcribeData.transcript || '');
      setUtterances(transcribeData.utterances || []);
      setCallDurationSeconds(typeof transcribeData.duration === 'number' ? transcribeData.duration : null);

      if (!transcribeData.transcript && !(transcribeData.utterances || []).length) {
        setStatus('error');
        setError('Transcription returned no usable text. Please retry or use a different audio file.');
        return;
      }

      setStatus('analyzing');

      const analyzeResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: transcribeData.transcript,
          utterances: transcribeData.utterances,
        }),
      });

      if (!analyzeResponse.ok) {
        const errorText = await analyzeResponse.text();
        throw new Error(errorText || 'Analysis failed.');
      }

      const analysisData = (await analyzeResponse.json()) as AnalysisResponse;
      setAnalysis(analysisData);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  return (
    <main>
      <header className="header">
        <div className="container header-content">
          <div className="brand">
            <div className="logo-mark" aria-hidden="true">
              🎧
            </div>
            <div>
              <div className="logo">Service Call Analyzer</div>
              <div className="tagline">Insight-quality, human-grounded call reviews</div>
            </div>
          </div>
          <div className="header-status">
            <span className={`status-pill ${status}`}>
              <span className="status-dot" aria-hidden="true" />
              {status === 'idle' && 'Ready'}
              {status === 'transcribing' && 'Transcribing'}
              {status === 'analyzing' && 'Analyzing'}
              {status === 'ready' && 'Complete'}
              {status === 'error' && 'Needs attention'}
            </span>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="container">
          <h1>What happened on this call, what mattered, and what should change next time.</h1>
          <p>
            Upload or record a service call to get a full transcript, stage-by-stage analysis, and evidence-backed
            recommendations.
          </p>
        </div>
      </section>

      <section className="container input-section">
        <div className="input-card">
          <div className="input-header">
            <div>
              <h2>Audio input</h2>
              <p>Upload a call or record directly in the browser (demo-friendly, no streaming pipeline).</p>
            </div>
            <div className="input-actions">
              <button className="secondary" type="button" onClick={resetResults}>
                Clear
              </button>
              <button className="primary" type="button" onClick={() => processAudio()} disabled={!canProcess || status === 'transcribing' || status === 'analyzing'}>
                {status === 'transcribing' ? 'Transcribing...' : status === 'analyzing' ? 'Analyzing...' : 'Process call'}
              </button>
            </div>
          </div>

          <div className="input-grid">
          <div className="input-block">
              <label className="input-label" htmlFor="audio-file">Upload audio (.mp3, .m4a, .wav)</label>
              <input
                id="audio-file"
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/x-m4a,audio/mp4"
                onChange={handleFileChange}
              />
              <div className="input-meta">
                {selectedFile ? `Selected: ${selectedFile.name}` : 'No file selected.'}
              </div>
            </div>
          </div>

          {error && (
            <div className="error-banner">
              <div className="error-title">
                <strong>Issue:</strong> {error}
              </div>
              <ul className="error-list">
                <li>Check your API key configuration</li>
                <li>Try a shorter audio file</li>
                <li>Ensure the file is a valid audio format</li>
              </ul>
              {lastProcessedFile && (
                <div className="error-actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => processAudio(lastProcessedFile)}
                    disabled={status === 'transcribing' || status === 'analyzing'}
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="container results-section">
        <div className="results-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Transcript</h3>
              <div className="panel-actions">
                <span className="panel-tag">{showFullTranscript ? 'Full call' : 'Stage highlights'}</span>
                {analysis && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setShowFullTranscript((prev) => !prev)}
                  >
                    {showFullTranscript ? 'Show stage highlights' : 'Show full transcript'}
                  </button>
                )}
              </div>
            </div>
            <div className="panel-body transcript custom-scrollbar">
              {!utterances.length && (
                <div className="empty-state">
                  Upload a call or record directly in the browser to begin analysis.
                </div>
              )}
              {analysis && !showFullTranscript && (
                <div className="transcript-group">
                  <div className="section-header">
                    <span>Key excerpts by stage</span>
                    <span className="rule" />
                  </div>
                  <div className="insight-grid">
                    {REQUIRED_STAGES.map((stageName) => {
                      const stage = analysis.stages.find((entry) => entry.stage === stageName);
                      return (
                        <div key={stageName} className="insight-card">
                          <div className="group-title">
                            <span className={`stage-badge ${stageBadgeClass(stageName)}`}>{stageName}</span>
                          </div>
                          <p className="group-summary">{stage?.summary || 'No evidence found in transcript.'}</p>
                          <ul>
                            {stage?.evidence?.length
                              ? stage.evidence.slice(0, 2).map((item, idx) => (
                                  <li key={`${stageName}-quote-${idx}`}>
                                    {formatEvidence(item.quote)}
                                  </li>
                                ))
                              : <li>No supporting quote available.</li>}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {(!analysis || showFullTranscript) && (
                <div className="transcript-group">
                  {transcriptTurns.map((turn, idx) => (
                    <div key={`turn-${idx}`} className="transcript-line">
                      <div className="transcript-text">{turn.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Analysis</h3>
              <div className="panel-actions">
                <span className="panel-tag">Evidence-based</span>
                {analysis && (
                  <button className="secondary copy-button" type="button" onClick={handleCopyAnalysis}>
                    Copy to clipboard
                    {copySuccess && <span className="copy-tooltip">Copied!</span>}
                  </button>
                )}
              </div>
            </div>
            <div className="panel-body analysis custom-scrollbar">
              {!analysis && (
                <div className="empty-state">
                  Analysis will appear here once the call is processed.
                </div>
              )}
              {analysis && (
                <>
                  <div className="meta-bar">
                    <span className="meta-pill">{formatDuration(callDurationSeconds)}</span>
                    <span className="meta-pill">{callDateLabel}</span>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>Primary blocker to conversion</span>
                      <span className="rule" />
                    </div>
                    <p className="analysis-subtext">{analysis.primaryInsight}</p>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>Call type</span>
                      <span className="rule" />
                    </div>
                    <p>
                      <strong>{analysis.callType.label}</strong>
                    </p>
                    <p className="analysis-subtext">{analysis.callType.rationale}</p>
                    <ul>
                      {analysis.callType.evidence.map((item, idx) => (
                        <li key={`calltype-${idx}`}>{formatEvidence(item.quote)}</li>
                      ))}
                    </ul>
                  </div>

                  {(() => {
                    const primarySignal = analysis.salesSignals[0] || analysis.decisionReadinessSignals[0];
                    const secondarySignalCandidate = analysis.decisionReadinessSignals[0];
                    const secondarySignal =
                      secondarySignalCandidate && secondarySignalCandidate.signal !== primarySignal?.signal
                        ? secondarySignalCandidate
                        : analysis.salesSignals[1] || analysis.decisionReadinessSignals[1];

                    return (
                      <>
                        <div className="analysis-card">
                          <div className="section-header">
                            <span>Top sales signal (high confidence)</span>
                            <span className="rule" />
                          </div>
                          {primarySignal ? (
                            <p className="analysis-subtext">
                              <strong>{primarySignal.signal}</strong> — {primarySignal.interpretation} —{' '}
                              {formatEvidence(primarySignal.evidence.quote)}
                            </p>
                          ) : (
                            <p className="analysis-subtext">No sales signal detected.</p>
                          )}
                        </div>

                        <div className="analysis-card">
                          <div className="section-header">
                            <span>Secondary signal (medium confidence)</span>
                            <span className="rule" />
                          </div>
                          {secondarySignal ? (
                            <p className="analysis-subtext">
                              <strong>{secondarySignal.signal}</strong> — {secondarySignal.interpretation} —{' '}
                              {formatEvidence(secondarySignal.evidence.quote)}
                            </p>
                          ) : (
                            <p className="analysis-subtext">No secondary signal detected.</p>
                          )}
                        </div>
                      </>
                    );
                  })()}

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>Conversation dynamics</span>
                      <span className="rule" />
                    </div>
                    <ul>
                      {analysis.conversationDynamics.map((item, idx) => (
                        <li key={`dynamics-${idx}`}>
                          {item.observation}
                          {item.evidence ? <> — {formatEvidence(item.evidence.quote)}</> : null}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>Expansion vs add-ons</span>
                      <span className="rule" />
                    </div>
                    <div className="stage-block">
                      <div className="stage-title">Expansion sale</div>
                      <ul>
                        {analysis.expansionVsAddOns.expansion.map((item, idx) => (
                          <li key={`expansion-${idx}`}>
                            {item.point} — {formatEvidence(item.evidence.quote)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="stage-block">
                      <div className="stage-title">Add-ons</div>
                      <ul>
                        {analysis.expansionVsAddOns.addOns.map((item, idx) => (
                          <li key={`addons-${idx}`}>
                            {item.point} — {formatEvidence(item.evidence.quote)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>Why this call almost converted</span>
                      <span className="rule" />
                    </div>
                    <ul>
                      {analysis.conversionDrivers.map((item, idx) => (
                        <li key={`convert-${idx}`}>
                          {item.driver} — {formatEvidence(item.evidence.quote)}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>What actually mattered in this call</span>
                      <span className="rule" />
                    </div>
                    <ul>
                      {analysis.whatActuallyMattered.map((item, idx) => (
                        <li key={`matter-${idx}`}>
                          {item.insight}
                          {item.evidence ? <> — {formatEvidence(item.evidence.quote)}</> : null}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>Product problems surfaced by this call</span>
                      <span className="rule" />
                    </div>
                    <ul>
                      {analysis.productProblems.map((item, idx) => (
                        <li key={`problem-${idx}`}>{item.problem}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="insight-row">
                    <div className="analysis-card">
                      <div className="section-header">
                        <span>What went well</span>
                        <span className="rule" />
                      </div>
                      <ul>
                        {analysis.whatWentWell.map((item, idx) => (
                          <li key={`well-${idx}`}>
                          {item.point} — {formatEvidence(item.evidence.quote)}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="analysis-card">
                      <div className="section-header">
                        <span>What was missed</span>
                        <span className="rule" />
                      </div>
                      <ul>
                      {analysis.whatWasMissed.map((item, idx) => (
                        <li key={`missed-${idx}`}>
                          {item.point}
                          {item.evidence ? <> — {formatEvidence(item.evidence.quote)}</> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>Recommendations</span>
                      <span className="rule" />
                    </div>
                    <ul>
                      {analysis.recommendations.map((item, idx) => (
                        <li key={`rec-${idx}`}>
                          <strong>{item.action}</strong> — {item.rationale} (Timing: {item.timing})
                          {item.evidence ? <> — {formatEvidence(item.evidence.quote)}</> : null}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>Next best actions</span>
                      <span className="rule" />
                    </div>
                    <ul>
                      {analysis.nextBestActions.map((item, idx) => (
                        <li key={`next-${idx}`}>
                          <strong>{item.action}</strong> — {item.timing}. {item.why} {item.how}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>Key moments</span>
                      <span className="rule" />
                    </div>
                    <ul>
                      {analysis.keyMoments.map((item, idx) => (
                        <li key={`moment-${idx}`}>
                          <strong>Moment</strong> — {item.type} — {formatEvidence(item.quote)} — {item.takeaway}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>If NOSO were live here</span>
                      <span className="rule" />
                    </div>
                    <ul>
                      {analysis.ifNosoWereLiveHere.map((item, idx) => (
                        <li key={`noso-${idx}`}>
                          <strong>{item.automation}</strong> — Trigger: {item.trigger}. Outcome: {item.outcome}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>AI disclosure</span>
                      <span className="rule" />
                    </div>
                    <p className="analysis-subtext">{analysis.aiDisclosure}</p>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>Why this required human judgment</span>
                      <span className="rule" />
                    </div>
                    <p className="analysis-subtext">{analysis.humanJudgmentNote}</p>
                  </div>

                  <div className="analysis-card">
                    <div className="section-header">
                      <span>Intentional tradeoffs</span>
                      <span className="rule" />
                    </div>
                    <p className="analysis-subtext">{analysis.intentionalTradeoffs}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
