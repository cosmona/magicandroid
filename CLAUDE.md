# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

"Magic Swipe": an Android app (Expo SDK 58, React Native, TypeScript, Expo Router) to build Magic: The Gathering decks as if holding a handful of cards — swipe right adds the card to the active deck, swipe left discards it, arrows browse. Product framing: "cards in your hands", never "Tinder". Cards come from the Scryfall API; decks are stored locally in SQLite (no backend, no login). UI text is in Spanish.

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

- **Layout.** `src/app/_layout.tsx` nests `GestureHandlerRootView` → `SQLiteProvider` (migrations via `onInit`) → `AppStateProvider` → headerless `Stack`. Tools are **bottom tabs** in `src/app/(tabs)/`: `index.tsx` = "Construir" (the card swipe, where the app opens — keep it first and central: the app's idea is having cards in your hands), `collection.tsx` = "Colección". Add future tools (life counter…) as another file + `<Tabs.Screen>` in `(tabs)/_layout.tsx`. On Construir: `TopBar` (filters, settings) → `SwipeArea` → `deck/DeckBar`; filters, deck, history and settings open in `BottomSheet` (RN `Modal`).
- **Collection** (`components/collection/`, DB v4 `collection_cards`): one row per printing (`scryfall_id`: edition + language). Search box filters owned cards and searches Scryfall (debounced `searchCards`; Scryfall's autocomplete doesn't know Spanish names) to add in `prefs.language`. `OwnButton` (📦 above the swiped card) adds the printing on screen. The deck sheet shows owned/missing copies via `getOwnedCounts` (summed over printings by `oracle_id`).
- **Why sheets:** an earlier version animated collapsible panels by hand with RNGH; the custom drag gestures competed with buttons, list scrolling and the card swipe and felt unreliable. Keep custom gestures to the card swipe and the bar-only `DeckBar`.
- `src/components/deck/DeckSheet.tsx` — port of the web's MazoConstructor + Mazos: deck actions (edit/save name+format, list/gallery, share list, clear, delete), `DeckPicker` (deck tiles; tap = load, ＋ = new), then the cards in three views: list (full details + qty/remove/cover/share), gallery (3 columns, `small` thumbnails) or big (one full-width card per row). In list and big views, dragging a row right removes the card (`deck/SwipeToDelete`, RNGH `FlatList` so it coexists with scrolling).
- `src/components/filters/FilterPanel.tsx` — edits a **draft** of the filters and applies it with "Buscar" (top of the sheet). Keyword and set lists come from Scryfall catalogs, memoized in `scryfall.ts` (`cached`).
- `src/context/AppState.tsx` — shared state: deck list, active deck + its cards, filters; active deck id and filters persist in the SQLite `settings` table. Call `refresh(deckId?)` after every DB write. `ensureActiveDeck()` auto-creates "Mazo sin nombre" on the first right swipe (the web's "(Not Saved)"); "💾 Guardar" in the deck sheet names it. A new `filters` object identity is what triggers a new search. Bump `FILTERS_KEY` when the `Filters` shape changes.
- No user accounts (the web/API had JWT login); everything is local and auto-saved.
- `src/icons.ts` / `assets/mtg/` — mana, rarity, format and type icons copied from `../frontmagic/src/Media`. SVGs are black, so render them with expo-image `tintColor`. Assets are typed as `IconSource` (`number`), not RN's `ImageSourcePropType`, which doesn't fit expo-image's `source`.
- `src/components/HistorySheet.tsx` (▤ button by the card counter): thumbnails of swiped cards with their decision, the current one highlighted, and upcoming ones. Infinite scroll: reaching the end shows 40 more and calls `queue.loadUpTo(n)`, which keeps fetching Scryfall pages until `n` cards are loaded.
- `src/hooks/useCardQueue.ts` — paged card stack for the current filters. Results are tagged with the `filters`/`attempt` they belong to so stale responses are ignored; position resets during render when the search changes (no setState in effects); fetches the next page when ≤8 cards remain and prefetches upcoming images.
- `src/components/SwipeCard.tsx` — the draggable card. Gesture Handler **v3 hook API** (`usePanGesture`, `onUpdate`/`onDeactivate`) with Reanimated 4; callbacks run on the UI thread and report back via `scheduleOnRN` (from `react-native-worklets`; `runOnJS` is deprecated). Buttons trigger the same animation through an imperative `swipe(dir)` handle. Render it with `key={card.id}`.
- `src/api/scryfall.ts` — `Filters` → Scryfall query string (`buildQuery`), and maps Scryfall cards to the flat `Card` type (double-faced cards take images from `card_faces`). All requests go through a throttle (≥100 ms apart) and send `User-Agent` + `Accept` headers, which Scryfall requires. A 404 `not_found` means "no results", not an error.
- `src/db/database.ts` — schema, migrations and all queries (no ORM).

## Conventions / gotchas

- **No limits when adding.** Any card/quantity can go into a deck; `src/validation.ts` (`validateDeck`, pure) checks the deck against its format and the deck sheet shows a ✓/⚠ banner plus per-card red marks. Rules: size (100 commander-style, 60 oathbreaker, ≥60 constructed), copies per `oracle_id` (1 singleton / 4, restricted = 1 in Vintage, basics and "any number" / "up to N cards named" exempt), legality from stored Scryfall `legalities`, commander (👑 `is_commander`; eligibility, max 2 with Partner/Friends forever/Background) and color identity.
- DB v3 stores `color_identity`, `legalities` (JSON) and `is_commander` per deck card; rows saved before v3 are backfilled from Scryfall (`/cards/collection`, 75 ids per request) when their deck is opened.
- **Schema changes:** bump `DATABASE_VERSION` in `src/db/database.ts` and add a new `if (version === N)` step; never edit the existing step. `PRAGMA foreign_keys = ON` is set on every start (deleting a deck cascades to its cards).
- **Undo** history lives in `SwipeArea`; each entry records which deck the card was added to so undo still works after switching decks. It is reset when filters change because it relies on positions in the result list. Each entry stores its `position`, so undo jumps back to it (`queue.goTo`) even after browsing. The ‹ › arrows on the card browse without deciding; tapping a history thumbnail jumps there (long press = preview). Decisions are kept per card id, so a revisited card shows "✓ Ya añadida" / "✕ Descartada".
- With the React Compiler lint rules: use `sharedValue.get()/.set()` instead of `.value`, and don't call `setState` synchronously inside `useEffect` (adjust state during render or set it from async callbacks).
- No icon library is installed; UI buttons use emoji/text symbols.
- Deck covers use Scryfall's `art_crop` image, derived from the stored `normal` URL (`artCropUrl`).
- **Settings** (`SettingsSheet`, ⚙ in `TopBar`): `prefs` in `AppState` (persisted under `prefs`; add new fields to `DEFAULT_PREFS`): default card language, haptics (`expo-haptics`), default deck view (list / gallery / big).
- **Languages:** searches return English printings (no language filter). With `prefs.language` ≠ 'en', `useCardQueue` swaps the current + next 4 cards to that language in the background (`getCardInLanguage`: same set first, then any set; cached; a language picked by hand isn't overridden). The 🌐 pill above the card (`LanguagePicker` → `getCardLanguages`: `oracleid:X lang:any`, `unique=prints`, `include_multilingual`) swaps the current card for another language's printing via `queue.replaceCurrent`; adding it stores that printing's name/image. The 🎨 pill (`ArtPicker` → `getCardArts`: `unique=art`, in the card's language first, then English artworks it lacks) swaps the artwork the same way. Name search uses unquoted `name:word` terms (quoted ones don't fold accents) and, if no English name contains the words, retries with `lang:any` so Spanish names work. `o:` and `t:` only match English oracle text/types.
