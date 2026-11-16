<p align="center">
  <img src="assets/logo.png" width="300" alt="Magic Swipe" />
</p>

<h1 align="center">Magic Swipe</h1>

<p align="center">
  <b>Construye mazos de Magic: The Gathering como si tuvieras un puñado de cartas en la mano.</b><br />
  Ve pasándolas una a una: la que te gusta va al mazo, la que no, fuera.
</p>

<p align="center">
  <img alt="Expo SDK 58" src="https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white" />
  <img alt="React Native" src="https://img.shields.io/badge/React%20Native-0.88-61DAFB?logo=react&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white" />
  <img alt="Scryfall API" src="https://img.shields.io/badge/datos-Scryfall-c13ad8" />
  <img alt="Android" src="https://img.shields.io/badge/plataforma-Android-3DDC84?logo=android&logoColor=white" />
</p>

---

## 🃏 La idea

Abres la app y tienes cartas en la mano. Las miras de una en una, como cuando revisas un montón sobre la mesa:
**deslízala a la derecha** y entra en tu mazo, **a la izquierda** y la apartas. Si quieres solo mirar, pasa con las
flechas ‹ › sin decidir nada. Todo lo demás (filtros, el mazo, tu colección) está a un toque, pero lo central
son siempre las cartas.

## ✨ Qué hace

| | |
|---|---|
| 🃏 **Cartas en la mano** | Las cartas llegan de [Scryfall](https://scryfall.com) una a una. Derecha para quedártela, izquierda para descartarla, flechas ‹ › para pasar sin decidir y **deshacer** ↶. |
| ▤ **Historial** | Miniaturas de las cartas que has visto y su decisión, la actual destacada y las siguientes. Toca una para volver a ella. |
| 🔍 **Buscador completo** | Nombre (en español o inglés, sin importar tildes), texto de reglas, colores (*jugables en* / *exactamente* / *incluye*), tipos, subtipo, coste, rareza, habilidades en español, formato, edición y orden. |
| 🌐 **Idiomas y artes** | Las cartas aparecen en tu idioma si existen, y en cada una puedes cambiar de idioma o elegir entre sus **artes alternativos** 🎨. |
| 📚 **Mazos** | Varios mazos con formato y portada, en vista **lista**, **galería** o **grande**. La hoja del mazo se arrastra y se amplía a pantalla completa; quitar, vaciar o borrar se puede **deshacer**. |
| ✅ **Validación por formato** | Nada impide añadir cartas: el mazo se comprueba y marca los errores (tamaño, copias, legalidad, comandante 👑 e identidad de color). |
| 💶 **Precios y Cardmarket** | Precio del mazo, de cada carta y de tu colección. El carrito 🛒 te enseña lo que te falta con su coste y te lleva a Cardmarket o copia la lista para comprarlo todo de una vez. |
| ⓘ **Ficha completa** | Todo lo que Scryfall sabe de una carta (reglas, legalidad, precios, rankings, impresión, aclaraciones oficiales…) con la explicación de cada dato. |
| 🧩 **Sinergias y combos** | Cómo se juega cada carta en Commander y sus cartas afines ([EDHREC](https://edhrec.com)), sus combos y los que tu mazo tiene o está a una carta de tener ([Commander Spellbook](https://commanderspellbook.com)), y recomendaciones para tu comandante. |
| 📊 **Estadísticas y mano de prueba** | Curva de maná, colores (símbolos frente a tierras que los dan), tipos y aviso de tierras. **Recomendar maná** añade las tierras básicas que faltan, repartidas por colores (como en Arena). Roba una mano de 7, haz mulligan y roba turno a turno. |
| 🖼️ **Compartir como imagen** | Una imagen del mazo lista para WhatsApp o redes: portada, comandante, curva, colores y la lista por tipos. |
| 🎮 **MTG Arena** | Formatos de Arena, filtro «Solo cartas de Arena» y **copiar el mazo para Arena** (Mazos → Importar), avisando de las cartas que no existen allí. |
| 📥 **Importar listas** | Pega un mazo exportado de Arena, Moxfield, Archidekt o MTGO (o cualquier lista «4 Nombre») para crear un mazo o sumarlo a la colección. |
| 🪙 **Fichas** | Las fichas y emblemas que crean las cartas de tu mazo, con su imagen. |
| ❤️ **Contador de vidas** | De 2 a 6 jugadores alrededor del móvil, con veneno, daño de comandante, quién empieza y dados. La pantalla no se apaga y la partida se guarda sola. |
| 📦 **Colección** | Tus cartas reales por edición e idioma: añádelas buscando, con **📷 el escáner** (reconoce la carta con la cámara) o con **📦 La tengo**. Filtros (color, tipo, coste, rareza, edición, idioma, precio, uso en mazos, repetidas) y agrupaciones (color, tipo, edición, rareza, coste, precio). Cada mazo te dice cuántas cartas te faltan. |
| ⚙ **Ajustes** | Idioma de las cartas, vista del mazo por defecto, vibración, pantalla completa y restablecer filtros. |

👉 Todo explicado paso a paso en el **[manual de usuario](docs/MANUAL.md)**.

## ✅ Reglas que se comprueban

| Formato | Comprobaciones |
|---|---|
| **Commander · Duel · PreDH · Pauper Commander** | Comandante elegido (o dos con *Partner* / *Friends forever* / *Background*), elegible, 100 cartas exactas, 1 copia por carta, identidad de color y legalidad |
| **Oathbreaker** | Igual, con un planeswalker como líder y 60 cartas |
| **Brawl · Standard Brawl** (Arena) | Como Commander (100 / 60 cartas), con criatura o planeswalker legendario de comandante |
| **Historic · Timeless · Alchemy** (Arena) | Como Estándar |
| **Estándar · Pioneer · Modern · Legacy · Vintage · Pauper · Premodern · Penny** | Mínimo 60 cartas, máximo 4 copias (1 si está restringida en Vintage) y legalidad |
| **Libre** | Sin comprobaciones |

Las tierras básicas y las cartas con *"any number of cards named"* o *"up to N cards named"* respetan sus propias reglas.

## 📲 Instalarla

Descarga el APK de la última compilación desde [EAS](https://expo.dev/accounts/inakipf/projects/magicandroid/builds),
ábrelo en el móvil y permite instalar apps de origen desconocido.

Para generar uno nuevo:

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

## 🚀 Desarrollo

Necesitas [Node.js](https://nodejs.org) y la app **Expo Go** en el móvil.

```bash
git clone https://github.com/cosmona/magicandroid.git
cd magicandroid
npm install
npx expo start --go                  # escanea el QR con Expo Go (misma Wi-Fi)
npx expo start --go --tunnel ngrok   # desde fuera de casa
```

```bash
npx tsc --noEmit        # tipos
npx expo lint           # lint (reglas de React Compiler)
npx expo-doctor         # diagnóstico de dependencias
npx expo export --platform android --output-dir <tmp>   # comprobar que compila
```

> **npm 12:** `npx expo install <paquete>` actualiza `package.json` pero su instalación falla con `EALLOWSCRIPTS`. Ejecuta `npm install` después.

## 🧱 Cómo está hecha

- **Expo Router** con las herramientas en pestañas arriba: **Construir** (las cartas en la mano, donde se abre la app) y **Colección**; aquí irán las próximas (contador de vidas…). Filtros, mazo, historial y ajustes se abren en hojas inferiores arrastrables.
- **Gestos y animación** con Gesture Handler 3 y Reanimated 4.
- **expo-sqlite** con migraciones versionadas para mazos, colección y ajustes. Sin cuentas ni servidor.
- **Scryfall** para cartas, imágenes, precios, símbolos y aclaraciones, con las cabeceras que exige y 100 ms entre peticiones.
- **Google ML Kit** en el móvil para leer las cartas con la cámara.

```
src/
├── app/            # pantallas y pestañas (Expo Router)
├── api/            # cliente de Scryfall
├── collection/     # filtros y agrupaciones de la colección
├── components/     # cartas, hojas, mazo, colección, ficha completa, filtros, ajustes
├── context/        # estado global (mazo activo, filtros, ajustes)
├── db/             # SQLite: esquema, migraciones y consultas
├── hooks/          # cola de cartas, precios y datos vivos
├── scan/           # reconocimiento de cartas por OCR
└── validation.ts   # reglas de cada formato
```

📐 La explicación completa está en **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)**; las notas para desarrollar con IA, en [`CLAUDE.md`](CLAUDE.md).

## 🙏 Créditos

- Datos e imágenes de cartas: **[Scryfall](https://scryfall.com)**.
- Iconos de maná, rareza, formatos y tipos: del proyecto web original (*frontmagic*), del que esta app es la versión Android.

<sub>Magic Swipe es un proyecto de fans sin relación con Wizards of the Coast. Magic: The Gathering y sus cartas son marcas y propiedad de Wizards of the Coast LLC. Proyecto no afiliado a Scryfall.</sub>
