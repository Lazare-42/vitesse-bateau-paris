export function MethodologyNote() {
  return (
    <p className="mb-4 text-xs text-muted-foreground">
      <span className="font-medium">Methodologie :</span> seuls les exces
      soutenus pendant au moins 30 secondes sont comptabilises, pour ecarter
      les sauts du signal GPS sous les ponts. Les bateaux qui depassent
      brievement la limite sur une seule mesure n&apos;apparaissent pas dans
      les statistiques.
    </p>
  );
}
