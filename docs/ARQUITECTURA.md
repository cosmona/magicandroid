# 🧱 Arquitectura de Magic Swipe

> Documento vivo: explica cómo está hecha la app y por qué. Se actualiza con cada cambio de estructura.
> Para usar la app, ver el [manual de usuario](MANUAL.md).

## Índice

1. [Visión general](#1-visión-general)
2. [Tecnologías](#2-tecnologías)
3. [Estructura de carpetas](#3-estructura-de-carpetas)
4. [Navegación y pantallas](#4-navegación-y-pantallas)
5. [Estado global](#5-estado-global)
6. [Datos: Scryfall](#6-datos-scryfall)
7. [Datos: SQLite](#7-datos-sqlite)
8. [Construir: la cola de cartas y el gesto](#8-construir-la-cola-de-cartas-y-el-gesto)
9. [Hojas inferiores y gestos](#9-hojas-inferiores-y-gestos)
10. [El mazo](#10-el-mazo)
11. [La colección](#11-la-colección)
12. [Validación de formatos](#12-validación-de-formatos)
13. [Escáner de cartas](#13-escáner-de-cartas)
14. [Decisiones de diseño](#14-decisiones-de-diseño)
15. [Compilar y publicar](#15-compilar-y-publicar)

---

## 1. Visión general

App Android sin servidor: todo lo que es del usuario vive en una base de datos **SQLite local**, y todo lo que es de las
cartas viene de la **API pública de Scryfall**. No hay cuentas ni backend.

```mermaid
flowchart LR
  UI[Pantallas y componentes<br/>React Native] --> State[AppState<br/>contexto React]
  UI --> Hooks[Hooks<br/>useCardQueue · useCardDetails]
  State --> DB[(SQLite<br/>mazos · colección · ajustes)]
  Hooks --> API[Cliente Scryfall<br/>src/api/scryfall.ts]
  UI --> API
  API --> SF[(api.scryfall.com)]
  UI --> OCR[ML Kit OCR<br/>expo-text-extractor]
```

Es la versión Android del proyecto web *frontmagic* (React) + *apimagic* (Express/MySQL). La web usaba otra API de
cartas y una base de datos en servidor; aquí se cambió a Scryfall y almacenamiento local.

## 2. Tecnologías

| Pieza | Para qué |
|---|---|
| **Expo SDK 58** + React Native 0.88 + React 19 + TypeScript | Base de la app |
| **Expo Router** | Navegación por archivos (`src/app/`) |
| **expo-sqlite** | Base de datos local con migraciones |
| **react-native-gesture-handler 3** (API de hooks) + **Reanimated 4** | Deslizar cartas y hojas en el hilo de UI |
| **expo-image** | Imágenes con caché y precarga |
| **@expo/vector-icons** (Material Community Icons) | Iconos |
| **expo-camera** + **expo-text-extractor** (Google ML Kit) | Escáner de cartas |
| **expo-clipboard**, **expo-haptics**, **expo-navigation-bar** | Copiar listas, vibración, barra de Android |
| **EAS Build** | Compilar el APK en la nube |

El proyecto usa las reglas de lint del **React Compiler**: nada de `setState` síncrono en efectos (se ajusta el estado
durante el render o desde callbacks asíncronos) y los valores compartidos de Reanimated se leen con `.get()/.set()`.

## 3. Estructura de carpetas

```
src/
├── app/                      # Rutas (Expo Router)
│   ├── _layout.tsx           # Raíz: gestos, SQLite, AppState, pantalla de carga
│   └── (tabs)/               # Pestañas: _layout (AppTabBar), index = Construir, collection, life = Vidas
├── api/scryfall.ts           # Cliente de Scryfall: búsquedas, idiomas, artes, precios, sets, símbolos…
├── collection/organize.ts    # Filtros y agrupaciones de la colección (funciones puras)
├── components/
│   ├── AppTabBar.tsx         # Cabecera + pestañas arriba + hoja de ajustes
│   ├── BottomSheet.tsx       # Hoja inferior animada + SheetDragArea
│   ├── CardControls.tsx      # Botones compartidos de carta: cantidad, iconos, barra de deshacer
│   ├── SwipeArea / SwipeCard # Las cartas en la mano
│   ├── HistorySheet, LanguagePicker, ArtPicker, ManaCost, TopBar, SettingsSheet…
│   ├── cardInfo/             # Ficha completa de Scryfall (pantalla + diccionario de campos)
│   ├── collection/           # Pantalla de colección, panel de filtros, escáner, botón «La tengo»
│   ├── deck/                 # Barra, hoja, cabecera, selector, Cardmarket, fichas
│   └── filters/FilterPanel   # Filtros de búsqueda de Construir
├── context/AppState.tsx      # Estado global
├── db/database.ts            # Esquema, migraciones y todas las consultas
├── deck/stats.ts             # Estadísticas del mazo y mano de prueba (funciones puras)
├── hooks/                    # useCardQueue (cola de cartas), useCardDetails (precios…)
├── scan/recognizeCard.ts     # OCR → carta de Scryfall
├── icons.ts, theme.ts        # Iconos locales, colores, formatos, utilidades de formato
└── validation.ts             # Reglas de cada formato (función pura)
```

## 4. Navegación y pantallas

```mermaid
flowchart TD
  Root["_layout.tsx<br/>GestureHandlerRootView → SQLiteProvider → AppStateProvider"] --> Stack
  Root --> Loading[LoadingScreen<br/>logo + versión]
  Stack --> Tabs["(tabs)/_layout.tsx<br/>tabBarPosition: top + AppTabBar"]
  Tabs --> Build["index.tsx · Construir"]
  Tabs --> Coll["collection.tsx · Colección"]
  Tabs --> Life["life.tsx · Vidas"]
  Build --> TopBar[TopBar · filtros]
  Build --> Swipe[SwipeArea]
  Build --> Bar[DeckBar]
  Bar -. abre .-> DeckSheet[BottomSheet expandable → DeckSheet]
  TopBar -. abre .-> Filters[BottomSheet → FilterPanel]
```

- Las **pestañas van arriba** (`tabBarPosition: 'top'`) con una barra propia, `AppTabBar`, que dibuja la cabecera
  «Magic Swipe» + ⚙ y un control segmentado con el `title` y el `tabBarIcon` de cada pantalla. Por eso las pantallas no
  reservan el margen superior; el inferior lo reservan `DeckBar` y la colección.
- **Nueva herramienta**: un archivo en `src/app/(tabs)/` y un `<Tabs.Screen>` en su layout. Una pestaña se oculta con
  `href: null` en sus opciones (`AppTabBar` no la dibuja): así va «Mano» mientras `prefs.handBeta` está apagado.
- **Mano (beta)** (`components/hand/HandTrackerScreen`, lógica pura en `src/hand/handTracker.ts`): mientras la pestaña
  está a la vista, `takePictureAsync` cada 500 ms y `expo-text-extractor` (ML Kit, en el móvil) lee las líneas;
  `cardsInText` las compara con los nombres del mazo activo (impreso e inglés, normalizados) y `updateHand` da por robada
  una carta vista 2 fotos seguidas y por salida una que falta 3 (`FRAMES_IN` / `FRAMES_OUT`). `HandGuide` es la guía
  (dibujada con vistas, sin imágenes), que sale una vez (`prefs.handGuideSeen`).
- **Vidas** (`components/life/LifeCounterScreen`, lógica pura en `src/life/game.ts`): `LifeGame` (vidas iniciales y
  jugadores con vidas, veneno y daño de comandante recibido de cada jugador) guardado como JSON en la tabla `settings`
  (clave `lifeCounter`). `tableRows` decide la disposición por número de jugadores; la fila de arriba se gira 180°.
  Cada recuadro son dos `Pressable` (mitad izquierda −1, derecha +1, pulsación larga ±10) con el número encima sin
  recibir toques. `useFocusEffect` + `expo-keep-awake` mantienen la pantalla encendida solo en esta pestaña.
  Con 3+ jugadores (y `show.sources`) cada mitad se parte en un `Pressable` por rival (su color) para saber quién hace
  el daño. `LifeGame.settings` (`lifeSettings`, `setShow`, `setEffect`; igual que en el PC) guarda qué se ve
  (`show`) y los efectos (`effects`: fotos, destellos, temblor, números, latido, calavera, confeti), hechos con
  `Animated` de React Native. Las fotos (`expo-camera`, cámara delantera) se copian a `documentDirectory/life-photos`
  y la partida guarda su URI.
- Lo que se abre encima (filtros, mazo, historial, ajustes) son **hojas inferiores**, no pantallas, para que la pila de
  cartas no se desmonte y conserve su posición.
- La **ficha completa** (`cardInfo/CardInfoScreen`) es un `Modal` a pantalla completa, porque se abre desde dentro de la
  hoja del mazo (que ya es un `Modal`) y una ruta normal quedaría debajo.

## 5. Estado global

`src/context/AppState.tsx` reparte:

| Dato | Persistencia |
|---|---|
| Lista de mazos, mazo activo y sus cartas | SQLite (`decks`, `deck_cards`); id activo en `settings` |
| Filtros de búsqueda | `settings` (clave versionada `FILTERS_KEY`) |
| Preferencias (`prefs`): idioma, vibración, vista del mazo, pantalla completa, botones del mazo ocultos y dónde se muestran precios (`pricesDeck`, `pricesDeckCards`, `pricesShopping`, `pricesCollection`, `pricesCardInfo`) | `settings` (`prefs`); campos nuevos van a `DEFAULT_PREFS` |

Reglas:

- Tras **cada escritura** en la base de datos se llama a `refresh(deckId?)`.
- `ensureActiveDeck()` crea «Mazo sin nombre» al primer deslizamiento a la derecha si no hay mazo.
- Un **objeto `filters` nuevo** (identidad distinta) es lo que dispara una búsqueda nueva.

## 6. Datos: Scryfall

Todo pasa por `src/api/scryfall.ts`:

- **`scryfallFetch`**: añade `User-Agent` y `Accept` (Scryfall los exige) y separa las peticiones al menos **100 ms**.
- Un **404 `not_found`** en una búsqueda significa «sin resultados», no error.
- **`Card`**: tipo plano propio; las cartas de dos caras toman imágenes y textos de `card_faces`.
- **Búsqueda** (`buildQuery` + `searchCards`): traduce `Filters` a la sintaxis de Scryfall. Los nombres usan términos
  `name:` sin comillas (las comillas no ignoran tildes) y, si ningún nombre inglés coincide, se repite con `lang:any`
  para que funcionen los nombres en español.
- **Idiomas** (`getCardLanguages`, `getCardInLanguage`) y **artes** (`getCardArts`, `unique=art`), con caché.
- **`cached()`**: memoriza catálogos (habilidades, sets, símbolos) durante la ejecución.
- **Datos vivos** (`getCardDetails` + hook `useCardDetails`): precio en €, enlace de Cardmarket, fuerza/resistencia,
  lealtad, defensa y fichas (`all_parts`), pedidos en lotes de 75 a `/cards/collection` y cacheados en memoria. **No se
  guardan** porque los precios cambian a diario. Scryfall casi no da precio a impresiones no inglesas: se pide la
  inglesa de la misma edición y número.
- **Ficha completa**: `getRawCard` devuelve el objeto de Scryfall tal cual y `getRulings` sus aclaraciones;
  `cardInfo/fields.ts` traduce y explica cada campo (los de imágenes se omiten a propósito, y los desconocidos acaban en
  «Otros datos»).
- **Símbolos de maná**: `getSymbols` (`/symbology`) → SVG que pinta `ManaCost`.

### Sinergias (fuera de Scryfall)

`src/api/synergy.ts` habla con dos webs de la comunidad, con caché en memoria por carta:

- **EDHREC** (no tiene API oficial: se leen los JSON que carga su propia web, `json.edhrec.com/pages/{cards|commanders}/<slug>.json`;
  pueden cambiar sin aviso). `edhrecSlug` convierte el nombre (sin tildes ni apóstrofos; cara frontal primero y nombre
  completo para cartas partidas). `getEdhrecCard` → mazos, porcentaje, sal, comandantes y cartas afines;
  `getEdhrecCommander` → todas sus cartas ordenadas por `synergy` (null si no es comandante: 403/404). Los `id` de
  EDHREC son ids de Scryfall, así que las imágenes salen de `/cards/collection`.
- **Commander Spellbook** (API pública): `getCardCombos` (`/variants/?q=card:"…"`, por popularidad) y `findDeckCombos`
  (`POST /find-my-combos` con el mazo y los comandantes → `included` y `almostIncluded`). Los resultados más comunes se
  traducen; las piezas genéricas (`requires`) van con los requisitos, no con las cartas.

UI: `cardInfo/CardSynergy` (secciones de la ficha), `deck/DeckSynergyScreen` (pantalla del mazo, `Modal` con pestañas
Combos / Recomendadas y ＋ que añade al mazo; las recomendadas en lista, galería o `RecommendSwipe`, que reutiliza `SwipeCard` con la lista fija al entrar y por eso envuelve el `Modal` en `GestureHandlerRootView`) y piezas compartidas en `synergy/SynergyParts` (`ComboView`, `EntryRow`,
`useCardImages` por id o por nombre). `cardInfo/Section` es el bloque con título que usan ambas pantallas (con `collapsible` se pliega tocando el título; la ficha completa lo usa en todos sus bloques).

## 7. Datos: SQLite

`src/db/database.ts` contiene el esquema, las migraciones y todas las consultas (sin ORM). Versión actual: **6**.

```mermaid
erDiagram
  decks ||--o{ deck_cards : contiene
  decks ||--o{ deck_sideboard : banquillo
  decks {
    int id PK
    text name
    text format
    text cover_image
    int created_at
  }
  deck_cards {
    int deck_id FK
    text oracle_id PK
    text scryfall_id
    text name
    text printed_name
    text type_line
    text mana_cost
    real cmc
    text image_url
    text oracle_text
    text rarity
    int quantity
    text color_identity
    text legalities
    int is_commander
  }
  deck_sideboard {
    int deck_id FK
    text oracle_id PK
    text scryfall_id
    int quantity
  }
  collection_cards {
    text scryfall_id PK
    text oracle_id
    text name
    text printed_name
    text type_line
    text mana_cost
    text image_url
    text rarity
    text set_code
    text lang
    int quantity
  }
  settings {
    text key PK
    text value
  }
```

- **Mazo**: una fila por carta (`oracle_id`, la carta como concepto) con la impresión elegida (`scryfall_id`).
- **Banquillo** (v5, `deck_sideboard`): mismas columnas que `deck_cards` en su propia tabla, así una carta puede
  estar en el mazo y en el banquillo. `getSideboard`, `addCardToSideboard`, `changeSideboardQuantity` y `moveCopy`
  (pasa una copia entre tablas copiando las columnas). `AppState.activeSideboard`; no entra en tamaño, curva,
  estadísticas ni mano de prueba. `validateDeck(format, cards, sideboard)`: en construido máx. 15 y el límite de 4 copias
  suma el banquillo. Formato **`limited`** (Limitado, `DECK_ONLY_FORMATS`: no se busca en Scryfall): mínimo 40, sin
  límite de copias ni legalidad, ~17 tierras en `recommendLands`. Importar crea `limited` con ~40 cartas sin
  comandante y mete el *Sideboard* en el banquillo.
- **Colección**: una fila por **impresión** (edición + idioma). La columna `place` (v6, clave `(scryfall_id, place)`)
  existió para una segunda colección de MTG Arena, que se quitó: la v8 borra esas filas y la app pasa siempre
  `'paper'` a las consultas (que siguen recibiendo `place`). «Cuántas tengo» suma por `oracle_id`.
- **Sincronización (v7)**: `decks.uid` (id global) y `decks.updated_at`, `collection_cards.updated_at` y la tabla
  `sync_tombstones (kind, key, deleted_at)`. Los mantienen **triggers** (cualquier cambio en `decks`, `deck_cards` o
  `deck_sideboard` sella el mazo; borrar deja una lápida; insertar la quita), así que las consultas normales no saben
  nada de sync. `src/sync/sync.ts` (el **mismo archivo** que en Magic Swipe para PC, salvo el import del tipo):
  `exportSyncData` / `copySyncData` / `clearSentData`, y `src/sync/merge.ts` (también idéntico) para **Sincronizar**: el
  móvil manda sus datos (`offer`), el PC los compara (`diffSyncData`: diferencias con opción sugerida según `updated_at`
  y las lápidas), el usuario las revisa en el PC, y `buildPatches` da la parte de cada uno; el móvil pregunta (`poll`)
  hasta recibir la suya, hace `saveBackup` + `applyPatch` y avisa (`applied`). v12 añade `tags.updated_at`, lápidas de
  etiquetas y de etiquetas en cartas, y `sync_backups` (tres últimas copias, `restoreBackup`). Avanzado, sin fusión: una dirección (móvil → PC o PC → móvil) y un modo,
  **Copiar** (el destino recibe todo; los mazos con el mismo `uid` y las filas con la misma clave se sustituyen por las
  del origen; lo demás del destino se queda) o **Mover** (además, el origen borra lo enviado cuando el destino confirma).
  Transporte: el PC abre un servidor HTTP en la LAN (puerto 47823) mientras su ventana «Sincronizar con el móvil» está
  abierta y enseña un QR `magicswipe://sync?h=<ips>&p=<puerto>&t=<código>`; `components/SyncScreen` lo escanea
  (expo-camera) y hace `POST /sync` con `{op: 'receive' | 'send' | 'clear'}` (recibir datos del móvil, enviar los del
  PC, borrar en el PC tras mover) u `{op: 'offer' | 'poll' | 'applied'}` (sincronizar). HTTP sin cifrar en la red local:
  `expo-build-properties` → `usesCleartextTraffic` (hace falta un APK nuevo).
- **Posibles y «La quiero» (v9)**: `deck_maybe` (mismas columnas que el banquillo; triggers que sellan el mazo; no
  cuenta en tamaño, validación, estadísticas ni precio; `moveCopy(db, deck, oracle, to, from)` mueve entre `main`,
  `side` y `maybe`) y `wanted_cards` (una fila por `oracle_id` con la impresión marcada; triggers de sincronización,
  lápida `want`). `hooks/useWanted` avisa a todas las pantallas al cambiar; la colección mezcla las que quieres (las
  que no tienes salen con 0 copias). La sincronización (versión 2) lleva ambas.
- **Migraciones**: `PRAGMA user_version`. Para cambiar el esquema se sube `DATABASE_VERSION` y se añade un paso
  `if (version === N)`; los pasos existentes **no se tocan**.
- `PRAGMA foreign_keys = ON` en cada arranque: borrar un mazo borra sus cartas.
- Filas antiguas sin datos de validación se completan desde Scryfall al abrir su mazo.
- **Deshacer**: `snapshotDeck`/`restoreSnapshot` y `snapshotCollectionCard`/`restoreCollectionRow` copian las filas
  crudas y las reinsertan tal cual (mismo id de mazo).

## 8. Construir: la cola de cartas y el gesto

```mermaid
sequenceDiagram
  participant F as Filtros
  participant Q as useCardQueue
  participant S as Scryfall
  participant C as SwipeCard
  F->>Q: filters nuevos
  Q->>S: searchCards (página 1)
  S-->>Q: cartas
  Q->>Q: quedan ≤ 8 → pide la página siguiente
  Q->>S: precarga de imágenes e idioma preferido (4 siguientes)
  C->>Q: deslizar → siguiente
```

- **`useCardQueue`**: cola paginada. Cada respuesta va etiquetada con los filtros que la pidieron para ignorar respuestas
  viejas. La posición se reinicia durante el render al cambiar la búsqueda.
- **`SwipeCard`**: gesto con `usePanGesture` (RNGH 3) y animación en el hilo de UI; avisa a React con `scheduleOnRN`.
  Los botones lanzan la misma animación con `swipe(dir)`. Se renderiza con `key={card.id}`.
- **`SwipeArea`**: decisiones por id de carta, historial para **deshacer** (cada entrada guarda su posición y el mazo al
  que fue) y flechas ‹ › para pasar sin decidir.

## 9. Hojas inferiores y gestos

`BottomSheet` se monta sobre un `Modal` de React Native (fiable en Android y Expo Go) y se anima con Reanimated:

- **Arrastrar**: la barra superior y cualquier zona envuelta en **`SheetDragArea`** mueven la hoja con el dedo. Cada
  zona crea su propio gesto (solo vertical, así las listas horizontales de dentro siguen funcionando). Si se arrastra
  desde un botón, el toque del botón se cancela. **Nunca** se envuelve una lista vertical.
- **«La tengo» en toda carta**: `OwnPill` (`collection/OwnButton`, acepta `CardRef`) cuenta las copias de la colección por `oracle_id` y añade la impresión con cada toque; `OwnButton` (Construir) es un envoltorio. En el mazo, `OwnedLine` es pulsable (`actions.own`) y la galería marca lo que tienes; `ownedVersion` fuerza a recontar.
- **Código de colores**: `Tone` / `TONE_COLORS` en `theme.ts` (primary dorado, info azul `colors.info`, owned verde,
  warn amarillo, danger rojo). `CardIconButton` y las acciones del mazo aceptan `tone`.
- **Vista de cartas (Construir)**: fila inferior ✕ · idioma · arte · historial · la tengo · ✓ (sin deshacer: el
  historial sirve para volver). `OwnRoundButton` (`collection/OwnButton`) abre un panel − / ＋
  (`removeOneFromCollection`, `getPrintingCount`) y «Ver en mi colección» (`router.navigate('/collection', { q, t })`;
  la pestaña pasa `search` a `CollectionScreen`).
- **Hoja del mazo**: `BottomSheet fullScreen` (dos posiciones, abierta a pantalla completa o cerrada). El aviso de
  cartas que faltan va en el hueco `right` de `DeckSummary`; abrir / cerrar todos los grupos usa el mismo conjunto
  `collapsed` (con el banquillo como `SIDEBOARD_KEY`).
- **`CardSheet`** (`components/`): la ficha de una carta a pantalla completa, como la del PC (cabecera con ‹ ›,
  etiquetas, imagen ampliable y con la otra cara, idioma, otras artes, Cardmarket, compartir, `OwnPill`, «− ＋ al mazo»
  y «a Posibles», en qué mazos está con `getDeckUsage`, texto con `SymbolText`, datos, legalidad y «Ficha completa»).
  La usan el mazo (con `extra`: validación, comandante, portada, banquillo, quitar), la colección y `CardBigView`
  (listas de EDHREC y recomendadas).
- **Globos de ayuda**: `components/Hint` (`useHint` / `HintButton`): pulsación larga en un botón de icono → `measureInWindow` y un `Modal` transparente con su nombre encima durante 1,6 s. Lo usan `CardIconButton`, los botones de acción del mazo y los de vista/agrupar.
- **Arrastrar cartas** (mazo ⇄ banquillo): la imagen de cada carta (y la miniatura en galería y banquillo) va en un `Draggable` (en `DeckSheet`) con
  `usePanGesture({ activateAfterLongPress: 350 })`: un toque normal sigue desplazando la lista o pulsando botones; tras la
  pulsación larga, la posición va a valores compartidos de la hoja, que dibuja una miniatura siguiendo el dedo y una zona
  de soltar abajo (`measureInWindow` de la hoja da su posición). Soltar en la zona llama a `moveCopy`.
- **Agrupar el mazo**: `deck/group.ts` (`groupDeck`: tipo, coste con `curveCost`, color, rareza o nada; comandantes
  primero) y la lista se aplana en cabeceras plegables + cartas (o filas de 3 en galería), así la `FlatList` ya no usa
  `numColumns`. Preferencia `prefs.deckGroup`.
- **`expandable`** (ya no lo usa la hoja del mazo, que va con `fullScreen`): tres paradas, oculta / abierta (`heightRatio`) / pantalla completa. Se maqueta a
  tamaño completo y se desplaza hacia abajo, con relleno inferior en la parada «abierta» para que no se corte el
  contenido.
- **Cierre**: si se cierra arrastrando, la propia animación del gesto termina el trabajo (`dragClosing`); el efecto de
  `visible=false` solo anima los cierres por botón o por tocar fuera.

Los gestos propios se limitan al deslizar de cartas, la `DeckBar` y las hojas: versiones anteriores con paneles
animados a mano chocaban con botones y listas.

## 10. El mazo

- **`DeckBar`** (cerrada) y la cabecera de **`DeckSheet`** comparten **`DeckSummary`**: portada, nombre, formato,
  estado y precio (`useCardDetails`, la misma caché).
- **`DeckSheet`**: parte fija arrastrable (resumen, selector de mazos `DeckPicker` desplegable desde la portada, línea
  de colección con selector de vista y botón de ocultar, aviso de validación de una línea, botones) y debajo la lista
  de cartas (lista / galería / grande).
- **`MissingCardsModal`**: cartas que faltan respecto a la colección, con precio, enlace a Cardmarket y lista para
  copiar.
- **`TokensModal`**: fichas que crean las cartas (agrupadas por nombre y tipo).
- **`CardShareSheet`** (`components/`, botón compartir de cada carta en el mazo y la colección): imagen `large` descargada a la caché con `expo-file-system` (`File.downloadFileAsync`) y compartida con `expo-sharing` (copia antes el enlace al portapapeles, porque Android no deja adjuntar texto a una imagen), enlace de Scryfall con `Share` o copiarlo. El enlace es `scryfallUrl` de `getCardDetails` (`scryfall_uri` sin parámetros).
- **MTG Arena** (`deck/arena.ts`, puro): Arena no tiene API, así que se pasa por el portapapeles. `onArena` usa las
  legalidades guardadas (en Arena, Timeless/Historic/Brawl/Alchemy no son `not_legal`), `arenaName` deja «A // B» solo
  en cartas partidas (instantáneo/conjuro) y la cara frontal en el resto, y `arenaDeckList` arma *Commander* + *Deck*
  sin las cartas que no existen en Arena. Formatos de Arena en `theme.ts` (`ARENA_FORMATS`; Brawl y Standard Brawl
  son de comandante, `commanderDeckSize` en `validation.ts`) y `Filters.arena`: con él o con un formato de Arena,
  `buildQuery` usa `game:arena` en vez de `game:paper`.
- **Importar listas** (`components/ImportListModal`, desde el `DeckPicker` → mazo nuevo, o desde la colección):
  `deck/importList.ts` (puro) lee formatos de Arena, MTGO, Moxfield y Archidekt (`parseDeckList`: secciones
  *Commander* / *Deck* / *Sideboard*…, «Name …» de Arena, `*CMDR*` y categorías `[Commander]`, `(SET) número`, `4x`,
  «A/B» → «A // B»). `resolveCardList` (`scryfall.ts`) busca en `/cards/collection` primero por edición + número
  (solo si el nombre coincide; los códigos propios de Arena no existen en Scryfall) y el resto por nombre (cara
  frontal). Opcionalmente pasa cada carta al idioma preferido (`getCardInLanguage`). Con comandante el mazo se crea en
  formato `commander` y `setCommander`.
- **🌐 en toda carta ampliada**: `LanguagePill` (en `LanguagePicker`, acepta `Card`, id de Scryfall o `{ name }` inglés → `CardRef`) abre `LanguagePickerModal`. En la vista grande del mazo y de la colección cambia la carta guardada (`setDeckCardPrinting` / `changeCollectionPrinting`); en la ficha ⓘ recarga la pantalla con esa impresión (`shownId`); en recomendadas (pasar cartas) la elegida se añade sin re-traducir (`keepLanguage`); en combos, mano de prueba e historial solo cambia la imagen mostrada.
- **Cambiar arte o idioma** (botón lápiz en mazo y colección, un solo botón porque la fila no tiene sitio para dos): `PrintingPicker` pregunta *Arte* / *Idioma* y abre `ArtPickerModal` o `LanguagePickerModal` (en `ArtPicker` / `LanguagePicker`, aceptan una `Card` o un id de Scryfall que cargan primero) + `setDeckCardPrinting` (cambia `scryfall_id`, nombre impreso, imagen y rareza de la fila; mismo `oracle_id`, y la portada si era esa imagen) o `changeCollectionPrinting` (mueve las copias a la otra impresión, sumándolas si ya existe).
- **`ShareDeckModal`** (botón Compartir): dibuja la imagen del mazo en una `View` normal (portada `art_crop`, comandante
  o las 3 cartas más caras, `deckStats`, lista por tipos, pie con el logo), espera a que carguen las imágenes remotas
  (máx. 6 s) y la captura con `react-native-view-shot` (`captureRef`, PNG de 1080 px de ancho) para compartirla con
  `expo-sharing`. «Como texto» usa `Share` con la lista.
- **`DeckStatsScreen`** (botón del gráfico, `Modal` a pantalla completa): pestaña *Estadísticas* (resumen, aviso de
  tierras, curva apilada criaturas / otros, símbolos por color frente a tierras que lo dan, tipos; gráficos hechos con
  `View`, sin librería) y pestaña *Mano de prueba* (biblioteca sin comandantes, barajar, mulligan London eligiendo las
  cartas al fondo, robar). Los cálculos están en **`deck/stats.ts`** (puro): `deckStats` (usa `cmc` de Scryfall;
  `landColors` lee «Add {G}», «any color», tipos básicos y básicas que busca), `buildLibrary`, `shuffle` y
  `landOdds` (hipergeométrica). **Recomendar maná** (`LandRecommender`): `recommendLands` calcula las tierras
  objetivo (37 % del tamaño exacto en formatos con comandante; ~40 % y al menos 24 en construido; se añaden aunque el mazo pase del tamaño, y la validación lo avisa) y las
  reparte entre los colores permitidos (identidad del comandante o los que tienen símbolos) por el déficit de fuentes
  (`apportion`, mayor resto). Las básicas se buscan por nombre inglés (`getCardsByNames`) y se pasan al idioma
  preferido; deshacer restaura una `snapshotDeck` previa.

## 11. La colección

- **`CollectionScreen`**: buscador (filtra la colección y busca en Scryfall a la vez), escáner, filtros y agrupación.
- **`collection/organize.ts`** (puro, sin React): `applyFilter` y `groupCards`. El color sale de los símbolos del coste
  y el coste de maná se calcula de la cadena (las tierras cuentan 0). Las secciones llevan copias y valor.
- La lista es una `FlatList` de elementos aplanados: cabeceras de grupo, cartas (lista) o filas de 3 (galería).
- Los botones de cada carta y la barra de deshacer vienen de **`CardControls`**, compartidos con el mazo.

## 12. Validación de formatos

`src/validation.ts` → `validateDeck(format, cards)` es **pura**: devuelve problemas del mazo y por carta. La app nunca
impide añadir; solo informa. Comprueba tamaño, copias por `oracle_id`, legalidad (guardada de Scryfall), comandante
(elegibilidad, parejas) e identidad de color.

## 13. Escáner de cartas

```mermaid
flowchart LR
  Cam[expo-camera<br/>foto] --> OCR[ML Kit en el móvil<br/>expo-text-extractor]
  OCR --> Parse[parseCardText<br/>edición · idioma · número · nombre]
  Parse -->|edición + número| A["/cards/:set/:number/:lang"]
  A -->|el nombre coincide| OK[Carta]
  Parse -->|si no| B[nombre aproximado o búsqueda]
  B --> OK
```

ML Kit es nativo: **no está en Expo Go** (`scanSupported` es `false` y el escáner lo explica). Las coincidencias
aproximadas de Scryfall se verifican palabra a palabra porque a veces adivina mal.

## 14. Decisiones de diseño

- **«Cartas en la mano», nunca «Tinder»**: la pantalla central es la pila de cartas.
- **Sin límites al añadir**: la validación avisa, no bloquea.
- **Local primero**: sin cuentas; lo vivo (precios) se pide y no se guarda.
- **Deshacer en vez de miedo**: confirmación en lo destructivo y barra de deshacer de 6 s.
- **Iconos** de Material Community Icons; emojis solo donde aún no se han cambiado.

## 15. Compilar y publicar

- **Desarrollo con Expo Go**: `npx expo start --go` (con `expo-dev-client` instalado, `npx expo start` a secas apunta a
  una build de desarrollo).
- **Comprobaciones**: `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor` y
  `npx expo export --platform android --output-dir <tmp>`.
- **APK**: EAS Build, perfil `preview` (`eas.json`). Proyecto `inakipf/magicandroid`, paquete `com.magicswipe.app`.
- **npm 12**: tras `npx expo install <paquete>`, ejecutar `npm install`.
