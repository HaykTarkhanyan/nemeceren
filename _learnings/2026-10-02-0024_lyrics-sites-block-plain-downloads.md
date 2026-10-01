# Lyrics sites block plain downloads; get the text from Hayk or the browser

**Symptom:** while building the first theme lesson (2026-09-30), the three lyrics sites the web search found refused every non-browser request:

```
curl songtexte.com      -> HTTP 202, 0 bytes (bot challenge page)
curl lyricstranslate.com -> HTTP 403
curl letras.com          -> HTTP 403
WebFetch letras.com, offiziellecharts.de -> HTTP 403 Forbidden
```

A browser user-agent on curl made no difference.

**What works:**
- YouTube's oEmbed endpoint identifies a video without a browser: `curl "https://www.youtube.com/oembed?url=<video url>&format=json"` returns the title and channel (that's how "Barfuß Am Klavier - AnnenMayKantereit" and the official Rammstein video were confirmed).
- Facts (year, album, chart position) come from Wikipedia through WebFetch, which isn't blocked.
- For the lyrics themselves: Playwright can read the page, but only when memory allows a second Chrome (FreePhysicalMemory >= 1.5 GB and FreeVirtualMemory >= 2.5 GB). Both times that day it didn't (1.2-1.9 GB virtual free while a build agent ran tests).
- Asking Hayk to paste the lyrics took him seconds both times. Paste from Genius includes junk ("You might also like", other song titles), so strip anything that isn't the song.

**Consequences:** for theme lessons, ask Hayk to paste the text when the browser can't run, and never reconstruct lyrics from memory (`.claude/skills/theme-lesson/SKILL.md`, step 2).
