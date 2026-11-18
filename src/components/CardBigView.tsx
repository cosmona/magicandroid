import { CardSheet } from '@/components/CardSheet';

/**
 * A card enlarged from a list (card info synergies, recommendations…), known by its Scryfall id:
 * the full card sheet, in the preferred language.
 */
export function CardBigView({ id, onClose }: { id: string; onClose: () => void }) {
  return <CardSheet card={id} onClose={onClose} />;
}
