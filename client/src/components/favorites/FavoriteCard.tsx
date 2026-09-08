import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FocusEvent, KeyboardEvent, MouseEvent } from 'react';

import { sanitizeSnapshot } from '../../lib/sanitize';
import type { Favorite } from '../../../../shared/types';

/**
 * Where "open in guide" actually goes: the same `GET /guide` route every
 * card in the Guides board links to, plus an `at=` query carrying the
 * favorite's own `anchor` — GuidePosition, reused unchanged, so open-in-guide
 * is progress *restore* aimed at a different target rather than a second
 * navigation mechanism the render side has to learn. `anchor` is omitted
 * entirely (no bare `&at=`) rather than sent as `null`, because `at`'s only
 * job on the render side is "jump here if present" — an explicit null would
 * be one more shape that route has to parse and reject.
 *
 * Exported (not just used internally) so the view suite can assert the exact
 * encoded string a card produces without re-deriving it by hand.
 */
export function openHref(f: Favorite): string {
  const base = `/guide?p=${encodeURIComponent(f.guidePath)}`;
  return f.anchor ? `${base}&at=${encodeURIComponent(JSON.stringify(f.anchor))}` : base;
}

export interface FavoriteCardProps {
  favorite: Favorite;
  /** This card's 0-based position within its own project bay's current,
   *  unfiltered list (FavoritesView only ever computes `index`/`count` from
   *  the bay's *full* order — see its own `reorderable` comment). Feeds
   *  `fav-up`/`fav-top`'s disabled state (`index === 0`). */
  index: number;
  /** How many cards are in this card's bay right now — `fav-down` disables
   *  when `index === count - 1`, the bay's own last position. */
  count: number;
  /** False while a search is narrowing the board (FavoritesView computes
   *  this). The move buttons and the drag handle render only while this is
   *  true: reordering writes back the bay's *whole* order, and a search that
   *  hid some of the bay's cards must not let the ones still on screen be
   *  dragged into a sequence that silently drops the hidden rows. Delete has
   *  no such problem — it removes exactly the row tapped, search or not —
   *  so `fav-remove` ignores this flag entirely. */
  reorderable: boolean;
  /** Patch this favorite's title and/or note. Called once, by whichever
   *  inline field just committed a changed value — never by a cancelled
   *  edit (Escape) or an edit that blurred back to its own starting value. */
  onPatch: (patch: { title?: string; note?: string }) => void;
  /** Move this card up/down/to the top of its bay. This component only ever
   *  names the *direction*; FavoritesView is the one holding the bay's
   *  current list, so it is the one that turns a direction into the bay's
   *  new id order and calls `reorderBay` with it. */
  onMove: (to: 'up' | 'down' | 'top') => void;
  /** Delete this favorite, behind the two-tap `sure?` confirm below. */
  onRemove: () => void;
  /** Drag-and-drop reorder target: `sourceId` is the id the dropped card's
   *  own handle wrote into `dataTransfer` at `dragstart`. FavoritesView
   *  resolves the drop against this bay's own order and ignores it outright
   *  if `sourceId` never belonged to this bay — a drag started in another
   *  project's bay carries an id this bay's own list simply does not have. */
  onDropOn: (sourceId: string) => void;
}

/**
 * One favorite: head (title, pill, drag handle, move/remove controls),
 * crumb link, the note annotation, the sanitised snapshot body, and the
 * capture date. Every control below mirrors a reasoning already stated
 * elsewhere in this app rather than inventing its own:
 *
 * - The delete button's two-tap `sure?` is the same shape as GuidesView's
 *   viewer-header `↺ reset` (see CLAUDE.md's "Starting a guide over has
 *   exactly one control" invariant) — a destructive control that is loud
 *   only *after* the first tap, and disarms on blur here rather than on a
 *   tracked "did the target change" effect, because a card's own delete
 *   button has no equivalent of the viewer's "which guide is this even
 *   armed for" ambiguity: there is exactly one row it could mean, the one
 *   it is attached to.
 * - Title/note editing keeps its own "already handled, ignore the stray
 *   blur" guard (`skip*BlurRef` below) for a real DOM quirk: removing a
 *   *focused* input from the document (which is what happens the instant
 *   Enter/Escape flips `editing*` back to false) fires a native blur on
 *   that input as part of the removal itself, arriving after the
 *   keyboard handler already decided the edit's fate. Without the guard,
 *   an Enter-commit would re-run the same commit a second time (a
 *   duplicate PATCH) and an Escape-cancel would run the *commit* path
 *   against a value it was never supposed to send at all. The guard is a
 *   one-shot latch armed by `exitTitleEdit`/`exitNoteEdit` and consumed by
 *   the matching blur handler — but that compensating blur is not
 *   guaranteed to arrive (jsdom never fires it at all, and nothing here
 *   pins down that a real browser always does either), so the latch is
 *   *also* cleared unconditionally at the start of the next edit
 *   (`startEditTitle`/`startEditNote`) rather than relying solely on the
 *   blur to flip it back. That is what keeps a stale `true` left over from
 *   a session whose compensating blur never came from silently eating a
 *   later session's genuine blur-exit on the same mounted card.
 */
export default function FavoriteCard({
  favorite,
  index,
  count,
  reorderable,
  onPatch,
  onMove,
  onRemove,
  onDropOn
}: FavoriteCardProps) {
  /*
    tutor decks carry a `kind: 'deck'` anchor and study builds a `kind: 'doc'`
    one — the same split the Guides board's pill makes off GuideEntry.type,
    just read off the anchor instead, because a favorite has no `type` field
    of its own. A favorite with no anchor at all (nothing addressable found at
    capture) gets no pill, rather than a guessed one: there is nothing here
    to guess a "kind" from.
  */
  const pillType = favorite.anchor
    ? favorite.anchor.kind === 'deck'
      ? 'tutor'
      : 'study'
    : null;

  /*
    guideTitle leads the trail because a bay already states the project but
    never the guide within it — the crumb link is the one place both the
    guide and the block's position inside it are named together. The
    trailing ' ↗' is not a pill or an icon: it is plain text in the link's own
    accessible name, so a screen reader announces "opens in guide" without a
    second aria-label to keep in sync with the crumb text it would duplicate.
  */
  const crumbText = `${[favorite.guideTitle, ...favorite.crumb].join(' › ')} ↗`;

  /*
    sanitizeSnapshot re-parses the whole snapshot with DOMParser, which is not
    free — memoized on the favorite's own html so a re-render caused by, say,
    a sibling card's edit does not re-run it on every card in the bay.
    favorite.html is immutable from this card's own point of view (the inline
    edit below only ever patches title/note), so the html string itself is
    the only input worth keying on.
  */
  const sanitizedBody = useMemo(() => sanitizeSnapshot(favorite.html), [favorite.html]);

  /*
    A quiz card ships collapsed: `.quiz-feedback` is `display:none` until its
    `.quiz-option` carries `revealed` (see styles.css). This is the toggle —
    delegated to the body's own onClick rather than one listener per button,
    because a snapshot can hold any number of quiz options (or none) and the
    handler has to work for all of them without walking the sanitised markup
    to attach one. `closest` finds the option even though the actual click
    lands on the button or the feedback text inside it. Toggling rather than
    only opening mirrors a live deck's own quiz option, which lets a reader
    re-check an answer instead of ratcheting one way forever — and matters
    more here than in the deck, since a favorite's whole point is being
    revisited.
  */
  function handleBodyClick(e: MouseEvent<HTMLDivElement>): void {
    const option = (e.target as HTMLElement).closest<HTMLElement>('.quiz-option');
    if (!option) return;
    option.classList.toggle('revealed');
  }

  /* ---------------------------------------------------------- Title edit */
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(favorite.title);
  // See the component docblock: set right before an Enter/Escape handler
  // flips `editingTitle` back to false, so the native blur that removing a
  // focused input triggers finds the field already resolved instead of
  // resolving it a second time.
  const skipTitleBlurRef = useRef(false);

  function startEditTitle(): void {
    // Clear any latch left armed by a *previous* edit session on this same
    // card whose compensating blur never arrived (see the component
    // docblock) — otherwise this new session's first genuine blur-exit
    // reads that stale `true`, silently drops the edit, and never flips
    // `editingTitle` back to false. Only a blur *inside* this session can
    // legitimately re-arm it (via `exitTitleEdit`), so resetting here is
    // always safe: there is nothing this session's own blur handler still
    // needs the previous session's latch value for.
    skipTitleBlurRef.current = false;
    setTitleDraft(favorite.title);
    setEditingTitle(true);
  }

  function exitTitleEdit(): void {
    skipTitleBlurRef.current = true;
    setEditingTitle(false);
  }

  function commitTitle(value: string): void {
    const trimmed = value.trim();
    // Empty and unchanged are both "nothing to save" — an empty title would
    // leave the card unlabelled, and a value equal to the current one is a
    // no-op edit, so neither is worth a PATCH the server would just echo
    // back unchanged.
    if (trimmed && trimmed !== favorite.title) onPatch({ title: trimmed });
    exitTitleEdit();
  }

  function handleTitleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTitle(titleDraft);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      exitTitleEdit();
    }
  }

  function handleTitleBlur(e: FocusEvent<HTMLInputElement>): void {
    if (skipTitleBlurRef.current) {
      skipTitleBlurRef.current = false;
      return;
    }
    commitTitle(e.target.value);
  }

  // role=button on a span needs the keyboard activation a real <button>
  // gets for free — Enter/Space here mirror the click handler exactly, and
  // Space is prevented from also scrolling the page the way it would on any
  // other focused non-form element.
  function handleTitleSpanKeyDown(e: KeyboardEvent<HTMLSpanElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startEditTitle();
    }
  }

  /* ----------------------------------------------------------- Note edit */
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(favorite.note);
  const skipNoteBlurRef = useRef(false);

  function startEditNote(): void {
    // Same reasoning as startEditTitle's reset above — see that comment.
    skipNoteBlurRef.current = false;
    setNoteDraft(favorite.note);
    setEditingNote(true);
  }

  function exitNoteEdit(): void {
    skipNoteBlurRef.current = true;
    setEditingNote(false);
  }

  function handleNoteKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    // Enter is left alone here (unlike the title input): a note is
    // multi-line prose, not a one-line label, so Enter has to keep meaning
    // "newline" the way it does in any other textarea. Only Escape is a
    // shortcut this field adds on top of that.
    if (e.key === 'Escape') {
      e.preventDefault();
      exitNoteEdit();
    }
  }

  function handleNoteBlur(e: FocusEvent<HTMLTextAreaElement>): void {
    if (skipNoteBlurRef.current) {
      skipNoteBlurRef.current = false;
      return;
    }
    // Unlike the title, an empty note is a legitimate saved value (shared/
    // types.ts: "'' is a valid, saved answer to 'why keep this?'") — so the
    // only guard here is "did it actually change", never "is it non-empty".
    if (e.target.value !== favorite.note) onPatch({ note: e.target.value });
    setEditingNote(false);
  }

  function handleNoteDivKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startEditNote();
    }
  }

  /* ------------------------------------------------------------- Delete */
  // Two-tap, same reasoning as GuidesView's viewer-header reset (see the
  // component docblock) — the difference here is *what* disarms it: the
  // viewer tracks "did the guide under this button change" with an effect,
  // because one reset button serves whichever guide is currently open. This
  // button serves exactly one favorite for its entire life, so a plain
  // onBlur is enough: armed and then ignored (tapped elsewhere, tabbed
  // away) reads as "changed my mind", and there is no second target it
  // could have meant instead.
  const [removeArmed, setRemoveArmed] = useState(false);

  function handleRemoveClick(): void {
    if (removeArmed) {
      onRemove();
    } else {
      setRemoveArmed(true);
    }
  }

  /* --------------------------------------------------- Reorder: buttons */
  function handleMoveUp(): void {
    onMove('up');
  }
  function handleMoveDown(): void {
    onMove('down');
  }
  function handleMoveTop(): void {
    onMove('top');
  }

  /* ----------------------------------------------- Reorder: drag/drop */
  // The handle is the *only* drag source — dragging the card body would
  // fight the quiz-option click and the crumb link's own text selection.
  // `text/plain` (not a custom MIME type) is what the brief's own fixture
  // and this card's drop target agree on; a custom type buys nothing here
  // since both ends are this same component.
  function handleDragStart(e: DragEvent<HTMLSpanElement>): void {
    e.dataTransfer.setData('text/plain', favorite.id);
  }

  // A card is a drop target only while `reorderable` — see the prop
  // docblock — so these two handlers are wired conditionally below rather
  // than checked inside; there is no drag source rendered anywhere on the
  // board once a search is active, so gating the target the same way just
  // states the invariant twice instead of once.
  function handleDragOver(e: DragEvent<HTMLElement>): void {
    e.preventDefault();
  }
  function handleDrop(e: DragEvent<HTMLElement>): void {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (sourceId) onDropOn(sourceId);
  }

  return (
    <article
      className="fav-card"
      onDragOver={reorderable ? handleDragOver : undefined}
      onDrop={reorderable ? handleDrop : undefined}
    >
      <div className="fav-head">
        {editingTitle ? (
          <input
            className="fav-title-input"
            value={titleDraft}
            autoFocus
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTitleDraft(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            onBlur={handleTitleBlur}
          />
        ) : (
          <span
            className="fav-title"
            role="button"
            tabIndex={0}
            onClick={startEditTitle}
            onKeyDown={handleTitleSpanKeyDown}
          >
            {favorite.title}
          </span>
        )}
        {pillType ? <span className={`pill pill-${pillType}`}>{pillType}</span> : null}
        <div className="fav-ctls">
          {/* The handle only exists in the DOM while reorderable — see the
              prop docblock — and even then only *paints* on a fine-pointer
              device (styles.css's `@media (pointer: fine)`): a touch screen
              has no hover-and-drag gesture for it to start, so a handle that
              only ever misfires there is worse than no handle at all. */}
          {reorderable ? (
            <span
              className="fav-handle"
              draggable
              aria-hidden="true"
              onDragStart={handleDragStart}
            >
              ⠿
            </span>
          ) : null}
          {reorderable ? (
            <>
              <button
                type="button"
                className="fav-ctl fav-up"
                aria-label="Move up"
                disabled={index === 0}
                onClick={handleMoveUp}
              >
                ↑
              </button>
              <button
                type="button"
                className="fav-ctl fav-down"
                aria-label="Move down"
                disabled={index === count - 1}
                onClick={handleMoveDown}
              >
                ↓
              </button>
              <button
                type="button"
                className="fav-ctl fav-top"
                aria-label="Move to top"
                disabled={index === 0}
                onClick={handleMoveTop}
              >
                ⤒
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={`fav-ctl fav-remove${removeArmed ? ' armed' : ''}`}
            aria-label={removeArmed ? 'Confirm remove' : 'Remove'}
            onClick={handleRemoveClick}
            onBlur={() => setRemoveArmed(false)}
          >
            {removeArmed ? 'sure?' : '✕'}
          </button>
        </div>
      </div>
      <a className="fav-crumb" href={openHref(favorite)} target="_top">
        {crumbText}
      </a>
      {editingNote ? (
        <textarea
          className="fav-note-input"
          value={noteDraft}
          autoFocus
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNoteDraft(e.target.value)}
          onKeyDown={handleNoteKeyDown}
          onBlur={handleNoteBlur}
        />
      ) : (
        <div
          className={`fav-note${favorite.note ? '' : ' empty'}`}
          role="button"
          tabIndex={0}
          onClick={startEditNote}
          onKeyDown={handleNoteDivKeyDown}
        >
          {favorite.note || 'add a note'}
        </div>
      )}
      {/* dangerouslySetInnerHTML is the one place in this app that renders
          arbitrary stored HTML — sanitizedBody is what stands between it and
          script execution in the SPA, so this div only ever receives the
          sanitised string, never favorite.html directly. */}
      <div
        className="fav-body"
        onClick={handleBodyClick}
        dangerouslySetInnerHTML={{ __html: sanitizedBody }}
      />
      <div className="fav-foot">{favorite.createdAt.slice(0, 10)}</div>
    </article>
  );
}
