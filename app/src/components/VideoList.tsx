// A lesson's YouTube videos (DECISIONS.md #74). Each shows its thumbnail and loads the player only on a click,
// from youtube-nocookie.com, so opening a lesson loads nothing from YouTube but the thumbnails.
// A video with notes gets a folded "Read instead": its content in short, for reading instead of watching.
import { useState } from 'react'
import type { LessonVideo, VideoNotes } from '../content/schema.ts'
import { GermanText, GlossScope } from './GermanText.tsx'
import { RichText } from './RichText.tsx'
import { Speaker } from './Speaker.tsx'

export function VideoList({ videos }: { videos: LessonVideo[] }) {
  return (
    <div className="lesson-videos">
      {videos.map((v) => (
        <VideoItem key={v.id} video={v} />
      ))}
    </div>
  )
}

function VideoItem({ video }: { video: LessonVideo }) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className={`video${playing ? ' playing' : ''}`}>
      <div className="video-media">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button type="button" className="video-thumb" onClick={() => setPlaying(true)} aria-label={`Play: ${video.title}`}>
            <img src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`} alt="" loading="lazy" />
            <span className="video-play" aria-hidden="true">
              ▶
            </span>
          </button>
        )}
      </div>
      <div className="video-caption small">
        <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer">
          {video.title}
        </a>{' '}
        <span className="muted">({video.minutes} min)</span>
      </div>
      {video.notes && <NotesView notes={video.notes} />}
    </div>
  )
}

/** Folded by default: the points as a list, then the key phrases with speaker buttons and word popups. */
function NotesView({ notes }: { notes: VideoNotes }) {
  return (
    <details className="video-notes">
      <summary>Read instead</summary>
      <GlossScope surface={{ kind: 'page' }}>
        <RichText text={notes.points.map((p) => `- ${p}`).join('\n')} />
        <p className="video-notes-label">Key phrases</p>
        <ul className="video-phrases">
          {notes.phrases.map((p, i) => (
            <li key={i}>
              <Speaker text={p.de} />
              <div>
                <span lang="de">
                  <GermanText text={p.de} />
                </span>
                <div className="muted">{p.en}</div>
              </div>
            </li>
          ))}
        </ul>
        {notes.extra && (
          <div className="small">
            <RichText text={`**Also in the video:** ${notes.extra}`} />
          </div>
        )}
      </GlossScope>
    </details>
  )
}
