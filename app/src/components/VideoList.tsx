// A lesson's YouTube videos (DECISIONS.md #74). Each shows its thumbnail and loads the player only on a click,
// from youtube-nocookie.com, so opening a lesson loads nothing from YouTube but the thumbnails.
import { useState } from 'react'
import type { Lesson } from '../content/schema.ts'

type Video = NonNullable<Lesson['videos']>[number]

export function VideoList({ videos }: { videos: Video[] }) {
  return (
    <div className="lesson-videos">
      {videos.map((v) => (
        <VideoItem key={v.id} video={v} />
      ))}
    </div>
  )
}

function VideoItem({ video }: { video: Video }) {
  const [playing, setPlaying] = useState(false)
  return (
    <figure className="video">
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
      <figcaption className="small">
        <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer">
          {video.title}
        </a>{' '}
        <span className="muted">({video.minutes} min)</span>
      </figcaption>
    </figure>
  )
}
