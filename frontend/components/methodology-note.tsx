export function MethodologyNote() {
  return (
    <p className="mb-4 text-xs text-muted-foreground">
      <span className="font-medium">Méthodologie :</span> seuls les excès
      soutenus pendant au moins 30 secondes sont comptabilisés, pour écarter
      les sauts du signal GPS sous les ponts. Les bateaux qui dépassent
      brièvement la limite sur une seule mesure n&apos;apparaissent pas dans
      les statistiques.
    </p>
  );
}
