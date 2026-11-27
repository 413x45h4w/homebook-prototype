import { useEffect, useState } from 'react';
import { loadClip } from '../lib/audioStore';
import { formatDayTime } from '../lib/time';
import { categoryMeta } from '../lib/types';
import type { VoiceFeedback } from '../lib/voiceFeedback';
import { Stars } from './ui';

export function VoicePlayer({ audioId }: { audioId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    loadClip(audioId)
      .then((clip) => {
        if (cancelled) return;
        if (!clip) {
          setMissing(true);
          return;
        }
        objectUrl = URL.createObjectURL(clip.blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioId]);

  if (missing) return <p className="faint">This clip isn’t stored in this browser.</p>;
  if (!url) return <p className="faint">Loading clip…</p>;
  return <audio controls preload="none" src={url} aria-label="Play voice note" />;
}

export function VoiceNoteList({ notes }: { notes: VoiceFeedback[] }) {
  const ordered = [...notes].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  if (!ordered.length) {
    return <p className="muted">No voice notes yet. A recording or an uploaded memo will stay here, newest at the bottom.</p>;
  }
  return (
    <div className="stack">
      {ordered.map((note) => (
        <article key={note.id} className="card stack voice-note">
          <div className="split">
            <span className="chip">Voice</span>
            <time dateTime={note.createdAt}>{formatDayTime(note.createdAt)}</time>
          </div>
          <p style={{ margin: 0 }}>{note.transcript}</p>
          <div className="cluster">
            {note.rating ? <Stars value={note.rating} /> : null}
            {note.category ? <span className="chip">{categoryMeta(note.category).label}</span> : null}
            <span className="faint">{note.source === 'upload' ? 'Uploaded memo' : 'Recorded in the app'}</span>
          </div>
          <VoicePlayer audioId={note.audioId} />
        </article>
      ))}
    </div>
  );
}
