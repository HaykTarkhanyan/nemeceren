# Private Google Drive links return a sign-in page with HTTP 200; check downloads by their first bytes, not the status code

**Symptom:** `curl -L --fail` on 5 Drive links from an email (`drive.usercontent.google.com/download?id=...&export=download&confirm=t`) "succeeded" with `http 200`. Each file was saved as `.pdf`, at about 916 KB each:

```
http 200, 916238 bytes, type text/html; charset=utf-8
...
books/...Lehrerhandbuch.pdf: HTML document, ASCII text
<title>Google Drive: Sign-in</title>
```

**Cause:** The files were shared with Hayk's Google account only. Drive answers an unauthenticated request with a 200 sign-in page, not a 401/403. DW's learngerman.dw.com does the same for missing pages (200 for everything), according to the research agents.

**Consequences:**
- After every download, check the first bytes (`%PDF`, `ftyp` for MP4, `PK` for ZIP, `ID3` for MP3) or `file <path>`, and check `content_type`. HTTP 200 plus the expected size is not proof.
- For private Drive files, ask Hayk to download them in the browser (they're logged in), or use an authenticated connector. curl can't do it.
- A 916 KB "PDF" that is really HTML is the typical sign of this.
