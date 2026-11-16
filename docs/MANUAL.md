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
9. [Sinergias y combos](#9-sinergias-y-combos)
10. [Estadísticas y mano de prueba](#10-estadísticas-y-mano-de-prueba)
11. [Contador de vidas](#11-contador-de-vidas)
12. [Preguntas frecuentes](#12-preguntas-frecuentes)

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
2. **Pestañas:** **Construir** (cartas), **Colección** (estantería) y **Vidas** (corazón, el
   [contador de vidas](#11-contador-de-vidas)). La activa se ve en amarillo.
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
- **Solo cartas de MTG Arena:** muestra solo las cartas que existen en Arena (incluidas las de Alchemy, que no existen
  en papel). Los formatos de Arena (Historic, Timeless, Alchemy, Brawl, Standard Brawl) ya buscan cartas de Arena.

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

- **Portada y flecha ⌄:** tócalas para desplegar **tus mazos**. Elige uno para cargarlo, **＋ Nuevo** para crear
  otro o **Importar** para pegar una lista ([ver más](#importar-una-lista)). El desplegable se cierra solo al elegir.
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
| Compartir | Crea una **imagen del mazo** para mandar por WhatsApp o redes: portada, comandante (o las 3 cartas más caras), tierras, coste medio, curva, colores y la lista por tipos. También se puede enviar **como texto** o copiar **para MTG Arena** ([ver más](#pasar-un-mazo-a-mtg-arena)) |
| 🛒 (amarillo) | Comprar en Cardmarket las cartas que te faltan ([ver más](#8-precios-y-cardmarket)) |
| Gráfico de barras | [Estadísticas y mano de prueba](#10-estadísticas-y-mano-de-prueba) |
| Pieza de puzle | [Sinergias y combos](#9-sinergias-y-combos) del mazo |
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
| Compartir | Enviar la **imagen** de la carta (y copiar su enlace de Scryfall para pegarlo al lado), enviar solo el **enlace de Scryfall** o copiarlo |
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
| Brawl (Arena) | Como Commander, con 100 cartas; el comandante puede ser una criatura o un planeswalker legendario |
| Standard Brawl (Arena) | Igual que Brawl, con 60 cartas |
| Historic, Timeless, Alchemy (Arena) | Como Estándar: mínimo 60 cartas, máximo 4 copias y legalidad |
| Estándar, Pioneer, Modern, Legacy, Vintage, Pauper, Premodern, Penny | Mínimo 60 cartas, máximo 4 copias (1 si está restringida en Vintage) y legalidad |
| Libre | Sin comprobaciones |

Las tierras básicas y las cartas que permiten cualquier número de copias respetan su propia regla. En los formatos de
Arena, una carta que no existe en Arena sale como «No es legal».

### Pasar un mazo a MTG Arena

Arena no deja que otras apps lean ni cambien sus datos, así que se hace copiando y pegando:

1. En el mazo, pulsa **Compartir** y luego **Arena**. La lista se copia en el formato que entiende Arena (nombres en
   inglés y, si el mazo tiene comandante, su sección *Commander*).
2. En MTG Arena (móvil o PC): **Mazos → Importar**. Las cartas que no tengas se pueden crear con comodines.

Las cartas que no existen en Arena se quedan fuera de la lista (si no, Arena rechazaría todo el mazo) y la app te dice
cuáles son.

### Importar una lista

Para traer un mazo de MTG Arena, Moxfield, Archidekt, MTGO o cualquier lista con una carta por línea («4 Lightning
Bolt», «1x Sol Ring (CMR) 472»):

1. Copia la lista (en Arena: en el mazo, *Exportar*).
2. Despliega tus mazos (portada ⌄) y pulsa **Importar**. En la colección, el botón de importar está junto a 📷.
3. **Pegar del portapapeles**, revisa el resumen (cartas, comandante, banquillo) y pulsa **Crear el mazo** o **Añadir a
   la colección**.

- Se respeta la edición cuando la lista la indica; si no, se usa la habitual de Scryfall.
- Con **En tu idioma** activado se busca cada carta en tu idioma (tarda un poco con listas largas).
- Si la lista tiene sección *Commander* (o la etiqueta de comandante de Archidekt), el mazo se crea en formato
  Commander con su comandante 👑. Si no, en formato Libre: cámbialo con ✏️.
- El banquillo (*Sideboard*, *Maybeboard*) no se importa. Al terminar verás las cartas que no se encontraron.

## 5. Ficha completa de una carta

El botón **ⓘ** (en el mazo y en la colección) abre una pantalla con **todo lo que Scryfall sabe de esa impresión**.
Debajo de cada dato hay una explicación de qué significa.
Cada bloque se **pliega y despliega** tocando su título (flecha a la derecha), para ir directo a lo que buscas.

- **Carta:** nombre, coste, tipo, texto Oracle (el oficial y actualizado) y texto impreso, fuerza/resistencia,
  colores, identidad de color, palabras clave…
- **Caras:** en cartas de dos caras, partidas o con aventura.
- **Legalidad por formato:** verde legal, rojo prohibida, amarillo restringida.
- **Precios:** Cardmarket, TCGplayer y Magic Online.
- **Popularidad y estatus:** ranking de EDHREC, *Game Changer*, Lista Reservada…
- **Esta impresión:** edición, número, rareza, fecha, ilustrador, acabados, marco…
- **Cartas relacionadas, aclaraciones oficiales** (rulings, en inglés), **identificadores** y **enlaces**.
- **Sinergias:** cómo se usa en Commander, sus cartas afines si puede ser comandante y sus combos
  ([ver más](#9-sinergias-y-combos)).

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
- **Importar una lista** (botón junto a 📷): pega una lista de cartas, por ejemplo la exportación de otra web, y se
  suman todas a la colección con su edición si la lista la indica ([ver más](#importar-una-lista)).

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
| Compartir | Enviar la **imagen** de la carta (y copiar su enlace de Scryfall para pegarlo al lado), enviar solo el **enlace de Scryfall** o copiarlo |
| Papelera | Quitarla de la colección (pide confirmación y se puede deshacer) |

Si la carta está en algún mazo verás «En algún mazo» en verde. La vista **galería** (▦) muestra solo las imágenes.

## 7. Ajustes

Botón ⚙ de la cabecera:

- **Idioma de las cartas:** las cartas se muestran en ese idioma cuando existen.
- **Vista del mazo por defecto:** lista, galería o grande.
- **Vibración** al añadir y descartar.
- **Pantalla completa:** oculta los botones de Android (desliza desde abajo para verlos).
- **Precios:** un interruptor para cada sitio donde salen precios, por si prefieres no verlos:
  - **Precio del mazo** (barra y cabecera del mazo).
  - **Cartas del mazo** (el precio de cada carta).
  - **Lo que te falta (🛒)** (total y precio de cada carta al comprar).
  - **Colección** (valor total, de cada grupo y de cada carta, y el filtro y la agrupación por precio).
  - **Ficha completa** (la sección «Precios»).
- **Restablecer filtros.**

## 8. Precios y Cardmarket

- Los precios son el **precio de tendencia de Cardmarket** que publica Scryfall, actualizado **una vez al día**. Son
  orientativos.
- Scryfall casi nunca da precio a las cartas en español: en ese caso se usa el de la versión inglesa de la misma edición.
- Sin conexión los precios no aparecen.
- Puedes ocultarlos en cada sección desde [Ajustes → Precios](#7-ajustes).
- **Comprar lo que te falta:** en el mazo, botón 🛒. Verás las cartas que no tienes en tu colección con su precio y el
  total. Toca una para abrir su página en Cardmarket, o **📋 Copiar lista** y pégala en Cardmarket → *Listas de
  deseos* → *Añadir lista de mazo* para comprarlas todas de una vez.

## 9. Sinergias y combos

Scryfall no sabe qué cartas funcionan bien juntas, así que la app lo consulta en dos webs de la comunidad:

- **[EDHREC](https://edhrec.com):** analiza cientos de miles de mazos de Commander publicados en internet.
- **[Commander Spellbook](https://commanderspellbook.com):** la base de datos de combos conocidos.

### En la ficha de una carta (ⓘ)

- **Uso en Commander:** en cuántos mazos se juega y qué porcentaje de los que podrían llevarla (los de sus colores),
  su «sal» (cuánto molesta a los rivales, de 0 a 4), los comandantes que más la usan y las cartas que más la acompañan.
- **Como comandante** (solo criaturas legendarias y cartas que pueden serlo): cuántos mazos la llevan de comandante y
  sus cartas de **más sinergia**. La sinergia es cuánto más aparece una carta en los mazos de ese comandante que en la
  media de mazos de sus colores: +30 % significa que es una elección muy propia de ese comandante.
- **Combos:** los 10 combos más jugados en los que participa. Cada uno muestra sus cartas, qué consigue (maná
  infinito, ganar la partida…), el maná para empezar y en cuántos mazos se juega. «Cómo funciona» despliega los
  requisitos y los pasos (en inglés); el enlace lleva a Commander Spellbook.

### En el mazo (botón de la pieza de puzle)

Se abre una pantalla con dos pestañas:

- **Combos:** los que el mazo ya tiene completos y los que están **a una carta** (la que falta, marcada en amarillo).
  Funciona con cualquier formato.
- **Recomendadas:** las cartas de más sinergia para el **comandante** del mazo que aún no tienes, con **＋** para
  añadirlas (en tu idioma si existe). Necesita un formato con comandante y haberlo elegido con 👑. Con dos comandantes
  se usa el primero.
  - Tres vistas con los botones de arriba: **Lista** (con su sinergia y uso), **Galería** (imágenes en 3 columnas) y
    **Pasar cartas**: las recomendadas te llegan a la mano una a una, como en Construir. Derecha (o ✓) la añade al
    mazo, izquierda (o ✕) la descarta. Llega hasta las 100 de más sinergia y cuenta cuántas llevas añadidas.

Estas webs no son oficiales: si cambian, alguna sección puede dejar de cargar hasta que se actualice la app.

## 10. Estadísticas y mano de prueba

El botón del **gráfico de barras** del mazo abre una pantalla con dos pestañas.

### Estadísticas

- **Cartas, tierras y coste medio** (el coste medio no cuenta las tierras), y un aviso si tienes **pocas o muchas
  tierras** para el tamaño del mazo: con 100 cartas se suelen jugar 35-38; con 60, unas 22-26. Es orientativo: un mazo
  de costes muy bajos puede ir con menos.
- **Recomendar maná** (como en Arena): añade las **tierras básicas** que faltan para llegar a lo recomendado, en tu
  idioma. Las reparte según los símbolos de maná de cada color y las tierras que ya los dan, así que van primero a los
  colores que andan cortos. Antes de añadirlas te enseña cuántas de cada tipo; después puedes **deshacer**. En
  Commander solo usa los colores del comandante; si con las tierras el mazo pasa de 100 cartas, te avisa y el
  aviso de reglas del mazo te lo recordará hasta que quites hechizos.
- **Curva de maná:** cuántas cartas hay de cada coste, separando criaturas y otros hechizos. La última columna junta
  las de coste 7 o más.
- **Colores:** qué parte de los símbolos de maná de los costes es de cada color, y cuántas tierras pueden dar ese color.
  Si un color tiene muchos símbolos y pocas tierras, te costará lanzar esas cartas.
- **Tipos:** cuántas criaturas, tierras, instantáneos, etc. lleva el mazo.

### Mano de prueba

Baraja el mazo y roba 7 cartas, como al empezar una partida (sin el comandante, que empieza fuera).

- **Nueva mano:** vuelve a barajar y roba 7.
- **Mulligan:** baraja y roba 7 otra vez; después toca tantas cartas como mulligans lleves para ponerlas **al fondo**
  (regla actual del mulligan). Puedes cambiar de idea tocándolas de nuevo antes de robar.
- **Robar:** roba la siguiente carta, para ver cómo sigue la partida turno a turno.
- Toca una carta para verla en grande. Debajo verás la probabilidad de que la mano inicial traiga entre 2 y 4 tierras.

## 11. Contador de vidas

La pestaña **Vidas** es un contador para partidas de 2 a 6 jugadores. Deja el móvil en el centro de la mesa: los
jugadores de la fila de arriba ven sus números del derecho desde el otro lado. Mientras estás en esta pestaña la
pantalla no se apaga.

- **Vidas:** toca la mitad **izquierda** de tu recuadro para restar 1 y la **derecha** para sumar 1. Mantén pulsado
  para restar o sumar 10. Encima del número aparece el cambio acumulado (por ejemplo «−5») durante un momento.
- **Veneno y daño de comandante:** el botón de abajo de cada recuadro muestra tu veneno y el mayor daño de comandante
  que has recibido. Al tocarlo puedes cambiar tu nombre y color, el **veneno** y el **daño de comandante** recibido de
  cada rival. El daño de comandante también resta vidas.
- **Eliminado:** el recuadro marca ☠ cuando un jugador se queda sin vidas, llega a 10 de veneno o recibe 21 de daño
  del mismo comandante.
- **Menú (⚙ amarillo del centro):**
  - **Nueva partida:** elige el número de jugadores y las vidas iniciales (20, 25, 30 o 40; Commander usa 40). Se
    mantienen los nombres y colores.
  - **¿Quién empieza?:** sortea un jugador y le pone una 👑.
  - **Dado de 6, dado de 20 y moneda.**

La partida se guarda sola: si cambias de pestaña o cierras la app, sigue donde la dejaste.

## 12. Preguntas frecuentes

**¿Dónde se guardan mis mazos?** En el móvil. Si desinstalas la app, se pierden.

**He borrado algo sin querer.** Si fue hace menos de 6 segundos, pulsa **↶ Deshacer** en la barra de abajo.

**El escáner dice que no está disponible.** Estás usando Expo Go; el escáner solo funciona en la app instalada (APK).

**Una carta sale sin precio.** Scryfall no tiene precio de esa impresión ni de su versión inglesa (pasa con algunas
promos y ediciones especiales).

<!-- Pendiente de documentar cuando existan: contador de vidas y nuevas herramientas. -->
