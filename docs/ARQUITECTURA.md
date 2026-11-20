# 🧱 Arquitectura de Magic Swipe

> Documento vivo: explica con qué está hecha la app, qué hace cada fichero y por dónde empezar a leer.
> Para usar la app, mira el [manual de usuario](MANUAL.md).

Magic Swipe es una app de Android para construir mazos de Magic: The Gathering pasando las cartas una a una, como si las tuvieras en la mano. No tiene servidor ni cuentas: las cartas vienen de la API pública de **Scryfall** y todo lo tuyo (mazos, colección, etiquetas, partidas de vidas) se guarda en una base de datos **SQLite** dentro del móvil.

---

## 1. Tecnologías

| Tecnología | Para qué |
| --- | --- |
| **Expo SDK 58** + **React Native** | El framework de la app Android. Expo aporta los módulos nativos (cámara, SQLite, háptica…) sin tener que tocar Android Studio. |
| **TypeScript** | Todo el código está tipado. |
| **Expo Router** | La navegación. Cada fichero de `src/app/` es una pantalla; los `_layout.tsx` definen cómo se anidan. |
| **expo-sqlite** | La base de datos local (mazos, colección, etiquetas, ajustes, vidas). Sin ORM: SQL a mano en `src/db/database.ts`. |
| **react-native-gesture-handler** + **react-native-reanimated** | Los gestos (deslizar cartas, arrastrar hojas) y las animaciones, que corren en el hilo de UI para ir fluidos. |
| **expo-camera** + **expo-text-extractor** (ML Kit) | La cámara y el OCR en el dispositivo (escanear cartas, prototipo «Mano»). Solo en el APK, no en Expo Go. |
| **API de Scryfall** | Todos los datos de las cartas (búsqueda, imágenes, precios, legalidad, idiomas, artes). |
| **@expo/vector-icons** (MaterialCommunityIcons) | Los iconos. |

Otras piezas: `expo-haptics` (vibración), `expo-sharing` + `expo-file-system` (compartir imágenes/PDF), `react-native-view-shot` (compartir el mazo como imagen), `expo-keep-awake` (pantalla encendida en Vidas), `expo-print` (imprimir a PDF).

---

## 2. Por dónde empezar

- **Punto de entrada:** `src/app/_layout.tsx`. Monta los proveedores (gestos → base de datos → estado global) y la navegación.
- **Pantalla principal:** `src/app/(tabs)/index.tsx` — la pestaña **«Construir»**, donde abre la app: la pila de cartas que vas deslizando. Es el corazón del producto.
- **El estado global** vive en `src/context/AppState.tsx` (mazo activo, sus cartas, filtros, ajustes).
- **Todos los datos de carta** pasan por `src/api/scryfall.ts`.
- **Toda la base de datos** está en `src/db/database.ts`.

Si quieres entender la app, lee esos cinco ficheros en ese orden.

---

## 3. Los ficheros, carpeta a carpeta

### `src/app/` — las pantallas (Expo Router)
- `_layout.tsx` — **fichero principal**: anida `GestureHandlerRootView` → `SQLiteProvider` (migra la BD al arrancar) → `AppStateProvider` → la navegación, con la pantalla de carga encima hasta que todo está listo.
- `(tabs)/_layout.tsx` — las herramientas como pestañas arriba (con la barra propia `AppTabBar`).
- `(tabs)/index.tsx` — **«Construir»** (el swipe de cartas; la app abre aquí).
- `(tabs)/collection.tsx` — **«Colección»**.
- `(tabs)/life.tsx` — **«Vidas»** (contador de vidas).
- `(tabs)/hand.tsx` — **«Mano»** (prototipo: la cámara lee tu mano; oculto salvo que se active en Ajustes).

### `src/api/` — datos de internet
- `scryfall.ts` — **cliente de Scryfall**: traduce los filtros a una consulta, mapea las cartas al tipo `Card`, y da precios, idiomas, artes, símbolos de maná y los datos completos de cada carta.
- `synergy.ts` — sinergias y combos (EDHREC + Commander Spellbook; no es Scryfall).
- `rulesGlossary.ts` — glosario que traduce las palabras del texto de reglas del español al inglés (Scryfall solo busca en inglés).

### `src/components/` — la interfaz
Las piezas visuales. Las más importantes:
- `SwipeArea.tsx` + `SwipeCard.tsx` — la pila de cartas de «Construir» y la carta arrastrable.
- `CardSheet.tsx` — la ficha de carta a pantalla completa (imagen, idioma, artes, añadir al mazo…), navegable con swipe.
- `cardInfo/CardInfoScreen.tsx` / `cardInfo/CardSynergy.tsx` — «Ficha completa» (todos los datos de Scryfall) y sinergias de una carta.
- `BottomSheet.tsx` — la hoja inferior sobre la que se abren filtros, mazo e historial.
- `TopBar.tsx`, `AppTabBar.tsx`, `LoadingScreen.tsx`, `Hint.tsx`, `Button.tsx`, `Select.tsx`, `ManaCost.tsx` — barra de filtros, pestañas, carga, tooltips y controles sueltos.
- `HistorySheet.tsx` — el historial de cartas deslizadas.
- `CardControls.tsx`, `Selection.tsx`, `PrintingPicker.tsx`, `ArtPicker.tsx`, `LanguagePicker.tsx` — controles compartidos por mazo y colección (cantidad, selección múltiple, cambiar arte/idioma).
- `CardShareSheet.tsx` — compartir una carta.
- `SettingsSheet.tsx` + `AppearanceSettings.tsx` + `LayoutBuilder.tsx` — Ajustes (idioma, apariencia/temas, qué datos salen en las listas).
- `SyncScreen.tsx` — sincronizar con la app de PC.
- `ViewSlider.tsx` — desliza entre las vistas (lista/galería/…) del mazo y la colección.

Subcarpetas de `components/`:
- `deck/` — todo lo del mazo: `DeckSheet.tsx` (la hoja del mazo, el fichero más grande), `DeckBar.tsx`, `DeckSummary.tsx`, `DeckPicker.tsx`, `DeckStatsScreen.tsx` (estadísticas y mano de prueba), `DeckSynergyScreen.tsx`, `MissingCardsModal.tsx` (lo que falta para Cardmarket), `ShareDeckModal.tsx`, `PrintSheet.tsx`, `TokensModal.tsx`, `InDeckBadge.tsx`.
- `collection/` — `CollectionScreen.tsx` (la pestaña), `CollectionFilterPanel.tsx`, `OwnButton.tsx` («La tengo» / «La quiero»), `CardScanner.tsx` (📷 escanear), `DeckInCollection.tsx`.
- `life/` — `LifeCounterScreen.tsx` y sus piezas (`GameStats.tsx`, `TurnBar.tsx`).
- `filters/FilterPanel.tsx` — el formulario de búsqueda.
- `tags/Tags.tsx` — las etiquetas de cartas y mazos.
- `synergy/SynergyParts.tsx` — piezas compartidas de las pantallas de sinergias.
- `swipe/SwipeRail.tsx` — los botones del riel lateral de «Construir».
- `hand/` — el prototipo «Mano» (`HandTrackerScreen.tsx`, `HandGuide.tsx`).

### `src/context/AppState.tsx`
El **estado global**: lista de mazos, mazo activo y sus cartas, filtros y ajustes. Persiste el mazo activo y los filtros en SQLite. Tras cualquier escritura en la BD se llama a `refresh()`.

### `src/db/database.ts`
El **esquema, las migraciones y todas las consultas** SQL (sin ORM). Cada cambio de esquema sube `DATABASE_VERSION` y añade un paso de migración.

### `src/hooks/` — lógica reutilizable
`useCardQueue.ts` (la cola infinita de cartas de la búsqueda), `useCardDetails.ts` (precios y datos en vivo), `useWanted.ts` («La quiero»), `useSeen.ts` (badge «nuevo»), `useRememberedSet.ts` (grupos plegados recordados).

### Lógica pura (sin React)
- `src/validation.ts` — valida un mazo contra su formato (tamaño, copias, legalidad, comandante, identidad de color).
- `src/deck/` — `stats.ts` (estadísticas y recomendación de tierras), `group.ts` (agrupación), `arena.ts` + `importList.ts` + `moxfield.ts` (importar/exportar listas).
- `src/collection/` — `organize.ts` (filtros y grupos de la colección), `localSearch.ts` (búsqueda «solo en mi colección»).
- `src/life/game.ts` — el estado y las reglas del contador de vidas.
- `src/scan/recognizeCard.ts` + `src/hand/handTracker.ts` — leer una carta de una foto (OCR) y seguir la mano.
- `src/print/` — construir hojas imprimibles a PDF.

### `src/theme.ts` + `src/themeData.ts` + `src/icons.ts` + `src/listLayout.tsx`
Colores y temas (Ajustes → Apariencia), iconos, y qué datos muestran las listas/galerías.

### `src/sync/`
El motor de **sincronización** con la app de PC (`sync.ts`, `merge.ts`). Se mantiene **idéntico** a la app de PC (`../magicSwipePc`), salvo un import.

---

## 4. Cómo fluyen los datos

1. El usuario pone filtros (`FilterPanel`) → `AppState.filters` cambia → `useCardQueue` pide cartas a `scryfall.ts`.
2. Desliza una carta (`SwipeCard`) → se añade al mazo activo en SQLite (`database.ts`) → `AppState.refresh()` recarga → la hoja del mazo se actualiza.
3. Los precios, legalidad, sinergias y artes se piden a Scryfall bajo demanda y se cachean en memoria durante la ejecución (los precios cambian a diario, así que nunca se guardan).

**Sin cuentas ni backend:** todo es local y se guarda solo. La única salida a internet son las peticiones a Scryfall (y a EDHREC/Commander Spellbook para sinergias).

---

## 5. Convenciones

- **Al añadir no hay límites:** cualquier carta/cantidad entra en el mazo; la validación solo avisa (✓/⚠), no bloquea.
- **Código de colores** (`Tone` en `theme.ts`): oro = crear/editar, azul = consultar, verde = colección/válido, amarillo = falta/comprar, rojo = quitar/borrar.
- **Reglas de React Compiler:** usar `sharedValue.get()/.set()` (no `.value`) y no llamar a `setState` de forma síncrona dentro de un `useEffect`.
- **Idioma:** las búsquedas vuelven en inglés; con otro idioma preferido, las cartas visibles se cambian a ese idioma en segundo plano.
- **Ficheros idénticos al PC:** `src/sync/*` y `src/db/database.ts` se mantienen iguales en ambas apps; no los cambies solo en una.
