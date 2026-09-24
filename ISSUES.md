# RCIC Issues Log

Living document of known collaboration/canvas bugs: symptom, root cause, and how we address them.

| Status | Meaning |
|--------|---------|
| Fixed | Addressed in the current codebase |
| Open | Still under investigation or deferred |

---

## ISS-001 — Objects disappear when clicked or moved

**Symptom:** Sticky notes, text, and other objects briefly or permanently vanish when selected or dragged.

**Root causes:**

1. **Drag vs Yjs store race.** Optimistic drag positions live in `CanvasApp.liveObjects`, but every Yjs write (including physics updates on *other* objects) calls `setObjects()`, which replaces the whole map and reconciles views. The dragged object can snap back to a stale store position; viewport culling then sets `visible = false` if bounds checks fail (including when `x`/`y` are non-finite).
2. **Text has no background.** Text objects are Pixi `Text` only. Opening the DOM editor calls `setLabelHidden(true)` immediately; if the textarea mounts late or is mis-positioned, the object looks gone.
3. **Physics fling.** A short drag that exceeds the old ~80 px/s throw threshold flings the object far off-screen, which feels like disappearance until you pan or use the mini-map.

**Fix:**

- Skip store overwrite of the actively dragged/resized object in `reconcile` / `setObjects`; keep pending local transform.
- Cull guard: if position is non-finite, keep the view visible; coerce finite `x`/`y`/`w`/`h`/`rotation` in `RoomStore` writes.
- Draw a light placeholder rect on text/sticky while `labelHidden`.
- Raise throw threshold to ~400 px/s and only throw when physics is enabled on that object.

**Status:** Fixed

---

## ISS-002 — False “joined” / “left” toasts

**Symptom:** Toasts say a collaborator left and rejoined even though they never left the room.

**Root cause:** The awareness `change` handler diffs peers on every cursor/viewport/selection update. A peer can briefly drop out of `readPeers()` when their awareness entry exists but `user` is missing (partial update), or during websocket reconnect—producing a leave toast followed by a join toast.

**Fix:**

- Count a peer only when `state.user?.name` is set.
- Debounce leave toasts by 2 seconds (cancel if the peer reappears).
- Suppress presence toasts while the provider status is not `connected`, and for the first second after sync.

**Status:** Fixed

---

## ISS-003 — New objects appear at the extreme upper-left

**Symptom:** When a collaborator adds an object, it shows up at the far upper-left of the board (often near world origin) instead of under their cursor / in view for others.

**Root cause:** New joiners often keep a camera near world `(0,0)` while existing content lives elsewhere. Placements at click or viewport center therefore land near the origin. Remote users panned to the real content never see the new object under the creator’s cursor.

**Fix:**

- Validate finite placement coords; fall back to viewport center.
- On first sync with existing objects, call `fitToContent()` once so newcomers see the board.
- When a remote create lands outside your viewport, show a toast with a **Show** action that centers the camera on that object.

**Status:** Fixed

---

## ISS-004 — Mini-map does not show objects clearly

**Symptom:** Objects on the mini-map are tiny or invisible; the map is dominated by large peer viewports.

**Root cause:** World bounds inflate with peer viewports, collapsing the scale so markers become 2px specks. Text used low-contrast gray.

**Fix:**

- Compute bounds from objects first (with pad); expand by viewports only up to ~3× the object AABB.
- Minimum marker size 6px; type-colored fills with a 1px border.

**Status:** Fixed

---

## ISS-005 — New board always opens in a new browser tab

**Symptom:** Creating a board from inside a room always called `window.open(..., '_blank')`, forcing a separate browser tab and making multi-board work awkward.

**Root cause:** Product choice in the first UX pass—each tab was a full session, which worked but was the wrong default for switching boards.

**Fix:**

- Default: create the room and `navigate` in the **same** window; register it on an in-app board tab strip (`sessionStorage`).
- Optional: **Shift+click** the Plus button (or “Open in new browser tab”) still uses `window.open`.

**Status:** Fixed

---

## ISS-006 — Blank screen: only board tab visible

**Symptom:** After in-app board tabs shipped, the page showed only the “Untitled board” tab strip and a blank gray area—no canvas, toolbar, or room chrome.

**Root cause:** An infinite React update loop. `App` passed an inline `onRoomName={(name) => …}` into `Room`, and `Room`’s session `useEffect` listed `onRoomName` as a dependency. Each meta/name sync called `onRoomName` → `setTabs` → re-render → new callback → effect teardown/re-init → again. React reported “Maximum update depth exceeded,” the Pixi session never stayed alive, and `ready` UI never painted.

**Fix:**

- Stabilize `onRoomName` with `useCallback` in `App`; pass the stable function (with `roomId` as an argument).
- Keep `onRoomName` in a ref inside `Room` so the session effect does not depend on it.
- Only `setTabs` when the tab list or name actually changes.
- Guard canvas `init` with `.catch` so a boot error still surfaces room chrome.

**Status:** Fixed

---

## ISS-007 — Mini-map shows object, main canvas looks empty

**Symptom:** At normal zoom (~100%), the mini-map shows object markers inside the current viewport, but the main Pixi canvas appears blank.

**Root cause:** The mini-map reads Yjs `x/y`, while the stage draws `ObjectView.root` which can be overridden each frame by Matter.js ownership (`localOverride`). After a gentle drag, `settle()` called `own()` and left the body owned with a pose that could diverge from the store. Culling also used store coordinates, so a sprite snapped elsewhere could be marked `visible = false` while the mini-map still painted the store position.

**Fix:**

- Gentle drop writes the final pose and **releases ownership immediately** (no lingering `own()` at zero velocity).
- `getOwnedPosition` only returns a pose when the body is dynamic and moving above a tiny speed epsilon.
- Cull using **rendered** `root.x/y`; always force visible for selected / actively dragged ids.
- Cap extreme coordinates on write so one flung object cannot poison later camera fits.

**Status:** Fixed

---

## ISS-008 — Switching board tabs resets / zooms the camera

**Symptom:** Switching between in-app board tabs zooms out or recenters unexpectedly, losing the user’s pan/zoom.

**Root cause:** Each tab remounts `<Room key={roomId}>`, and init/sync always called `fitToContent()`, discarding the previous camera.

**Fix:**

- Persist `{ x, y, scale }` per room in `sessionStorage` (`rcic-camera-<roomId>`).
- Restore on mount when present; call `fitToContent()` only when there is no saved camera and the board has objects.
- Manual “Zoom to fit” unchanged.

**Status:** Fixed

---

## ISS-009 — Commenting / clean-code standards

**Symptom:** Important sync/physics/camera intent was under-documented for extension.

**Fix:** Added [CODING_STANDARDS.md](./CODING_STANDARDS.md) and applied file/section comments across web, server, and shared packages (why over what).

**Status:** Fixed

---

## ISS-010 — Performance with 100+ objects and multiple collaborators

**Symptom:** Full reconcile + `JSON.stringify` dirty keys on every store update risk frame hitches as boards grow.

**Fix:**

- Incremental reconcile for changed object ids (full pass only on first paint / large gaps).
- Cheap ObjectView fingerprint instead of `JSON.stringify` of full payloads.
- Physics writes skip sub-pixel deltas; frustum culling kept so off-screen roots stay invisible to Pixi.

**Verification notes:** Create ~120 stickies across two browser sessions; drag and enable physics. Expect interactive frame times without multi-second UI stalls.

**Status:** Fixed

---

## ISS-011 — Tab switch / new board feels janky

**Symptom:** Switching in-app board tabs or creating a new board remounted the whole Room (Yjs + Pixi + physics), causing a flash and camera races.

**Root cause:** `<Room key={roomId}>` destroyed the previous session on every navigate.

**Fix:**

- Mount one `Room` per open tab; hide inactive slots with `visibility` (not `display: none`).
- `CanvasApp.setActive` pauses ticker/input on inactive boards and resumes + resizes on activate.
- Apply saved camera only after Pixi `init` succeeds.
- App owns new-board creation so the tab strip updates before navigation.

**Status:** Fixed

---

## ISS-012 — Shapes library modal

**Symptom:** Only three shape tools (rect/ellipse/triangle) via a tiny flyout.

**Fix:**

- FigJam-style left **Shapes** panel: search, accordion categories (Basic / Connectors / Flowchart / Advanced).
- Expanded `ShapeKind` catalog; place via `tool: 'shape'` + `pendingShapeKind`.
- Connectors are free-floating line/arrow shapes (not linked object-to-object edges).
- Pixi draw + SVG export share geometry helpers.

**Status:** Fixed

---

## ISS-013 — Multi-select / marquee

**Symptom:** Select tool could only select one object; no drag-to-highlight.

**Fix:** Marquee on empty-canvas drag; Shift+click toggle; group drag and Delete for all selected ids.

**Status:** Fixed

---

## ISS-014 — Linked connectors, ports, quick-add

**Symptom:** Connectors were free-floating strokes, not edges between shapes.

**Fix:** `ObjectType: 'connector'` with `from`/`to` ports and editable mid joint; hover ports; click quick-adds twin + curve; drag port-to-port links shapes. Catalog connector icons enter connect mode.

**Status:** Fixed

---

## ISS-015 — Four-corner resize and rotate

**Symptom:** Only one SE resize handle; no rotate UI.

**Fix:** Four corner handles (opposite corner fixed) and a top rotate handle writing `CanvasObject.rotation`.

**Status:** Fixed

---

## ISS-016 — Shapes modal toggle

**Symptom:** Toolbar shapes button only opened the modal.

**Fix:** Button toggles open/closed.

**Status:** Fixed

---

## ISS-017 — Edge-hover rotate

**Symptom:** Rotation only worked from the north stem handle; hovering the selection box edge did nothing.

**Fix:**

- Mid-edge hit bands on the outer AABB (corners still resize; ports still win on shapes).
- Idle cursor shows grab on rotate edges/handle and nwse/nesw on corners.
- Pointer-down on an outer edge starts the existing atan2 rotate drag.
- Connectors and comments stay non-rotatable.

**Status:** Fixed

---

## ISS-018 — Rich text formatting

**Symptom:** Text/sticky editing was plain textarea only — no fonts, sizes, or inline marks.

**Fix:**

- `data.html` (sanitized) plus plain `text` fallback; optional `fontSize` / `fontFamily` / `align`.
- FigJam-style format bar: five fonts, size presets + numeric input, bold, strike, link, bullets, align.
- Canvas rasterizes HTML to a texture on paint; export includes rich or flattened text.

**Status:** Fixed

---

## ISS-019 — Comment objects

**Symptom:** No collaborative comment pins or thread list on the board.

**Fix:**

- New `ObjectType: 'comment'` (pin + thread data, physics off).
- Toolbar Comment control immediately after Audio; click places a pin and opens the input pill.
- Comments panel (search + list); minimap shows pins as dots.

**Status:** Fixed

---

## ISS-020 — Section objects

**Symptom:** No way to visually group shapes/text into named regions on the board.

**Fix:**

- New `ObjectType: 'section'` with title pill, soft frame, physics off.
- Spatial membership: centers inside the section AABB move with the section; drag in/out to join/leave.
- Toolbar Section tool (Shift+S); double-click renames title.
- Sections draw under content; hit-test prefers nested objects.

**Status:** Fixed

---

## ISS-021 — Comment pin polish, stick, z-order

**Symptom:** Comment pins looked sharp; pins did not follow hosts; comments could sit under shapes.

**Fix:**

- Smooth teardrop pin (Pixi + SVG overlay).
- `anchorId` / `anchorOffset` when placed on an object; sync keeps pin glued.
- Visual z-index floor so comments always render on top.

**Status:** Fixed

---

## ISS-022 — Degree rotation input

**Symptom:** Rotation only via drag handle; no numeric degrees control.

**Fix:** Selection panel degree input (0–360°) for rotatable objects.

**Status:** Fixed

---

## ISS-023 — Hand tool rename and pan fix

**Symptom:** Tooltip said “Pan”; hand-tool drag did not pan (`maybe-pan` never became `pan`).

**Fix:** Tooltip “Hand tool (H)”; promote `maybe-pan` → `pan` after a small move threshold.

**Status:** Fixed

---

## ISS-024 — Docker, tests, architecture docs

**Symptom:** No single-command deploy, no automated race/load tests, and no architecture diagram for operators.

**Fix:**

- Env-aware client URLs + Vite/nginx same-origin proxy; server `DATA_DIR` for snapshots.
- `docker compose up --build` (nginx web + Fastify server + `rcic-data` volume).
- Vitest: unit, offline/live race, load/perf suites; README runbook + edge-case checklist.
- `docs/architecture.jpg` linked from README.

**Status:** Fixed

---

## ISS-025 — Join modal could not be cancelled

**Symptom:** Creating or opening a board forced a user through identity setup with no way to return.

**Fix:** Added X, Escape, and backdrop cancellation; App closes the current board tab and returns to the landing page or previous board.

**Status:** Fixed

---

## ISS-026 — Placement and physics interactions felt inconsistent

**Symptom:** Escape did not fully disarm tools, missed connectors left transient state, throws had a hard speed cliff, and fields only ran after local ownership began.

**Fix:** Escape and connector completion return to Select, connector styles remain highlighted, throws use a softer threshold and predictable damping, and attract/repel fields activate nearby bodies without requiring a prior throw.

**Status:** Fixed

---

## ISS-027 — Comment pins could not change hosts

**Symptom:** A comment stayed tied to its original host when dragged and offsets did not follow host rotation.

**Fix:** Comment drag-end now re-pins to an eligible object or unpins on empty canvas. Offsets are stored in host-local coordinates and transformed with host rotation.

**Status:** Fixed

---

## ISS-028 — Marker, highlighter, and eraser

**Symptom:** The board had no freehand annotation tool.

**Fix:** Added collaborative, non-physical `ink` objects; a marker flyout with pen, highlighter, eraser, thin/thick sizes, and colors; live stroke preview; whole-stroke erasing; SVG export and minimap rendering.

**Status:** Fixed

---

## ISS-029 — Shapes invisible while selected under Pull/Push

**Symptom:** Selection handles and the property panel showed an object that was not drawn on the canvas, especially after attract/repel.

**Fix:** Always return Matter pose from `getOwnedPosition` while owned; release ownership after ~2 settled frames; sync hit-test/handles/`liveObjects` to the override pose; skip `ensureVisible` store-snap while physics still owns the body.

**Status:** Fixed

---

## ISS-030 — Marker drawings could not be resized

**Symptom:** Ink strokes had no resize handles; changing the bbox would not scale the polyline.

**Fix:** Corner resize for ink (no rotate); live and committed resize scale `data.points` and stroke width uniformly.

**Status:** Fixed

---

## ISS-031 — Comment edit and reply threads

**Symptom:** Posted comments could not be edited; collaborators could not reply; `replies` was unused.

**Fix:** Typed `CommentReply` model; author edit of root text; panel reply composer and resolve; double-tap opens edit for posted pins; search includes replies.

**Status:** Fixed

---

## ISS-032 — Rotation degree input UX

**Symptom:** Numeric degree field was awkward for quick adjustments.

**Fix:** Left/right chevron buttons nudge rotation by ±15° with a read-only degree label.

**Status:** Fixed

---

## ISS-033 — Join modal cursor color felt broken

**Symptom:** Picking a cursor color on join did not feel applied (no local cursor; weak swatch feedback).

**Fix:** Live avatar/cursor preview and accent ring on selected swatch; post-join cursor color picker in the identity menu updating awareness + localStorage.

**Status:** Fixed

---

## ISS-034 — Physics fly-away and harsh Pull/Push

**Symptom:** Thrown/attracted objects could accelerate far off the board (visible as a distant minimap speck); Pull never soft-stopped and Push could eject forever.

**Fix:**

- Soft air friction, capped throw/field/collision speeds.
- Banded Pull (force only outside a nest distance; damp inside) and Push (force only inside a soft max).
- Soft/hard play bounds with restoring force and hard clamp + release.
- Heal already-escaped poses on sync; tighter Yjs coordinate cap.

**Status:** Fixed

---

## ISS-035 — Custom marker colors

**Symptom:** Marker toolbar only offered fixed swatches.

**Fix:** Native color picker with localStorage recents; selected ink can be recolored from the selection panel.

**Status:** Fixed

---

## ISS-036 — Emoji stickers via +

**Symptom:** Toolbar + only toggled physics; no sticker/emoji objects.

**Fix:** New `sticker` object type; `+` opens an emoji picker modal (search + curated grid, physics footer); stickers are resizable, collaborative, non-physical.

**Status:** Fixed

---

## ISS-037 — Connectors hard to place / buried in UI

**Symptom:** Connector styles were collapsed; misses exited connect mode; “straight arrow” was curved; quick-add ignored style.

**Fix:** Always-visible bent/curved/arrow/line strip; stay in connect on miss; snap to nearest host; ports shown in connect mode; `arrow` is straight; quick-add uses pending style.

**Status:** Fixed

---

## ISS-038 — Text box keeps expanding

**Symptom:** Typing short text made the text container grow continuously.

**Fix:** Measure height with cleared minHeight; stop feeding live `h` into editor minHeight; epsilon skip; align line-height with raster.

**Status:** Fixed

---

## ISS-039 — Pull/Push objects invisible on canvas

**Symptom:** Nearby objects vanished on the stage under Attract/Repel but still appeared on the minimap.

**Fix:** Stop nest re-own thrash; preserve physics-owned poses in `setObjects`; snap on release; minimap uses override poses; hardened regression test.

**Status:** Fixed

---

## ISS-040 — Flexible connectors

**Symptom:** Connectors required object→object only; elbows were sharp; free canvas strokes were impossible.

**Fix:** Port or free endpoints; drag on empty canvas; rounded elbows; host delete converts ends to free; styled rubber-band preview.

**Status:** Fixed

---

## ISS-041 — Owner, undo/redo, copy/paste

**Fix:** `meta.ownerId` for board creator; Yjs UndoManager (Ctrl+Z/Y); Ctrl+C/V object clipboard.

**Status:** Fixed

---

## ISS-042 — Tabbed Plus modal

**Fix:** Stickers / Insert / Templates / Session tabs above the toolbar `+` button.

**Status:** Fixed

---

## ISS-043 — Code snippets

**Fix:** `code` object with language + source, overlay editor, resize, export.

**Status:** Fixed

---

## ISS-044 — Live voting

**Fix:** Owner start/stop/reset; one vote per user per object; live badges.

**Status:** Fixed

---

## ISS-045 — Polls

**Fix:** `poll` object with question/options, live counts and percentages.

**Status:** Fixed

---

## ISS-046 — Tables

**Fix:** Spreadsheet object with editable cells, add/remove rows/cols, keyboard nav.

**Status:** Fixed

---

## ISS-047 — Charts

**Fix:** Bar/line/pie/doughnut charts; manual data or linked table refresh.

**Status:** Fixed

---

## ISS-048 — Live reactions

**Fix:** Ephemeral awareness reactions near cursors (👍❤️🎉👏😂👀🚀).

**Status:** Fixed

---

## ISS-049 — Templates

**Fix:** Brainstorming Board and Flowchart Template batch insert from Plus → Templates.

**Status:** Fixed

---

## ISS-050 — Commenting pass (coding standards)

**Symptom:** Sync/physics/UI authority and throttle intent was unevenly documented after feature growth.

**Fix:** Section banners in `roomDoc`, `PhysicsWorld`, `ObjectView`; intent comments for UndoManager origins/`captureTimeout`, history throttle, `PHYSICS_ORIGIN` batch writes, voting session reset, board-wide vs poll votes, TextEditor 300ms live-commit, PollEditor one-vote + world→screen.

**Status:** Fixed

---

## ISS-051 — Responsive floating chrome

**Symptom:** Selection panel, overlay editors, format bar, and comments panel could clip off-screen on ~375px / tablet widths; Plus tabs and ink swatches cramped.

**Fix:** `viewportClamp` helper for overlays/selection/text/comment; CSS `max-width`/`flex-wrap`, comments bottom sheet ≤640, Plus denser tabs + 6-col emoji grid, toolbar/ink compact, table bar text buttons, landing fan mid breakpoint (~900), `safe-area-inset` padding on chrome.

**Status:** Fixed

---

## ISS-052 — Physics cadence and authority

**Symptom:** Throws felt different across FPS; busy boards hitch from physics→sync→resync loops; multi-user Pull/Push tug-of-war; occasional mid-flight teleports; hard stop at 12s ownership timeout.

**Root cause:** Variable render-tied Matter steps; every `PHYSICS_ORIGIN` write re-ran full `syncObjects`; ownership was client-local only; play bounds recomputed from live throws; write cadence was frame-count based.

**Fix:** Fixed 60Hz timestep accumulator; skip `syncObjects` on own physics echoes (`physicsLocal`); incremental sync + throttled play bounds (exclude owned); ~20Hz pose writes from simulated time (not frame count); Yjs `physicsOwners` claims; field-aware timeout with soft damp; LRU eviction at `MAX_OWNED`.

**Status:** Fixed

---

## ISS-054 — Ink toolbar recenters after open

**Symptom:** Selecting the marker (pencil) tool shows the ink options bar, then it jumps / recenters after the open animation.

**Root cause:** `.ink-toolbar` is centered with `left: 50%; transform: translateX(-50%)`, but inherited `.floating-panel` `panel-in` keyframes overwrite transform (ending at `none`), so the bar sits left-edge-at-center during the animation and snaps when it ends.

**Fix:** Dedicated `ink-toolbar-in` animation that keeps `translateX(-50%)` in both keyframes (`animation: … both`); restore scroll position if the custom color input’s focus scrolls the page.

**Status:** Fixed

---

## ISS-055 — Pull/Push nearby objects go invisible

**Symptom:** With Attract (Pull) or Repel (Push), a nearby object vanished on the canvas while still showing on the minimap (and often still selected).

**Root cause:** `upsertBody` created Matter bodies with `isStatic: true` then called `Body.setMass`, which sets `inertia` to `NaN`. The first field auto-`own()` (`setStatic(false)`) then produced `angle = NaN`. Pixi applied NaN rotation so the sprite did not draw; frustum culling only checked finite x/y, so the view stayed “visible” but blank. Minimap still painted finite x/y.

**Fix:** Create bodies dynamic → `setMass` → then `setStatic(true)`; heal NaN inertia/angle in `own()`; guard `getOwnedPosition` and pose writes against non-finite rotation; do not collision-spread-own Pull/Push emitters. Regression asserts finite rotation under Pull/Push.

**Status:** Fixed

---

## How to add a new issue

1. Assign the next `ISS-NNN` id.
2. Fill **Symptom**, **Root cause**, **Fix** (or “TBD”), **Status**.
3. Link related PRs or commits when known.
