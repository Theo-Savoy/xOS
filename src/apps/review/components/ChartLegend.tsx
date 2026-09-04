// Légende statique HTML — remplace <Legend> de recharts.
// recharts <Legend> déclenche une boucle de setState (#185) au resize/fullscreen
// (LegendSizeDispatcher → setLegendSize → notify synchrone → re-render).
// Une simple liste de <span> fait le même rendu sans le store redux interne.
export function ChartLegend({
  items,
}: {
  items: { label: string; color: string; dashed?: boolean }[];
}) {
  return (
    <div className="review-chart-legend" aria-hidden="true">
      {items.map((item) => (
        <span key={item.label} className="review-chart-legend__item">
          <i
            className="review-chart-legend__swatch"
            style={{
              background: item.dashed ? 'transparent' : item.color,
              ...(item.dashed
                ? {
                    backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 7px)`,
                  }
                : {}),
            }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}