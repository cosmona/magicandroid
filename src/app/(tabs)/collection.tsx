import { useLocalSearchParams } from 'expo-router';
import { CollectionScreen } from '@/components/collection/CollectionScreen';

/** Pestaña «Colección». `q` (+ `t` para repetir la misma búsqueda) la abre buscando una carta. */
export default function CollectionTab() {
  const { q, t } = useLocalSearchParams<{ q?: string; t?: string }>();
  return <CollectionScreen search={q ? { q, t: t ?? '' } : undefined} />;
}
