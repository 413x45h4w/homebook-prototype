import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveClip } from '../lib/audioStore';
import { canRecordAudio, liveCaptionsAvailable, speechRecognitionCtor, type BrowserSpeechRecognition } from '../lib/speech';
import { transcribeBlob } from '../lib/transcribe';
import { uid } from '../lib/time';
import { useStore } from '../lib/store';
import { CATEGORIES, type CategoryId } from '../lib/types';
import { createVoiceFeedback, isAudioFile, pickRecorderMime } from '../lib/voiceFeedback';
import { providers } from '../data/load';
import { Field, Stars, useToast } from './ui';

const MAX_RECORD_SEC = 10 * 60;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

interface HeldClip {
  blob: Blob;
  mimeType: string;
  source: 'recording' | 'upload';
  durationSec?: number;
}

export function VoiceFeedbackForm({
  spId: initialSpId = '',
  visitId,
  heading = 'Voice note',
}: {
  spId?: string;
  visitId?: string;
  heading?: string;
}) {
  const { state, addVoiceFeedback } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [spId, setSpId] = useState(initialSpId);
  const [transcript, setTranscript] = useState('');
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState<CategoryId | ''>('');
  const [phase, setPhase] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [clip, setClip] = useState<HeldClip | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingRef = useRef(false);
  const baseRef = useRef('');
  const finalRef = useRef('');
  const transcriptRef = useRef('');
  const elapsedRef = useRef(0);
  const previewRef = useRef<string | null>(null);
  transcriptRef.current = transcript;
  elapsedRef.current = elapsed;

  useEffect(() => {
    setSpId(initialSpId);
  }, [initialSpId]);

  useEffect(() => {
    return () => {
      recordingRef.current = false;
      recognitionRef.current?.abort();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      if (seconds >= MAX_RECORD_SEC) void stopRecording(true);
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  const rememberClip = (next: HeldClip) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(next.blob);
    previewRef.current = url;
    setClip(next);
    setPreviewUrl(url);
  };

  const stopRecording = async (hitLimit = false) => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    recognitionRef.current?.stop();
    const recorder = recorderRef.current;
    const blob = await new Promise<Blob>((resolve) => {
      if (!recorder || recorder.state === 'inactive') {
        resolve(new Blob(chunksRef.current, { type: recorder?.mimeType || 'audio/webm' }));
        return;
      }
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      recorder.stop();
    });
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setPhase('idle');
    if (blob.size > 0) {
      rememberClip({
        blob,
        mimeType: blob.type || 'audio/webm',
        source: 'recording',
        durationSec: elapsedRef.current,
      });
    }
    if (hitLimit) {
      setStatus('Stopped at 10 minutes. You can transcribe this clip, edit the text, and send it.');
    } else {
      setStatus(
        liveCaptionsAvailable()
          ? 'Recording stopped. Edit the words, or transcribe the clip on this device if the captions missed something.'
          : 'Recording stopped. Transcribe it on this device, or type the note yourself.',
      );
    }
  };

  const startRecording = async () => {
    if (!canRecordAudio()) {
      setStatus('This browser can’t record from the microphone. Upload a voice memo instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = pickRecorderMime((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      baseRef.current = transcriptRef.current.trim() ? `${transcriptRef.current.trim()} ` : '';
      finalRef.current = '';
      recordingRef.current = true;
      setElapsed(0);
      setPhase('recording');
      setStatus(liveCaptionsAvailable() ? 'Listening… the transcript updates as you speak.' : 'Recording. Live captions aren’t available here; transcribe the clip when you stop.');
      recorder.start(250);
      startCaptions();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStatus('Microphone access was blocked. Allow the mic in the browser settings, or upload a voice memo.');
      } else if (name === 'NotFoundError') {
        setStatus('No microphone was found. You can upload a voice memo instead.');
      } else {
        setStatus('The microphone could not start. You can upload a voice memo instead.');
      }
    }
  };

  const startCaptions = () => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const piece = event.results[index][0]?.transcript ?? '';
        if (event.results[index].isFinal) finalText += piece;
        else interim += piece;
      }
      finalRef.current = finalText;
      setTranscript(`${baseRef.current}${finalText}${interim}`.replace(/\s+/g, ' ').trim());
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') setStatus('Speech recognition was blocked. The recording is still going; transcribe it when you stop.');
      if (event.error === 'no-speech') setStatus('Listening… nothing to caption yet.');
    };
    recognition.onend = () => {
      if (!recordingRef.current) return;
      baseRef.current = `${baseRef.current}${finalRef.current}`.replace(/\s+/g, ' ');
      if (baseRef.current && !baseRef.current.endsWith(' ')) baseRef.current += ' ';
      finalRef.current = '';
      try {
        recognition.start();
      } catch {
        setStatus('Live captions paused. The recording is still going.');
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setStatus('Live captions could not start. The recording is still going.');
    }
  };

  const transcribeHeld = async (target: HeldClip) => {
    setPhase('transcribing');
    setProgress(null);
    try {
      const result = await transcribeBlob(target.blob, (update) => {
        setStatus(update.label);
        setProgress(update.percent);
      });
      if (result.truncated) setStatus('Transcribed the first 10 minutes. You can edit the text before sending.');
      if (!result.text) {
        setStatus('No words came back. Play the clip and type the note yourself, then send it.');
      } else {
        setTranscript((current) => (current.trim() ? `${current.trim()} ${result.text}` : result.text));
        if (!result.truncated) setStatus('Transcript ready. Edit it if anything is off, then send it.');
      }
    } catch {
      setStatus('The on-device model couldn’t run. Check your connection for the first download, or type the note yourself.');
    } finally {
      setPhase('idle');
      setProgress(null);
    }
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (!isAudioFile(file)) {
      setStatus('Choose an audio file, such as m4a, mp3, wav, or webm.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus('That memo is over 25 MB. Trim it and try again. The in-browser model handles about 10 minutes.');
      return;
    }
    const next = { blob: file, mimeType: file.type || 'audio/mp4', source: 'upload' as const };
    rememberClip(next);
    await transcribeHeld(next);
  };

  const submit = async () => {
    if (!clip) {
      toast('Record or upload a voice memo first.');
      return;
    }
    const built = createVoiceFeedback({
      spId,
      transcript,
      audioId: uid('aud'),
      mimeType: clip.mimeType,
      source: clip.source,
      rating,
      category: category || undefined,
      visitId,
      durationSec: clip.durationSec,
    });
    if (!built.ok) {
      toast(built.reason);
      return;
    }
    setBusy(true);
    try {
      await saveClip(built.note.audioId, clip.blob, clip.mimeType);
      addVoiceFeedback(built.note);
      const name = providers.find((provider) => provider.id === built.note.spId)?.name.split(' ')[0] ?? 'them';
      toast(`Voice note saved for ${name}`);
      navigate(`/providers/${built.note.spId}`);
    } catch {
      toast('The recording couldn’t be stored in this browser.');
    } finally {
      setBusy(false);
    }
  };

  if (state.persona !== 'customer') {
    return <div className="notice">Switch to Alex to leave a voice note. Providers can play the ones already saved.</div>;
  }

  return (
    <section className="card stack" id="voice">
      <div>
        <p className="kicker">Voice</p>
        <h2 style={{ margin: '4px 0' }}>{heading}</h2>
        <p className="muted" style={{ margin: 0 }}>
          Record here, or upload a voice memo. The words land in the box so you can fix them before they become feedback.
          Live captions use the browser where it has them. Otherwise Homebook transcribes the clip on this device.
        </p>
      </div>
      <div className="cluster">
        {phase === 'recording' ? (
          <button type="button" className="btn btn-danger" onClick={() => void stopRecording(false)}>
            Stop · {formatClock(elapsed)}
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => void startRecording()} disabled={phase === 'transcribing'}>
            Record memo
          </button>
        )}
        <label className={`btn btn-ghost${phase === 'transcribing' ? ' is-disabled' : ''}`}>
          Upload voice memo
          <input
            type="file"
            accept="audio/*,.m4a,.mp3,.wav,.webm,.caf,.aac"
            hidden
            disabled={phase === 'transcribing'}
            onChange={(event) => {
              void onFile(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />
        </label>
        {clip && phase !== 'recording' ? (
          <button type="button" className="btn btn-soft" onClick={() => void transcribeHeld(clip)} disabled={phase === 'transcribing'}>
            Transcribe on this device
          </button>
        ) : null}
      </div>
      {phase === 'recording' ? (
        <p className="rec-live" role="status">
          <span className="rec-dot" aria-hidden />
          Recording
        </p>
      ) : null}
      {status ? (
        <p className="muted" role="status">
          {status}
        </p>
      ) : null}
      {phase === 'transcribing' ? (
        <div className="bar" aria-hidden>
          <span style={{ width: progress == null ? '35%' : `${progress}%` }} />
        </div>
      ) : null}
      {!liveCaptionsAvailable() ? (
        <p className="faint">Live captions aren’t in this browser. Record or upload, then use “Transcribe on this device.”</p>
      ) : null}
      <Field label="Transcript">
        <textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder="Words from the memo show up here. Edit them before sending."
          aria-live="polite"
        />
      </Field>
      {previewUrl ? <audio controls src={previewUrl} aria-label="Preview voice memo" /> : null}
      <label className="field">
        <span className="field-label">Provider</span>
        <select value={spId} onChange={(event) => setSpId(event.target.value)}>
          <option value="">Choose a provider</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name} · {provider.service}
            </option>
          ))}
        </select>
      </label>
      <div className="stack">
        <span className="field-label">Rating, if you want one</span>
        <div className="cluster">
          <Stars value={rating} onChange={setRating} />
          {rating > 0 ? (
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setRating(0)}>
              Clear rating
            </button>
          ) : null}
        </div>
      </div>
      <label className="field">
        <span className="field-label">Category, if it belongs in the house file</span>
        <select value={category} onChange={(event) => setCategory(event.target.value as CategoryId | '')}>
          <option value="">No category</option>
          {CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn" onClick={() => void submit()} disabled={busy || phase === 'recording' || phase === 'transcribing'}>
        {busy ? 'Saving…' : 'Submit voice feedback'}
      </button>
    </section>
  );
}

function formatClock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
