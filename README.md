<p align="center">
  <img src="assets/logo.svg" width="160" alt="Magic Swipe logo" />
</p>

<h1 align="center">Magic Swipe</h1>

<p align="center">
  <b>Construye mazos de Magic: The Gathering deslizando cartas, como en Tinder.</b><br />
  Derecha para añadir · Izquierda para descartar
</p>

<p align="center">
  <img alt="Expo SDK 58" src="https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white" />
  <img alt="React Native" src="https://img.shields.io/badge/React%20Native-0.88-61DAFB?logo=react&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white" />
  <img alt="Scryfall API" src="https://img.shields.io/badge/datos-Scryfall-c9a227" />
  <img alt="Android" src="https://img.shields.io/badge/plataforma-Android-3DDC84?logo=android&logoColor=white" />
</p>

---

## ✨ Qué hace

| | |
|---|---|
| 🃏 **Swipe de cartas** | Las cartas llegan de [Scryfall](https://scryfall.com) una a una. Desliza a la derecha para añadirla al mazo y a la izquierda para descartarla. También con botones ✕ / ✓ y **deshacer** ↶. |
| 🔍 **Buscador completo** | Nombre (en español o inglés, sin importar tildes), texto de reglas, colores (*jugables en* / *exactamente* / *incluye*, incolora), varios tipos, legendaria, subtipo, coste de maná mín–máx, rareza, habilidades (224, en español), formato, edición y orden. |
| 🌐 **Idiomas** | Elige el idioma por defecto en Ajustes y las cartas aparecen traducidas si Scryfall las tiene. En cada carta puedes cambiar a cualquier idioma disponible. |
| 📚 **Mazos** | Varios mazos con formato, portada, vista **lista**, **galería** o **grande**, compartir lista y deslizar para quitar cartas. Todo se guarda en **SQLite** en el móvil. |
| ✅ **Validación por formato** | Nada impide añadir cartas: el mazo se comprueba y marca los errores (tamaño, copias, legalidad, comandante 👑 e identidad de color) carta por carta. |
| ▤ **Historial** | Miniaturas de lo que has ido viendo, con lo que añadiste o descartaste, la carta actual destacada y las siguientes, con scroll infinito. |
| ⚙ **Ajustes** | Idioma de las cartas, vista del mazo por defecto, vibración y restablecer filtros. |

## ✅ Reglas que se comprueban

| Formato | Comprobaciones |
|---|---|
| **Commander · Duel · PreDH · Pauper Commander** | Comandante elegido (o dos con *Partner* / *Friends forever* / *Background*), elegible, 100 cartas exactas, 1 copia por carta, identidad de color y legalidad |
| **Oathbreaker** | Igual, con un planeswalker como líder y 60 cartas |
| **Estándar · Pioneer · Modern · Legacy · Vintage · Pauper · Premodern · Penny** | Mínimo 60 cartas, máximo 4 copias (1 si está restringida en Vintage) y legalidad |
| **Libre** | Sin comprobaciones |

Las tierras básicas y las cartas con *"any number of cards named"* o *"up to N cards named"* respetan sus propias reglas.

## 🚀 Probarla en tu móvil

Necesitas [Node.js](https://nodejs.org) y la app **Expo Go** en el móvil (Google Play).

```bash
git clone https://github.com/cosmona/magicandroid.git
cd magicandroid
npm install
npx expo start
```

Escanea el código QR con Expo Go (móvil y PC en la misma Wi-Fi).

**¿Fuera de casa?** Usa el túnel: `npx expo start --tunnel ngrok` y abre en Expo Go la dirección `exp://…exp.direct` que aparece.

> **npm 12:** `npx expo install <paquete>` actualiza `package.json` pero su instalación falla con `EALLOWSCRIPTS`. Ejecuta `npm install` después.

## 🛠️ Desarrollo

```bash
npx tsc --noEmit        # tipos
npx expo lint           # lint (reglas de React Compiler)
npx expo-doctor         # diagnóstico de dependencias
npx expo export --platform android --output-dir <tmp>   # comprobar que compila
```

## 🧱 Cómo está hecha

- **Expo Router** con una sola pantalla. Filtros, mazo, historial y ajustes se abren en hojas inferiores (`BottomSheet`, sobre el `Modal` de React Native).
- **Gestos y animación** con Gesture Handler 3 y Reanimated 4: swipe de cartas y deslizar para borrar.
- **expo-sqlite** con migraciones versionadas (`PRAGMA user_version`) para mazos, cartas y ajustes.
- **expo-image** con miniaturas `small` de Scryfall (~15 KB) y precarga de las siguientes cartas para que todo vaya fluido.
- **Cliente de Scryfall** con las cabeceras que exige y un mínimo de 100 ms entre peticiones.

```
src/
├── app/            # rutas (Expo Router)
├── api/            # cliente de Scryfall
├── components/     # swipe, hojas, filtros, mazo, historial, ajustes
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
