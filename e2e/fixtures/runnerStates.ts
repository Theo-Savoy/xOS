import { readFileSync } from 'node:fs';

export const RUNNER_WIDTHS = [320, 500, 719, 720, 899, 900, 1200] as const;

export const RUNNER_HEIGHTS = {
  standard: 620,
  constrained: 420,
} as const;

export const RUNNER_STATES = [
  'standard',
  'bulk',
  'power-off',
  'power-ready',
  'power-wave',
  'power-conversation',
] as const;

export type RunnerState = (typeof RUNNER_STATES)[number];

const themeCss = readFileSync(
  new URL('../../src/os/theme.css', import.meta.url),
  'utf8',
);
const callsCss = readFileSync(
  new URL('../../src/apps/calls/calls.css', import.meta.url),
  'utf8',
);
const dialerCss = readFileSync(
  new URL('../../src/apps/calls/calls-dialer.css', import.meta.url),
  'utf8',
);

const fixtureCss = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; }
  body {
    min-width: 320px;
    overflow: hidden;
    background: #0d173f;
    color: #f4f5fb;
    font-family: system-ui, sans-serif;
  }
  .runner-fixture-viewport {
    width: 100%;
    height: 100%;
    min-width: 320px;
    overflow: auto;
    background: #0d173f;
  }
  .runner-fixture-viewport .calls-app {
    min-height: 100%;
    padding: clamp(1rem, 2.5vw, 1.5rem);
  }
  .runner-fixture-viewport .calls-view {
    max-width: none;
  }
  .runner-fixture-viewport .xos-btn,
  .runner-fixture-viewport button {
    font-family: system-ui, sans-serif;
  }
  .runner-fixture-viewport .calls-contact-card,
  .runner-fixture-viewport .calls-log-form,
  .runner-fixture-viewport .calls-cockpit-list,
  .runner-fixture-viewport .calls-bulk-bar,
  .runner-fixture-viewport .calls-power-strip {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    background: rgba(13, 23, 63, 0.72);
  }
  .runner-fixture-viewport .calls-contact-card {
    padding: 1rem;
  }
  .runner-fixture-viewport .calls-log-form {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
  }
  .runner-fixture-viewport .calls-fixture-placeholder {
    min-height: 7rem;
    padding: 1rem;
    border: 1px dashed rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    color: rgba(244, 245, 251, 0.72);
  }
  .runner-fixture-viewport .calls-power-strip__bar,
  .runner-fixture-viewport .calls-power-strip__lines,
  .runner-fixture-viewport .calls-power-strip__queue {
    padding: 0.8rem 1rem;
  }
  .runner-fixture-viewport .calls-power-strip__bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .runner-fixture-viewport .calls-power-strip__controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .runner-fixture-viewport .calls-power-strip__line {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
    flex-wrap: wrap;
    padding: 0.65rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .runner-fixture-viewport .calls-power-strip__line > * {
    min-width: 0;
  }
  .runner-fixture-viewport .calls-power-strip__line:last-child {
    border-bottom: 0;
  }
  .runner-fixture-viewport .calls-power-strip__line-phase {
    color: #ffe4a3;
  }
  .runner-fixture-viewport .calls-power-strip__queue-item {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.35rem 0;
  }
  .runner-fixture-viewport .calls-fixture-conversation {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.65fr);
    gap: 0.8rem;
  }
  .runner-fixture-viewport .calls-fixture-conversation__meter {
    min-height: 11rem;
    display: grid;
    place-items: center;
    padding: 1rem;
    border: 1px solid rgba(234, 184, 77, 0.22);
    border-radius: 16px;
    background: rgba(8, 12, 28, 0.8);
    color: #ffe4a3;
    text-align: center;
  }
  .runner-fixture-viewport .calls-cockpit-detail,
  .runner-fixture-viewport .calls-contact-card-viewport,
  .runner-fixture-viewport .calls-log-form {
    min-width: 0;
  }
  @media (max-width: 719px) {
    .runner-fixture-viewport .calls-fixture-conversation {
      grid-template-columns: 1fr;
    }
    .runner-fixture-viewport .calls-cockpit-kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;

function button(label: string, extra = '') {
  return `<button type="button" class="xos-btn xos-btn--secondary xos-btn--sm" ${extra}>${label}</button>`;
}

function modeToggle(active: 'list' | 'detail' = 'list') {
  return `<div class="calls-mode-toggle" role="group" aria-label="Mode d'affichage">
    <button type="button" class="calls-mode-toggle__btn${active === 'list' ? ' calls-mode-toggle__btn--active' : ''}" aria-pressed="${active === 'list'}">Liste <kbd aria-hidden="true">L</kbd></button>
    <button type="button" class="calls-mode-toggle__btn${active === 'detail' ? ' calls-mode-toggle__btn--active' : ''}" aria-pressed="${active === 'detail'}">Fiche <kbd aria-hidden="true">F</kbd></button>
  </div>`;
}

function header(power = false, active: 'list' | 'detail' = 'list') {
  return `<header class="calls-view__header calls-view__header--runner">
    <div class="calls-view__nav">
      ${button('Quitter', 'class="xos-btn xos-btn--secondary xos-btn--md calls-view__back"')}
      <div class="calls-view__titleblock">
        ${power ? '<h2>Séance responsive <span class="calls-power-indicator"><span class="calls-power-indicator__dot" aria-hidden="true"></span>Power</span></h2>' : '<div class="calls-view__title-tags"><span class="xos-tag xos-tag--accent">Cockpit</span></div><h2>Séance responsive</h2>'}
      </div>
    </div>
    <div class="calls-view__actions">
      ${active === 'detail' ? modeToggle(active) : modeToggle('list')}
      ${button('⌘K', 'aria-label="Command bar"')}
      ${button('?', 'aria-label="Aide raccourcis"')}
    </div>
  </header>`;
}

function kpis(power = false) {
  if (power) {
    return `<div class="calls-power-kpis-condensed" aria-label="Indicateurs de séance"><strong>12</strong> contacts <span class="calls-power-kpis-condensed__sep">·</span><strong>7</strong> restants <span class="calls-power-kpis-condensed__sep">·</span><strong>3</strong> décrochés</div>`;
  }
  return `<div class="calls-cockpit-kpis" aria-label="Indicateurs de séance">
    <div class="xos-glass-card calls-stat"><span>Contacts</span><strong>12</strong></div>
    <div class="xos-glass-card calls-stat"><span>Restant</span><strong>7</strong></div>
    <div class="xos-glass-card calls-stat"><span>Décrochés</span><strong>3</strong></div>
    <div class="xos-glass-card calls-stat"><span>Argumentés</span><strong>2</strong></div>
    <div class="xos-glass-card calls-stat calls-stat--rdv"><span>RDV</span><strong>1</strong></div>
  </div>`;
}

function progress() {
  return `<div class="xos-progress" aria-label="Progression de la séance"><div class="xos-progress__track"><div class="xos-progress__fill" style="width: 42%"></div></div><span class="xos-progress__label xos-numeric">5/12</span></div>`;
}

function listMarkup(selected = false, power = false) {
  const rows = ['Marie Dupont', 'Paul Bernard', 'Sophie Lambert', 'Karim Benali'];
  const rowClass = power
    ? 'calls-cockpit-list__rows calls-cockpit-list__rows--power'
    : 'calls-cockpit-list__rows';
  return `<div class="${power ? 'calls-cockpit-list-wrap--power' : 'calls-cockpit-list-wrap'}">
    <section class="calls-cockpit-list${power ? ' calls-cockpit-list--power' : ''}" aria-label="Liste des contacts">
      <div class="calls-cockpit-list__toolbar${power ? ' calls-cockpit-list__toolbar--power' : ''}">
        <h3>Liste de la séance</h3>
        <input class="calls-input calls-cockpit-list__search" type="search" aria-label="Filtrer la liste" placeholder="Filtrer nom, entreprise, email…">
      </div>
      <div class="calls-cockpit-list__scroll"><ul class="${rowClass}">
        <li class="calls-cockpit-list__header${power ? ' calls-cockpit-list__header--power' : ''}" aria-hidden="true"><span>Contact</span><span>Entreprise</span><span>État</span></li>
        ${rows.map((name, index) => `<li class="calls-cockpit-list__row${power ? ' calls-cockpit-list__row--power' : ''}${selected && index < 2 ? ' calls-cockpit-list__row--selected' : ''}">
          ${power ? '' : `<label class="calls-checkbox calls-checkbox--tight"><input type="checkbox" ${selected && index < 2 ? 'checked' : ''} aria-label="Sélectionner ${name}"></label>`}
          <button type="button" class="calls-cockpit-list__name"><strong>${name}</strong></button>
          <span class="calls-cockpit-list__cell calls-cockpit-list__cell--wrap">Compte ${index + 1}</span>
          <span class="calls-cockpit-list__status"><span class="xos-tag ${index === 0 ? 'xos-tag--accent' : 'xos-tag--muted'}">${index === 0 ? 'À faire' : 'Appelé'}</span></span>
        </li>`).join('')}
      </ul></div>
    </section>
  </div>`;
}

function detailMarkup() {
  return `<div class="calls-cockpit-detail">
    <div class="calls-contact-card-viewport"><article class="xos-glass-card calls-contact-card"><div class="calls-contact-card__main"><div class="calls-contact-card__who"><h3>Marie Dupont</h3><p class="calls-contact-card__role">Directrice commerciale</p></div><p class="calls-fixture-placeholder">Compte responsive · contexte chargé</p></div></article></div>
    <div class="calls-log-form"><h3>Consigner l'appel</h3><div role="group" aria-label="Résultat"><button type="button" aria-pressed="true">Appel non décroché</button><button type="button" aria-pressed="false">Appel décroché</button></div><label class="calls-field"><span>Commentaires</span><textarea aria-label="Commentaires" rows="3" placeholder="Notes sur l'appel…"></textarea></label>${button('Consigner & suivant', 'class="xos-btn xos-btn--primary"')}</div>
  </div>`;
}

function powerStrip(state: 'ready' | 'wave' | 'conversation') {
  const lines = state === 'ready'
    ? '<div class="calls-fixture-placeholder">7 numéros prêts · quota 12/50</div>'
    : `<div class="calls-power-strip__lines" aria-label="Lignes Power">
      <div class="calls-power-strip__line calls-power-strip__line--ringing"><span><strong>Marie Dupont</strong><br><small>+33 6 12 00 00 01</small></span><span class="calls-power-strip__line-phase">Ça sonne</span></div>
      <div class="calls-power-strip__line calls-power-strip__line--dialing"><span><strong>Paul Bernard</strong><br><small>+33 6 12 00 00 02</small></span><span class="calls-power-strip__line-phase">Composition</span></div>
      <div class="calls-power-strip__line calls-power-strip__line--connected"><span><strong>Sophie Lambert</strong><br><small>+33 6 12 00 00 03</small></span><span class="calls-power-strip__line-phase">En conversation</span></div>
    </div>`;
  return `<section class="xos-glass-card calls-power-strip${state === 'wave' ? ' calls-power-strip--launching' : ''}" aria-label="Power dialing">
    <div class="calls-power-strip__bar"><div><strong>Power dialing</strong><span role="status" class="calls-power-strip__quota" aria-live="polite">${state === 'ready' ? 'Prêt à lancer' : state === 'wave' ? 'Vague en cours' : 'Conversation active'}</span></div><div class="calls-power-strip__controls">${state === 'ready' ? button('Lancer 3 appels', 'class="calls-power-strip__launch xos-btn xos-btn--primary"') : button('Raccrocher tout', 'class="xos-btn xos-btn--danger"')}</div></div>
    ${lines}
    ${state === 'ready' ? '<div class="calls-power-strip__queue" aria-label="File Power"><div class="calls-power-strip__queue-item"><span>Prochains contacts</span><strong>4</strong></div></div>' : ''}
  </section>`;
}

export function runnerStateMarkup(state: RunnerState): string {
  const power = state.startsWith('power-') && state !== 'power-off';
  let body = '';
  let rootClass = 'calls-view calls-view--runner';

  if (state === 'standard') {
    body = `${kpis()}${listMarkup()}`;
  } else if (state === 'bulk') {
    body = `${kpis()}<section class="xos-glass-card calls-bulk-bar" aria-label="Action groupée"><div class="calls-bulk-bar__head"><strong>2 contacts sélectionnés</strong>${button('Annuler')}</div><div class="calls-bulk-options"><summary>Options de consignation</summary><label class="calls-field"><span>Commentaires groupés</span><textarea aria-label="Commentaires groupés" rows="2"></textarea></label></div>${button('Consigner pour 2', 'class="xos-btn xos-btn--primary"')}</section>${listMarkup(true)}`;
  } else if (state === 'power-off') {
    body = `${kpis()}<div class="calls-fixture-placeholder" aria-label="Power désactivé">Power désactivé · la liste standard reste disponible.</div>${listMarkup()}`;
  } else if (state === 'power-ready') {
    rootClass += ' calls-view--power';
    body = `${kpis(true)}${powerStrip('ready')}${listMarkup(false, true)}`;
  } else if (state === 'power-wave') {
    rootClass += ' calls-view--power';
    body = `${kpis(true)}${powerStrip('wave')}${listMarkup(false, true)}`;
  } else {
    rootClass += ' calls-view--power calls-view--power-conversation';
    body = `${kpis(true)}${powerStrip('conversation')}<div class="calls-fixture-conversation"><div class="calls-fixture-conversation__meter" role="status" aria-live="polite"><div><strong>Conversation active</strong><br>00:42 · qualité stable</div></div>${detailMarkup()}</div>`;
  }

  return `<div class="runner-fixture-viewport" data-runner-state="${state}"><div class="calls-app"><main class="${rootClass}">${header(power, state === 'power-conversation' ? 'detail' : 'list')}${progress()}${body}</main></div></div>`;
}

export function runnerFixtureDocument(state: RunnerState): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${themeCss}\n${callsCss}\n${dialerCss}\n${fixtureCss}</style></head><body>${runnerStateMarkup(state)}</body></html>`;
}
