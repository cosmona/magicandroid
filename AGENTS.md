Esta es una aplicación móvil Expo/React Native. Prioriza patrones mobile-first, el rendimiento y la compatibilidad multiplataforma.

## Expo ha cambiado — no te fíes de tus datos de entrenamiento

Expo lanza cambios incompatibles en cada versión del SDK. Las APIs que recuerdas probablemente estén renombradas, movidas o eliminadas. Antes de escribir código que toque una API de Expo, EAS o React Native:

1. Lee la versión mayor del paquete `expo` en `package.json`.
2. Consulta la documentación versionada correspondiente: `https://docs.expo.dev/versions/v<major>.0.0/`
3. Para cualquier otra cosa, consulta https://docs.expo.dev/llms.txt — un índice de toda la documentación de Expo con correcciones a los errores comunes de los LLM. Sigue sus enlaces a la página concreta que necesites; nunca respondas de memoria.

## Comandos

Usa `bunx` en vez de `npx` si el proyecto usa bun (hay `bun.lock`).

```bash
npx expo install <package>  # usa SIEMPRE esto en vez de npm/yarn/pnpm/bun add — resuelve versiones compatibles con el SDK
npx expo start              # arranca el servidor de desarrollo
npx expo lint               # lint
npx tsc --noEmit            # comprobación de tipos
npx expo-doctor             # diagnostica problemas de dependencias y configuración
npx expo install --fix      # arregla versiones de paquetes incompatibles
```

Ejecuta lint y typecheck antes de dar por terminada cualquier tarea.

## Navegación y rutas

- Usa **Expo Router** para toda la navegación. Las rutas viven en `src/app/` — cada archivo ahí es una pantalla, los `_layout.tsx` definen los navegadores. Mantén el código que no es ruta (componentes, hooks, utilidades) fuera de `src/app/`.
- Importa `Link`, `router` y `useLocalSearchParams` de `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Compilar con EAS

Usa EAS para compilar, firmar y enviar la app en la nube (`eas build`, `eas submit`) y para publicar actualizaciones over-the-air (`eas update`) — sin necesidad de Xcode ni Android Studio en local. Ejecuta el CLI de EAS como `bunx eas-cli <command>` en proyectos con Bun, o `npx eas-cli@latest <command>` si no; sustituye eso por el `eas` a secas de los ejemplos de la documentación.
Docs: https://docs.expo.dev/eas/index.md

## Reglas

- Si no existen las carpetas `ios/` y `android/`, se generan (Continuous Native Generation). Nunca las crees ni las edites a mano — configura el comportamiento nativo en `app.json` y en config plugins.
- Expo Go solo incluye sus módulos nativos empaquetados. Tras añadir una librería con código nativo, la app necesita una development build: `npx expo run:ios|android` en local, o `eas build --profile development`.
- Prefiere los módulos recomendados de Expo antes que librerías de terceros, y revisa tus skills disponibles antes de añadir dependencias. Docs: https://docs.expo.dev/versions/latest/index.md
