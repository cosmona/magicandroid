# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

"Magic Swipe": an Android app (Expo SDK 58, React Native, TypeScript, Expo Router) to build Magic: The Gathering decks Tinder-style — swipe right adds the card to the active deck, swipe left discards it. Cards come from the Scryfall API; decks are stored locally in SQLite (no backend, no login). UI text is in Spanish.

It's a port of the web app in `../frontmagic` (React) + `../apimagic` (Express/MySQL). Those used api.magicthegathering.io and a server-side DB; this app deliberately uses Scryfall and local storage instead.

## Commands

```bash
npx expo start                 # dev server; open with Expo Go on the phone (no Android SDK installed here)
npx tsc --noEmit               # typecheck  (also: npm run typecheck)
npx expo lint                  # ESLint with React Compiler rules (also: npm run lint)
npx expo-doctor                # dependency/config diagnostics
npx expo export --platform android --output-dir <tmp>   # verify the Android bundle compiles
```

There are no tests yet.

**npm 12 quirk:** `npx expo install <pkg>` updates `package.json` but its internal `npm install` fails with `EALLOWSCRIPTS`. Run plain `npm install` afterwards. Keep `react-dom` pinned to the same version as `react` (expo-router's web deps otherwise pull a newer `react-dom` and npm fails with ERESOLVE).

## Architecture

- **Single screen, mirroring the web app's layout** (`../frontmagic/src/App.tsx`). `src/app/_layout.tsx` nests `GestureHandlerRootView` → `SQLiteProvider` (runs migrations via `onInit`) → `AppStateProvider` → headerless `Stack`; `src/app/index.tsx` stacks, top to bottom: `Header` → `filters/FilterBar` (port of Filtros + FilterStatusBar: collapsible panel above a status bar of active-filter icons) → `SwipeArea` (card stack) → `DeckConstructorBar` (port of MazoConstructor: list/gallery, save, clear, delete, expand). Deck selection (the web's Mazos bar) lives inside the constructor panel as `DeckPicker` (horizontal tiles; tap = load, ＋ = new). `DeckPanel` is an always-mounted bottom sheet that slides up over `SwipeArea` (translateY driven by `useDragToggle(..., 'up')` on the constructor bar); `SwipeArea` stays mounted so the card queue survives.
- `src/components/Collapsible.tsx` — `useOpenProgress`/`useDragToggle` (shared drag-to-open logic) and the filter bar: tap toggles, vertical drag follows the finger and snaps (pan + tap via `useCompetingGestures`). The panel stays mounted, is measured with `onLayout` and clipped to `progress × height`.
- `src/components/filters/FilterPanel.tsx` — edits a **draft** of the filters and applies it with "Buscar"; it's remounted with `key={JSON.stringify(filters)}` so the draft resets after applying/clearing. Keyword and set lists come from Scryfall catalogs, memoized in `scryfall.ts` (`cached`).
- `src/context/AppState.tsx` — shared state: deck list, active deck + its cards, filters; active deck id and filters persist in the SQLite `settings` table. Call `refresh(deckId?)` after every DB write. `ensureActiveDeck()` auto-creates "Mazo sin nombre" on the first right swipe (the web's "(Not Saved)"); the 💾 button names it. A new `filters` object identity is what triggers a new search. Bump `FILTERS_KEY` when the `Filters` shape changes.
- No user accounts (the web/API had JWT login); everything is local and auto-saved.
- `src/icons.ts` / `assets/mtg/` — mana, rarity, format and type icons copied from `../frontmagic/src/Media`. SVGs are black, so render them with expo-image `tintColor`. Assets are typed as `IconSource` (`number`), not RN's `ImageSourcePropType`, which doesn't fit expo-image's `source`.
- `src/hooks/useCardQueue.ts` — paged card stack for the current filters. Results are tagged with the `filters`/`attempt` they belong to so stale responses are ignored; position resets during render when the search changes (no setState in effects); fetches the next page when ≤8 cards remain and prefetches upcoming images.
- `src/components/SwipeCard.tsx` — the draggable card. Gesture Handler **v3 hook API** (`usePanGesture`, `onUpdate`/`onDeactivate`) with Reanimated 4; callbacks run on the UI thread and report back via `scheduleOnRN` (from `react-native-worklets`; `runOnJS` is deprecated). Buttons trigger the same animation through an imperative `swipe(dir)` handle. Render it with `key={card.id}`.
- `src/api/scryfall.ts` — `Filters` → Scryfall query string (`buildQuery`), and maps Scryfall cards to the flat `Card` type (double-faced cards take images from `card_faces`). All requests go through a throttle (≥100 ms apart) and send `User-Agent` + `Accept` headers, which Scryfall requires. A 404 `not_found` means "no results", not an error.
- `src/db/database.ts` — schema, migrations and all queries (no ORM).

## Conventions / gotchas

- **Copies are counted per `oracle_id`**, not per Scryfall printing id, so different editions/languages of the same card share the limit. Limit: 4, or 1 for `SINGLETON_FORMATS` (Commander-style, in `src/theme.ts`); basic lands and "any number of cards named" are unlimited (`copyLimit`).
- **Schema changes:** bump `DATABASE_VERSION` in `src/db/database.ts` and add a new `if (version === N)` step; never edit the existing step. `PRAGMA foreign_keys = ON` is set on every start (deleting a deck cascades to its cards).
- **Undo** history lives in `SwipeArea`; each entry records which deck the card was added to so undo still works after switching decks. It is reset when filters change because it relies on positions in the result list.
- With the React Compiler lint rules: use `sharedValue.get()/.set()` instead of `.value`, and don't call `setState` synchronously inside `useEffect` (adjust state during render or set it from async callbacks).
- No icon library is installed; UI buttons use emoji/text symbols.
- Deck covers use Scryfall's `art_crop` image, derived from the stored `normal` URL (`artCropUrl`).
- `filters.spanish` adds `lang:es`, giving Spanish names/images; `name:` search matches both Spanish and English names, but accents must be stripped from the query (Scryfall folds them only on the card side). `o:` and `t:` only match English oracle text/types.
