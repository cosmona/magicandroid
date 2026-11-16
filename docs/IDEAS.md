# 💡 Ideas para Magic Swipe

Ideas de funciones nuevas, ordenadas de más a menos interesantes. Cuando una se haga, se pasa al
[manual](MANUAL.md) y se quita de aquí.

## 1. Construir alrededor de una carta ⭐

Eliges una carta o un comandante y el montón de cartas que pasas con el dedo deja de salir de una búsqueda: son las
cartas que **EDHREC** recomienda para ella, de más a menos sinergia. Derecha al mazo, izquierda fuera.

- Construir un mazo de Commander se convierte en pasar 150 cartas buenas en vez de buscarlas.
- Encaja con la idea de la app: tener las cartas en la mano.
- Reutiliza lo que ya existe: el gesto, la cola de cartas (`useCardQueue`) y EDHREC (`api/synergy.ts`).
- **Ya hecho en parte:** en las sinergias del mazo, Recomendadas → «Pasar cartas» (`RecommendSwipe`). Falta poder
  empezar desde cualquier carta o comandante sin tener ya un mazo con él (por ejemplo, desde su ficha ⓘ o en Construir).

## 2. ¿Qué puedo construir con mi colección?

Cruza tu colección con EDHREC y te dice qué comandantes tienes casi completos.

- Ejemplo: «Tienes el 72 % de un mazo típico de Atraxa; te faltan 28 cartas por 41 €».
- Con Commander Spellbook: los **combos que ya tienes en la colección** sin saberlo.

## 3. Abrir sobres virtuales

Eliges una edición y abres sobres con la distribución real de rarezas (comunes, infrecuentes y una rara o mítica).

- Las cartas llegan a la mano una a una, como al abrir un sobre de verdad.
- Con 6 sobres montas un mazo **Sealed**: sirve para practicar antes de un presentación de una edición.

## 4. Intercambio entre dos móviles por QR

Cada uno enseña un QR con lo que busca, y la app cruza las cartas que el otro tiene repetidas en su colección.

- Muy útil para cambiar cartas en la tienda o en un torneo.

## 5. Copia de seguridad y restauración 🔴

Lo más urgente: los mazos y la colección solo están en el móvil, y si se desinstala la app se pierden.

- Exportar todo a un archivo que se pueda guardar en Drive o mandar por WhatsApp, e importarlo después.

## 6. Lista de deseos

Las cartas que quieres conseguir, con su precio y enlace a Cardmarket.

## 7. Foil y estado en la colección

Marcar cada carta como foil y su estado (Mint, Near Mint…) para afinar su valor.

---

**Recomendación:** empezar por la **1**, que es lo que más diferencia a la app de Moxfield o Archidekt, y seguir con la
**2**, que aprovecha la colección.
