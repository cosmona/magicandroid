import { CardSheet } from '@/components/CardSheet';

/**
 * Una carta ampliada desde una lista (sinergias de la info de carta, recomendaciones…), conocida por su
 * id de Scryfall: la ficha de carta completa, en el idioma preferido.
 */
export function CardBigView({ id, onClose }: { id: string; onClose: () => void }) {
  return <CardSheet card={id} onClose={onClose} />;
}
