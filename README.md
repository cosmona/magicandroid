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
| ▤ **Historial** | Miniaturas de las cartas que has visto, las que te quedaste o descartaste, la actual destacada y las siguientes, con scroll infinito. Toca una para volver a ella. |
| 🔍 **Buscador completo** | Nombre (en español o inglés, sin importar tildes), texto de reglas, colores (*jugables en* / *exactamente* / *incluye*, incolora), varios tipos, legendaria, subtipo, coste de maná mín–máx, rareza, habilidades (224, en español), formato, edición y orden. |
| 🌐 **Idiomas y artes** | Elige el idioma por defecto y las cartas aparecen traducidas si existen. En cada carta puedes cambiar de idioma y elegir entre sus **artes alternativos** 🎨. |
| 📚 **Mazos** | Varios mazos con formato, portada y vista **lista**, **galería** o **grande**. Compartir lista y deslizar para quitar cartas. Todo se guarda en el móvil. |
| ✅ **Validación por formato** | Nada impide añadir cartas: el mazo se comprueba y marca los errores (tamaño, copias, legalidad, comandante 👑 e identidad de color) carta por carta. |
| 📦 **Colección** | Tus cartas reales, por edición e idioma. Búscalas y añádelas o pulsa **📦 La tengo** mientras las pasas. Cada mazo te dice qué cartas tienes y cuáles te faltan. |
| ⚙ **Ajustes** | Idioma de las cartas, vista del mazo por defecto, vibración, pantalla completa y restablecer filtros. |

## ✅ Reglas que se comprueban

| Formato | Comprobaciones |
|---|---|
| **Commander · Duel · PreDH · Pauper Commander** | Comandante elegido (o dos con *Partner* / *Friends forever* / *Background*), elegible, 100 cartas exactas, 1 copia por carta, identidad de color y legalidad |
| **Oathbreaker** | Igual, con un planeswalker como líder y 60 cartas |
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
npx expo start                  # escanea el QR con Expo Go (misma Wi-Fi)
npx expo start --tunnel ngrok   # desde fuera de casa
```

```bash
npx tsc --noEmit        # tipos
npx expo lint           # lint (reglas de React Compiler)
npx expo-doctor         # diagnóstico de dependencias
npx expo export --platform android --output-dir <tmp>   # comprobar que compila
```

> **npm 12:** `npx expo install <paquete>` actualiza `package.json` pero su instalación falla con `EALLOWSCRIPTS`. Ejecuta `npm install` después.

## 🧱 Cómo está hecha

- **Expo Router** con una pestaña por herramienta: **Construir** (las cartas en la mano, donde se abre la app) y **Colección**; aquí irán las próximas (contador de vidas…). Filtros, mazo, historial y ajustes se abren en hojas inferiores.
- **Gestos y animación** con Gesture Handler 3 y Reanimated 4.
- **expo-sqlite** con migraciones versionadas para mazos, colección y ajustes.
- **expo-image** con miniaturas de Scryfall (~15 KB) y precarga de las siguientes cartas para que todo vaya fluido.
- **Cliente de Scryfall** con las cabeceras que exige y un mínimo de 100 ms entre peticiones.

```
src/
├── app/            # pantallas y pestañas (Expo Router)
├── api/            # cliente de Scryfall
├── components/     # cartas, hojas, filtros, mazo, colección, historial, ajustes
├── context/        # estado global (mazo activo, filtros, ajustes)
├── db/             # SQLite: esquema, migraciones y consultas
├── hooks/          # cola de cartas paginada
└── validation.ts   # reglas de cada formato
```

Más detalles para quien desarrolle: [`CLAUDE.md`](CLAUDE.md).

## 🙏 Créditos

- Datos e imágenes de cartas: **[Scryfall](https://scryfall.com)**.
- Iconos de maná, rareza, formatos y tipos: del proyecto web original (*frontmagic*), del que esta app es la versión Android.

<sub>Magic Swipe es un proyecto de fans sin relación con Wizards of the Coast. Magic: The Gathering y sus cartas son marcas y propiedad de Wizards of the Coast LLC. Proyecto no afiliado a Scryfall.</sub>
