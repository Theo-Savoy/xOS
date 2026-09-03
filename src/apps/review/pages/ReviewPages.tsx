import { GlassCard, Tag } from '../../../components/ui';
import { InfoHint } from '../components/InfoHint';
import type { PeriodSelection } from '../review.period';
import { comparisonFy } from '../review.period';
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
import { CycleSection } from '../sections/CycleSection';
import { DefinitionsSection } from '../sections/DefinitionsSection';
import { DiagnosisSection } from '../sections/DiagnosisSection';
import { HistorySection } from '../sections/HistorySection';
import { LeadershipSection } from '../sections/LeadershipSection';
import { MarketSignalSection } from '../sections/MarketSignalSection';
import { PatternsSection } from '../sections/PatternsSection';
import { PerformanceSection } from '../sections/PerformanceSection';
import { PortfolioSection } from '../sections/PortfolioSection';
import { ProductCompareSection } from '../sections/ProductCompareSection';
import { ProductHistorySection } from '../sections/ProductHistorySection';
import { ProductivitySection } from '../sections/ProductivitySection';
import { QualitySection } from '../sections/QualitySection';
import { SalesComparisonSection } from '../sections/SalesComparisonSection';
import { SynthesisSection } from '../sections/SynthesisSection';
import { WinReasonsSection } from '../sections/WinReasonsSection';

type Loadable<T> = { data: T | null; loading: boolean };

function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
  scopes?: ScopeKind[];
}) {
  return (
    <header className="review-page-heading">
      <div>
        <h1>
          {title}
          <InfoHint
            label={`Comment lire la page ${title}`}
            text={description}
          />
        </h1>
      </div>
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
  bridge,
}: {
  period: PeriodSelection;
  synthesis: Loadable<SynthesisPayload>;
  bridge: Loadable<BridgePayload>;
}) {
  const narrativeAvailable = period.mode === 'fy' && period.fy === 'FY26';
  return (
    <div className="review-page">
      <PageHeader
        title="Synthèse"
        description="Le fil directeur de la revue : résultat, décomposition, puis verdict."
        scopes={['total']}
      />
      <SynthesisSection data={synthesis.data} loading={synthesis.loading} />
      <BridgeNewSection data={bridge.data} loading={bridge.loading} />
      {narrativeAvailable ? (
        <PatternsSection data={synthesis.data} loading={synthesis.loading} />
      ) : (
        <AnnualOnlyNotice>
          {period.mode === 'semester'
            ? 'Le narratif reste calibré sur FY26 complet.'
            : 'Le narratif et le verdict sont calibrés sur FY26.'}
        </AnnualOnlyNotice>
      )}
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
        scopes={['total']}
      />
      {period.mode === 'fy' ? (
        <PerformanceSection data={overview.data} loading={overview.loading} />
      ) : null}
      <HistorySection data={overview.data} loading={overview.loading} />
      {!portfolioAvailable ? (
        <AnnualOnlyNotice>
          Le portefeuille de référence reste arrêté au 30/06/2026.
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
        scopes={['new']}
      />
      <CapacitySection data={commercial.data} loading={commercial.loading} />
      <SalesComparisonSection
        data={commercial.data}
        loading={commercial.loading}
      />
      {!productivityAvailable ? (
        <AnnualOnlyNotice>
          Les ratios par ETP exigent FY25 et FY26 complets.
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
        scopes={['new']}
      />
      <div className="review-page-grid review-page-grid--balanced">
        <ProductCompareSection
          data={product.data}
          loading={product.loading}
          compare={period.compare || comparisonFy(period.fy)}
        />
        <CatalogueBridgeSection data={bridge.data} loading={bridge.loading} />
      </div>
      <CycleSection data={cycles.data} loading={cycles.loading} />
      <ProductHistorySection data={product.data} loading={product.loading} />
    </div>
  );
}

export function MarketPage({
  market,
  channels,
}: {
  market: Loadable<MarketPayload>;
  channels: Loadable<ChannelsPayload>;
}) {
  return (
    <div className="review-page">
      <PageHeader
        title="Marché"
        description="Motifs déclarés et canaux : des signaux, jamais une causalité."
        scopes={['new']}
      />
      <MarketSignalSection data={market.data} loading={market.loading} />
      <WinReasonsSection data={market.data} loading={market.loading} />
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
        scopes={['total']}
      />
      {!diagnosisAvailable ? (
        <AnnualOnlyNotice>
          La matrice de diagnostic est calibrée sur FY26.
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
