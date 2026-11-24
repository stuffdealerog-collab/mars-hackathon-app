/**
 * The approval queue as a deck: the front card sits in the normal flow, the
 * cards behind it are bare edges with no content, so nothing bleeds through
 * and the deck is exactly as tall as the card you are deciding on.
 */
export function DeckStack({
  why,
  depth,
  leaving = false,
  children,
}: {
  why: React.ReactNode;
  /** how many cards wait behind the front one (0–2 drawn) */
  depth: number;
  leaving?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="deck" data-leaving={leaving || undefined}>
      <p className="deck__why">
        <span className="lamp__you" aria-hidden />
        {why}
      </p>
      <div className="relative">
        {depth >= 2 && <span className="deck__edge" data-depth="2" aria-hidden />}
        {depth >= 1 && <span className="deck__edge" data-depth="1" aria-hidden />}
        <div className="deck__front">{children}</div>
      </div>
    </div>
  );
}
