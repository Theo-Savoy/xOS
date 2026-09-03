import { GlassCard, Tag } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import type { PeriodSelection } from '../review.period';
import { comparisonFy, periodTitle } from '../review.period';
import type { ScopeKind } from '../review.types';
import type {
  BridgePayload,
  ChannelsPayload,
  CommercialPayload,
  CyclesPayload,
  DefinitionsPayload,
  DiagnosisPayload,
  MarketPayload,
  OverviewPayload,
  PortfolioPayload,
  ProductPayload,
  QualityPayload,
  SynthesisPayload,
} from '../review.types';
import { ActivitySection } from '../sections/ActivitySection';
import { BridgeNewSection } from '../sections/BridgeNewSection';
import { CapacitySection } from '../sections/CapacitySection';
import { CatalogueBridgeSection } from '../sections/CatalogueBridgeSection';
import { ChannelsSection } from '../sections/ChannelsSection';
import { ConseilSection } from '../sections/ConseilSection';
import { CycleSection } from '../sections/CycleSection';
import { DefinitionsSection } from '../sections/DefinitionsSection';
import { DiagnosisSection } from '../sections/DiagnosisSection';
import { HistorySection } from '../sections/HistorySection';
import { LeadershipSection } from '../sections/LeadershipSection';
import { MarketSignalSection } from '../sections/MarketSignalSection';
import { MarketStudiesSection } from '../sections/MarketStudiesSection';
import { PatternsSection } from '../sections/PatternsSection';
import { PerformanceSection } from '../sections/PerformanceSection';
import { PortfolioSection } from '../sections/PortfolioSection';
import { ProductCompareSection } from '../sections/ProductCompareSection';
import { ProductHistorySection } from '../sections/ProductHistorySection';
import { ProductivitySection } from '../sections/ProductivitySection';
import { QualitySection } from '../sections/QualitySection';
import { ReasonsSection } from '../sections/ReasonsSection';
import { SalesComparisonSection } from '../sections/SalesComparisonSection';
import { SynthesisSection } from '../sections/SynthesisSection';
import { WinReasonsSection } from '../sections/WinReasonsSection';

type Loadable<T> = { data: T | null; loading: boolean };

function PageHeader({
  title,
  description,
  period,
  scopes,
}: {
  title: string;
  description: string;
  period: PeriodSelection;
  scopes: ScopeKind[];
}) {
  return (
    <header className="review-page-heading">
      <div>
        <h1>
          {title}
          {scopes.map((scope) => (
            <ScopeTag key={scope} scope={scope} />
          ))}
        </h1>
        <p>{description}</p>
      </div>
      <Tag variant="accent">{periodTitle(period)}</Tag>
    </header>
  );
}

function AnnualOnlyNotice({ children }: { children: string }) {
  return (
    <GlassCard className="review-annual-notice" variant="subdued">
      <Tag variant="muted">Lecture FY</Tag>
      <p>{children}</p>
    </GlassCard>
  );
}

export function SummaryPage({
  period,
  synthesis,
  overview,
  bridge,
}: {
  period: PeriodSelection;
  synthesis: Loadable<SynthesisPayload>;
  overview: Loadable<OverviewPayload>;
  bridge: Loadable<BridgePayload>;
}) {
  const narrativeAvailable = period.mode === 'fy' && period.fy === 'FY26';
  return (
    <div className="review-page">
      <PageHeader
        title="Synthèse"
        description="Le fil directeur de la revue : résultat, décomposition, puis verdict."
        period={period}
        scopes={['total']}
      />
      {!narrativeAvailable ? (
        <AnnualOnlyNotice>
          La synthèse narrative et le verdict sont calibrés sur FY26 : la vue
          sélectionnée reste chiffrée, sans extrapoler les ETP ni la cohorte.
        </AnnualOnlyNotice>
      ) : null}
      <div className="review-page-grid review-page-grid--hero">
        {!narrativeAvailable ? (
          <PerformanceSection data={overview.data} loading={overview.loading} />
        ) : (
          <SynthesisSection data={synthesis.data} loading={synthesis.loading} />
        )}
        <BridgeNewSection data={bridge.data} loading={bridge.loading} />
      </div>
      {narrativeAvailable ? (
        <PatternsSection data={synthesis.data} loading={synthesis.loading} />
      ) : null}
    </div>
  );
}

export function TrajectoryPage({
  period,
  overview,
  portfolio,
}: {
  period: PeriodSelection;
  overview: Loadable<OverviewPayload>;
  portfolio: Loadable<PortfolioPayload>;
}) {
  const portfolioAvailable = period.mode === 'fy' && period.fy === 'FY26';
  return (
    <div className="review-page">
      <PageHeader
        title="Trajectoire"
        description="Les flux NEW et RENEW dans le temps, puis la lecture distincte du stock catalogue."
        period={period}
        scopes={['total']}
      />
      {period.mode === 'fy' ? (
        <PerformanceSection data={overview.data} loading={overview.loading} />
      ) : null}
      <HistorySection data={overview.data} loading={overview.loading} />
      {!portfolioAvailable ? (
        <AnnualOnlyNotice>
          Le portefeuille de référence reste arrêté au 30/06/2026 : ses statuts
          et sa cohorte d’ouverture ne sont pas extrapolés à cette période.
        </AnnualOnlyNotice>
      ) : (
        <PortfolioSection data={portfolio.data} loading={portfolio.loading} />
      )}
    </div>
  );
}

export function CommercialPage({
  period,
  commercial,
}: {
  period: PeriodSelection;
  commercial: Loadable<CommercialPayload>;
}) {
  const productivityAvailable = period.mode === 'fy' && period.fy === 'FY26';
  return (
    <div className="review-page">
      <PageHeader
        title="Commercial"
        description="Le bridge Owner cadre l’écart avant toute lecture de l’équipe active."
        period={period}
        scopes={['new']}
      />
      <CapacitySection data={commercial.data} loading={commercial.loading} />
      <SalesComparisonSection
        data={commercial.data}
        loading={commercial.loading}
      />
      {!productivityAvailable ? (
        <AnnualOnlyNotice>
          Les ratios par ETP exigent FY25 et FY26 complets : aucune
          configuration infra-annuelle ou antérieure n’est disponible.
        </AnnualOnlyNotice>
      ) : (
        <ProductivitySection
          data={commercial.data}
          loading={commercial.loading}
        />
      )}
      <ActivitySection data={commercial.data} loading={commercial.loading} />
      <LeadershipSection data={commercial.data} loading={commercial.loading} />
    </div>
  );
}

export function ProductPage({
  period,
  product,
  bridge,
  cycles,
}: {
  period: PeriodSelection;
  product: Loadable<ProductPayload>;
  bridge: Loadable<BridgePayload>;
  cycles: Loadable<CyclesPayload>;
}) {
  return (
    <div className="review-page">
      <PageHeader
        title="Produit"
        description="Comparer les offres sans perdre les volumes, les tickets ni la qualité des cycles."
        period={period}
        scopes={['new']}
      />
      <div className="review-page-grid review-page-grid--balanced">
        <ProductCompareSection
          data={product.data}
          loading={product.loading}
          compare={comparisonFy(period.fy)}
        />
        <CatalogueBridgeSection data={bridge.data} loading={bridge.loading} />
      </div>
      <CycleSection data={cycles.data} loading={cycles.loading} />
      <ConseilSection data={product.data} loading={product.loading} />
      <ProductHistorySection data={product.data} loading={product.loading} />
    </div>
  );
}

export function MarketPage({
  period,
  market,
  channels,
}: {
  period: PeriodSelection;
  market: Loadable<MarketPayload>;
  channels: Loadable<ChannelsPayload>;
}) {
  return (
    <div className="review-page">
      <PageHeader
        title="Marché & acquisition"
        description="Motifs déclarés, références externes et canaux : des signaux, jamais une causalité."
        period={period}
        scopes={['new']}
      />
      <MarketSignalSection data={market.data} loading={market.loading} />
      <div className="review-page-grid review-page-grid--balanced">
        <WinReasonsSection data={market.data} loading={market.loading} />
        <MarketStudiesSection />
      </div>
      <ReasonsSection data={market.data} loading={market.loading} />
      <ChannelsSection data={channels.data} loading={channels.loading} />
    </div>
  );
}

export function DiagnosticPage({
  period,
  diagnosis,
  quality,
  definitions,
}: {
  period: PeriodSelection;
  diagnosis: Loadable<DiagnosisPayload>;
  quality: Loadable<QualityPayload>;
  definitions: Loadable<DefinitionsPayload>;
}) {
  const diagnosisAvailable = period.mode === 'fy' && period.fy === 'FY26';
  return (
    <div className="review-page">
      <PageHeader
        title="Diagnostic"
        description="Fiabilité, limites d’attribution et règles de calcul visibles au même endroit."
        period={period}
        scopes={['total']}
      />
      {!diagnosisAvailable ? (
        <AnnualOnlyNotice>
          La matrice de diagnostic est calibrée sur FY26 : elle combine ETP,
          portefeuille au 30/06 et effets de catalogue.
        </AnnualOnlyNotice>
      ) : (
        <DiagnosisSection data={diagnosis.data} loading={diagnosis.loading} />
      )}
      <QualitySection data={quality.data} loading={quality.loading} />
      <DefinitionsSection
        data={definitions.data}
        loading={definitions.loading}
      />
    </div>
  );
}
