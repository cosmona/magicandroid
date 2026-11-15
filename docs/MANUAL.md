# 📖 Manual de usuario de Magic Swipe

> Este manual crece con la app: cada vez que algo cambia, se actualiza aquí.
> Versión de la app: **1.0.0** · Última revisión: noviembre de 2026.

Magic Swipe sirve para construir mazos de *Magic: The Gathering* como si tuvieras un puñado de cartas en la mano: las vas
pasando una a una y decides cuáles se quedan. También lleva la cuenta de las cartas que tienes de verdad (tu colección),
te dice cuánto cuestan y te ayuda a comprar las que te faltan.

## Índice

1. [Primeros pasos](#1-primeros-pasos)
2. [La pantalla principal](#2-la-pantalla-principal)
3. [Construir: las cartas en la mano](#3-construir-las-cartas-en-la-mano)
4. [El mazo](#4-el-mazo)
5. [Ficha completa de una carta](#5-ficha-completa-de-una-carta)
6. [Colección](#6-colección)
7. [Ajustes](#7-ajustes)
8. [Precios y Cardmarket](#8-precios-y-cardmarket)
9. [Preguntas frecuentes](#9-preguntas-frecuentes)

---

## 1. Primeros pasos

- **Instalación:** descarga el APK, ábrelo en el móvil y permite instalar apps de origen desconocido. Si ya tenías una
  versión, se instala encima y conservas tus mazos y tu colección.
- **Sin cuenta:** no hay registro ni inicio de sesión. Todo (mazos, colección, ajustes) se guarda en tu móvil.
- **Conexión:** las cartas, imágenes y precios vienen de [Scryfall](https://scryfall.com), así que hace falta internet
  para ver cartas nuevas. Tus mazos y tu colección se pueden consultar sin conexión.
- Al abrir la app verás un momento la pantalla de carga con el logo y el número de versión.

## 2. La pantalla principal

De arriba a abajo:

1. **Cabecera:** «Magic Swipe» y el botón ⚙ de [Ajustes](#7-ajustes).
2. **Pestañas:** **Construir** (cartas) y **Colección** (estantería). La activa se ve en amarillo.
3. El contenido de la pestaña.

La app siempre se abre en **Construir**.

## 3. Construir: las cartas en la mano

### Pasar cartas

| Gesto | Qué hace |
|---|---|
| Deslizar la carta a la **derecha** | La añade al mazo activo (si no tienes ninguno, crea «Mazo sin nombre») |
| Deslizar a la **izquierda** | La descarta |
| Flechas **‹ ›** a los lados | Pasa a la anterior o la siguiente sin decidir nada |
| **↶ Deshacer** | Deshace la última decisión y vuelve a esa carta |

Si vuelves a una carta que ya decidiste, verás «✓ Ya añadida» o «✕ Descartada».

### Encima de la carta

- **🌐 Idioma:** cambia la carta a otro idioma en el que exista.
- **🎨 Arte:** elige entre sus ilustraciones alternativas (primero las de tu idioma, luego las inglesas).
- **📦 La tengo:** añade a tu [colección](#6-colección) la impresión que estás viendo. Si ya la tienes, muestra
  cuántas («Tienes 2 · +1»).

### Historial ▤

El botón ▤ junto al contador abre las miniaturas de las cartas vistas (con su decisión), la actual resaltada y las
siguientes. **Toca** una para saltar a ella; **mantén pulsado** para verla en grande. Al llegar al final carga más.

### Filtros

La fila **Filtros** (debajo de las pestañas) muestra un resumen de lo que estás filtrando; tócala para cambiarlo:

- **Nombre** (en español o inglés, sin importar tildes) y **texto de reglas** (en inglés).
- **Colores**, con tres modos: *jugables en* (para un comandante), *exactamente* o *incluye*; e **incolora**.
- **Tipos** (varios a la vez), **legendaria**, **subtipo**, **coste de maná** mínimo y máximo.
- **Rareza**, **habilidades** (en español), **formato**, **edición** y **orden** de los resultados.

Pulsa **Buscar** para aplicar los filtros.

## 4. El mazo

### La barra del mazo

Abajo del todo está la barra del mazo activo: portada, nombre, formato, número de cartas, si es válido y su precio
aproximado. **Tócala o deslízala hacia arriba** para abrir el mazo.

### Abrir, ampliar y cerrar

La hoja del mazo tiene tres posiciones:

1. **Abierta:** ocupa casi toda la pantalla.
2. **Pantalla completa:** arrastra hacia arriba desde la parte superior.
3. **Cerrada:** arrastra hacia abajo (desde cualquier punto de la parte de arriba, incluidos los botones), toca fuera
   o usa el botón atrás.

### La cabecera

- **Portada y flecha ⌄:** tócalas para desplegar **tus mazos**. Elige uno para cargarlo, o **＋ Nuevo** para crear
  otro. El desplegable se cierra solo al elegir.
- **Nombre, formato, cartas y estado** (✓ válido / ⚠ revisar).
- **≈ precio** del mazo en Cardmarket.
- **📦 «Te faltan N de tu colección»** (amarillo) o «Las tienes todas» (verde): compara el mazo con tu colección.
- **Vistas:** los tres iconos de la derecha cambian entre **lista**, **galería** y **grande**.
- **⋯ / ⌃:** oculta o muestra la fila de botones del mazo, para ganar espacio.
- **Recuadro de validación:** «✓ Mazo válido» o «⚠ N problemas». Tócalo para ver la lista de problemas y las cartas
  afectadas (toca una carta para verla).

### Botones del mazo

| Botón | Qué hace |
|---|---|
| ✎ / 💾 | Editar el nombre y el formato (💾 si el mazo aún no tiene nombre) |
| Compartir | Envía la lista del mazo como texto |
| 🛒 (amarillo) | Comprar en Cardmarket las cartas que te faltan ([ver más](#8-precios-y-cardmarket)) |
| Fichas | Las fichas y emblemas que crean las cartas del mazo, con su imagen |
| Escoba | Vaciar el mazo (pide confirmación) |
| Papelera | Borrar el mazo (pide confirmación) |

### Cada carta del mazo

En las vistas lista y grande, cada carta muestra sus datos (coste con símbolos, rareza, tipos, fuerza/resistencia o
lealtad, precio, cuántas tienes en tu colección y sus problemas de validación) y estos botones:

| Botón | Qué hace |
|---|---|
| **− N +** | Cambia el número de copias. Bajar a 0 la quita |
| 👑 | Elegir comandante (solo en formatos con comandante) |
| ⓘ | Abre la [ficha completa](#5-ficha-completa-de-una-carta) |
| Imagen | Usar la carta como portada del mazo |
| Compartir | Enviar la carta |
| Papelera | Quitarla del mazo (pide confirmación) |

### Deshacer

Al quitar una carta, vaciar o borrar el mazo aparece abajo una barra con **↶ Deshacer** durante 6 segundos. Deshacer
lo devuelve todo tal cual estaba (cantidades, comandante, portada…).

### Reglas que se comprueban

Puedes añadir lo que quieras: el mazo nunca te lo impide, solo te avisa.

| Formato | Comprobaciones |
|---|---|
| Commander, Duel, PreDH, Pauper Commander | Comandante elegido y elegible (dos con *Partner*, *Friends forever* o *Background*), 100 cartas exactas, 1 copia de cada carta, identidad de color y legalidad |
| Oathbreaker | Igual, con un planeswalker como líder y 60 cartas |
| Estándar, Pioneer, Modern, Legacy, Vintage, Pauper, Premodern, Penny | Mínimo 60 cartas, máximo 4 copias (1 si está restringida en Vintage) y legalidad |
| Libre | Sin comprobaciones |

Las tierras básicas y las cartas que permiten cualquier número de copias respetan su propia regla.

## 5. Ficha completa de una carta

El botón **ⓘ** (en el mazo y en la colección) abre una pantalla con **todo lo que Scryfall sabe de esa impresión**.
Debajo de cada dato hay una explicación de qué significa.

- **Carta:** nombre, coste, tipo, texto Oracle (el oficial y actualizado) y texto impreso, fuerza/resistencia,
  colores, identidad de color, palabras clave…
- **Caras:** en cartas de dos caras, partidas o con aventura.
- **Legalidad por formato:** verde legal, rojo prohibida, amarillo restringida.
- **Precios:** Cardmarket, TCGplayer y Magic Online.
- **Popularidad y estatus:** ranking de EDHREC, *Game Changer*, Lista Reservada…
- **Esta impresión:** edición, número, rareza, fecha, ilustrador, acabados, marco…
- **Cartas relacionadas, aclaraciones oficiales** (rulings, en inglés), **identificadores** y **enlaces**.

Usa **←** para volver y **↗** para abrirla en Scryfall.

## 6. Colección

Aquí apuntas las cartas que tienes de verdad. Cada fila es una **impresión** concreta (edición + idioma).

### Añadir cartas

- **Buscando:** escribe en el buscador. Verás tus cartas que coinciden y, debajo, resultados de Scryfall para añadir
  con **＋** (en el idioma de los ajustes si existe).
- **📷 Escáner:** apunta la cámara a una carta y la reconoce (por el nombre y por la edición y el número de abajo).
  Confirma con «＋ Añadir a la colección» o pulsa «↻ No es esta». Si no la reconoce, puedes buscarla a mano. *No funciona
  en Expo Go, solo en la app instalada.*
- **Desde Construir:** botón **📦 La tengo** encima de la carta.

Arriba se muestra el total de cartas, las distintas y el **valor aproximado** de la colección.

### Filtros

El botón **Filtros** abre un panel que se aplica al momento (arriba dice cuántas cartas quedan; **Limpiar** los quita):
color, tipo, coste, rareza, edición, idioma, precio por copia, **uso en mazos** (todas / en algún mazo / libres) y
**solo repetidas** (2 copias o más, útil para cambiar).

### Agrupar

Los botones junto a Filtros agrupan la lista en secciones plegables (toca la cabecera para plegar), cada una con sus
copias y su valor: **Color**, **Tipo**, **Edición** (de la más nueva a la más antigua), **Rareza**, **Coste** y
**Precio** (por tramos).

### Cada carta

| Botón | Qué hace |
|---|---|
| **− N +** | Copias que tienes. Bajar a 0 la quita (se puede deshacer) |
| ⓘ | [Ficha completa](#5-ficha-completa-de-una-carta) |
| Cartas | Añadirla al mazo activo |
| Compartir | Enviar la carta |
| Papelera | Quitarla de la colección (pide confirmación y se puede deshacer) |

Si la carta está en algún mazo verás «En algún mazo» en verde. La vista **galería** (▦) muestra solo las imágenes.

## 7. Ajustes

Botón ⚙ de la cabecera:

- **Idioma de las cartas:** las cartas se muestran en ese idioma cuando existen.
- **Vista del mazo por defecto:** lista, galería o grande.
- **Vibración** al añadir y descartar.
- **Pantalla completa:** oculta los botones de Android (desliza desde abajo para verlos).
- **Restablecer filtros.**

## 8. Precios y Cardmarket

- Los precios son el **precio de tendencia de Cardmarket** que publica Scryfall, actualizado **una vez al día**. Son
  orientativos.
- Scryfall casi nunca da precio a las cartas en español: en ese caso se usa el de la versión inglesa de la misma edición.
- Sin conexión los precios no aparecen.
- **Comprar lo que te falta:** en el mazo, botón 🛒. Verás las cartas que no tienes en tu colección con su precio y el
  total. Toca una para abrir su página en Cardmarket, o **📋 Copiar lista** y pégala en Cardmarket → *Listas de
  deseos* → *Añadir lista de mazo* para comprarlas todas de una vez.

## 9. Preguntas frecuentes

**¿Dónde se guardan mis mazos?** En el móvil. Si desinstalas la app, se pierden.

**He borrado algo sin querer.** Si fue hace menos de 6 segundos, pulsa **↶ Deshacer** en la barra de abajo.

**El escáner dice que no está disponible.** Estás usando Expo Go; el escáner solo funciona en la app instalada (APK).

**Una carta sale sin precio.** Scryfall no tiene precio de esa impresión ni de su versión inglesa (pasa con algunas
promos y ediciones especiales).

<!-- Pendiente de documentar cuando existan: contador de vidas y nuevas herramientas. -->
