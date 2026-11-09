# An expression-bodied useEffect crashed only on the phone: window.scrollTo returns a Promise since Chrome 149/150

**Symptom:** "Something broke on this page: l is not a function" on `#/daily`, only on Hayk's Android phone (8-9 Nov 2026). It never reproduced on the desktop, across:
- all routes, on dev and on the live site;
- bots clicking through the mix and every game;
- a copy of Hayk's progress in the test account;
- a faked German voice and speech recognition.

**How it was found:** the error box's "Details for Claude" (route + stack frames). The top frame, `index-BIwmpk-7.js:9:95443`, was fetched from the live site and read:

```js
function jl(e,t,n){ ... var o=r.inst,s=o.destroy;if(s!==void 0){o.destroy=void 0, ... l=s;try{l()}catch(e){bf(i,c,e)} ...
```

That is React's passive-effect unmount. It calls an effect's return value whenever it is not undefined.

**Cause:** `useEffect(() => window.scrollTo(0, 0), [])` in Mistakes replay. Chrome 149/150 shipped "Programmatic Scroll Promises", so `scrollTo` returns a Promise and the effect returned it. At unmount (the next mistake card, or the mix moving on), React's production build called the Promise.

**Why it hid:**
- Playwright's Chromium 145 still returns undefined: `typeof window.scrollTo(0,0)` printed `undefined`.
- React's dev build checks the type before calling.

**Disproven theories on the way:** a missing callback prop in the hands-free mic code; a `useSyncExternalStore` subscribe returning a Set; a function-table lookup with a missing key; the listen-and-pick step; data-dependent rendering.

**Fix and guard:** block bodies (`useEffect(() => { window.scrollTo(0, 0) }, [])`). `app/src/lib/effects.test.ts` fails on any expression-bodied effect whose expression is not itself a cleanup; checked: it names the old line. DECISIONS.md #108.

**Lessons:**
- An effect returns its cleanup, and browser APIs can start returning values. Never write `useEffect(() => someCall())`.
- For a phone-only crash, get the stack first (a details box with route + frames), then fetch the exact live bundle and read the position. That beat hours of guessing.
