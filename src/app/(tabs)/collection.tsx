import { useLocalSearchParams } from 'expo-router';
import { CollectionScreen } from '@/components/collection/CollectionScreen';

/** "Colección" tab. `q` (+ `t` to repeat the same search) opens it searching a card. */
export default function CollectionTab() {
  const { q, t } = useLocalSearchParams<{ q?: string; t?: string }>();
  return <CollectionScreen search={q ? { q, t: t ?? '' } : undefined} />;
}
