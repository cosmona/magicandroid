import { useEffect, useState } from 'react';
import { Image as InlineImage, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { Image } from 'expo-image';
import { getSymbols } from '@/api/scryfall';
import { colors } from '@/theme';

// Se carga una vez (Scryfall /symbology) y lo comparten todos los ManaCost en pantalla.
let symbolsLoaded: Record<string, string> | null = null;

/**
 * Un coste de maná como «{2}{R}{R}» o «{1}{U} // {3}» dibujado con los iconos de símbolo de Scryfall
 * (texto hasta que llega la lista de símbolos, o para cualquier símbolo que no conozca).
 */
function useSymbols() {
  const [symbols, setSymbols] = useState(symbolsLoaded);
  useEffect(() => {
    if (symbols) return;
    let cancelled = false;
    getSymbols()
      .then((s) => {
        symbolsLoaded = s;
        if (!cancelled) setSymbols(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbols]);
  return symbols;
}

/** Texto de reglas con sus símbolos ({T}, {R}, {2}…) dibujados en línea como los iconos de Scryfall. */
export function SymbolText({ text, size = 16, style }: { text: string; size?: number; style?: TextStyle }) {
  const symbols = useSymbols();
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <Text style={style} selectable>
      {parts.map((part, i) => {
        const uri = symbols?.[part];
        return uri ? <InlineImage key={i} source={{ uri }} style={{ width: size, height: size }} /> : part;
      })}
    </Text>
  );
}

export function ManaCost({ cost, size = 16 }: { cost: string | null; size?: number }) {
  const symbols = useSymbols();
  if (!cost) return <Text style={styles.text}>—</Text>;
  const parts = cost.match(/\{[^}]+\}|\/\/|[^{}/]+/g) ?? [];
  return (
    <View style={styles.row}>
      {parts.map((part, i) => {
        const uri = symbols?.[part];
        if (uri) {
          return <Image key={i} source={{ uri }} style={{ width: size, height: size }} contentFit="contain" />;
        }
        const text = part.trim();
        return text ? (
          <Text key={i} style={styles.text}>
            {text === '//' ? ' // ' : text}
          </Text>
        ) : null;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 2 },
  text: { color: colors.text, fontSize: 13 },
});
