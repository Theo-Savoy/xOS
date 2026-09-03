/**
 * api/_business-review/commercial.js — Slides 5–7, annexes A2/A3.
 * Agrégation par Owner courant (R15), exclusions DG/SDR (R7, R8), productivité ETP (R13).
 */
import mapping from '../_crm/mapping.js';
import {
  resolveCallsTeamLabel,
  sfIdKey,
  trackingModeFor,
} from '../_config/access.js';
import { ownerBridge as computeOwnerBridge } from './bridge.js';
import { isRenew, splitNewRenew } from './classify.js';
import { DEFAULT_FTE } from './fte-config.js';

const { opportunity: opp, event: evt } = mapping.objects;

const ATTRIBUTION_LIMIT =
  'Attribution par Owner courant du snapshot — pas de reconstitution historique.';
const RDV_LIMIT =
  'RDV Salesforce · périmètre différent du snapshot Excel du 21/07/2026';

function amountOf(record) {
  return Number(record?.[opp.fields.amount]) || 0;
}

function ownerIdOf(record) {
  return record?.[opp.fields.ownerId] || '';
}

function ownerNameOf(record) {
  return record?.Owner?.Name || '';
}

function isNewRecord(record) {
  return !isRenew(record?.[opp.fields.name]);
}

function countNew(records) {
  return (records || []).filter(isNewRecord).length;
}

export function isRdvEvent(event) {
  const subject = event?.[evt.fields.subject] || event?.Subject || '';
  return /rdv/i.test(String(subject));
}

function weekKey(isoDate) {
  const raw = String(isoDate || '').slice(0, 10);
  if (!raw) return '';
  const date = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return raw;
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc - yearStart) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function eventOwnerId(event) {
  return event?.[evt.fields.ownerId] || event?.OwnerId || '';
}

function eventOwnerName(event) {
  return event?.Owner?.Name || '';
}

function eventDate(event) {
  return event?.[evt.fields.activityDate] || event?.ActivityDate || '';
}

function ensurePerson(map, ownerId, name) {
  if (!ownerId) return null;
  const key = sfIdKey(ownerId);
  if (!map.has(key)) {
    map.set(key, {
      ownerId,
      name: resolveCallsTeamLabel(ownerId, name),
      mode: trackingModeFor(ownerId),
      rdv: 0,
      weekSet: new Set(),
      detections: 0,
      closedNew: 0,
      signaturesNew: 0,
      amountNew: 0,
    });
  }
  return map.get(key);
}

function finalizePerson(person) {
  const weeks = person.weekSet.size;
  const closing =
    person.mode === 'sdr'
      ? null
      : person.closedNew > 0
        ? person.signaturesNew / person.closedNew
        : null;
  return {
    ownerId: person.ownerId,
    name: person.name,
    mode: person.mode,
    rdv: person.rdv,
    weeks,
    rdvPerWeek: weeks > 0 ? person.rdv / weeks : null,
    detections: person.detections,
    detectionRate: person.rdv > 0 ? person.detections / person.rdv : null,
    closedNew: person.closedNew,
    signaturesNew: person.signaturesNew,
    closing,
    ticket:
      person.signaturesNew > 0 ? person.amountNew / person.signaturesNew : null,
    amountNew: person.amountNew,
  };
}

function aggregatePeople(bucket, events) {
  const map = new Map();

  for (const record of bucket?.created || []) {
    if (!isNewRecord(record)) continue;
    const person = ensurePerson(map, ownerIdOf(record), ownerNameOf(record));
    if (person) person.detections += 1;
  }
  for (const record of bucket?.closed || []) {
    if (!isNewRecord(record)) continue;
    const person = ensurePerson(map, ownerIdOf(record), ownerNameOf(record));
    if (person) person.closedNew += 1;
  }
  for (const record of splitNewRenew(bucket?.won || []).new.records) {
    const person = ensurePerson(map, ownerIdOf(record), ownerNameOf(record));
    if (person) {
      person.signaturesNew += 1;
      person.amountNew += amountOf(record);
    }
  }
  for (const event of events || []) {
    if (!isRdvEvent(event)) continue;
    const person = ensurePerson(
      map,
      eventOwnerId(event),
      eventOwnerName(event),
    );
    if (!person) continue;
    person.rdv += 1;
    const week = weekKey(eventDate(event));
    if (week) person.weekSet.add(week);
  }

  return [...map.values()].map(finalizePerson);
}

function companyFrom(bucket) {
  const split = splitNewRenew(bucket?.won || []);
  const closedNew = countNew(bucket?.closed);
  const detections = countNew(bucket?.created);
  return {
    amountNew: split.new.amount,
    signaturesNew: split.new.count,
    detections,
    closedNew,
    closing: closedNew > 0 ? split.new.count / closedNew : null,
    conservation: split.conservation,
  };
}

function productionOf(people) {
  return (people || [])
    .filter((person) => person.mode === 'commercial')
    .reduce(
      (acc, person) => ({
        amountNew: acc.amountNew + person.amountNew,
        signatures: acc.signatures + person.signaturesNew,
        detections: acc.detections + person.detections,
      }),
      { amountNew: 0, signatures: 0, detections: 0 },
    );
}

function fteSales(fteConfig, fy) {
  const row = fteConfig?.[fy] || DEFAULT_FTE[fy];
  return Number(row?.sales) || 0;
}

function productivityRow(fy, people, fteConfig) {
  const fte = fteSales(fteConfig, fy);
  const prod = productionOf(people);
  return {
    fy,
    fte,
    amountNew: prod.amountNew,
    signatures: prod.signatures,
    detections: prod.detections,
    caPerFte: fte > 0 ? prod.amountNew / fte : null,
    signaturesPerFte: fte > 0 ? prod.signatures / fte : null,
    detectionsPerFte: fte > 0 ? prod.detections / fte : null,
  };
}

function evoPct(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function emptyDg() {
  return {
    detections: 0,
    closedNew: 0,
    signaturesNew: 0,
    closing: null,
    ticket: null,
    amountNew: 0,
    rdv: 0,
  };
}

function dgFrom(people) {
  const person = (people || []).find((row) => row.mode === 'dg');
  if (!person) return emptyDg();
  return {
    detections: person.detections,
    closedNew: person.closedNew,
    signaturesNew: person.signaturesNew,
    closing: person.closing,
    ticket: person.ticket,
    amountNew: person.amountNew,
    rdv: person.rdv,
  };
}

const MODE_ORDER = { commercial: 0, dg: 1, sdr: 2 };

/**
 * @param {Record<string, { won?: any[], closed?: any[], created?: any[] }>} window
 * @param {Record<string, { sales?: number, sdr?: number }>} fteConfig
 * @param {Record<string, any[]>} rdvConfig
 * @param {{ fy?: string, compare?: string }} [options]
 */
export function computeCommercial(
  window,
  fteConfig = DEFAULT_FTE,
  rdvConfig = {},
  options = {},
) {
  const fys = Object.keys(window || {}).sort();
  const fy = options.fy || fys.at(-1) || 'FY26';
  const compare = options.compare || fys.at(-2) || 'FY25';

  const peopleByFy = Object.fromEntries(
    fys.map((year) => [
      year,
      aggregatePeople(window[year], rdvConfig[year] || []),
    ]),
  );

  const currentPeople = peopleByFy[fy] || [];
  const previousPeople = peopleByFy[compare] || [];

  const sales = currentPeople
    .filter(
      (person) =>
        person.mode === 'commercial' &&
        (person.amountNew > 0 || person.signaturesNew > 0),
    )
    .sort((a, b) => b.amountNew - a.amountNew);

  const activity = currentPeople
    .filter(
      (person) =>
        person.rdv > 0 ||
        person.detections > 0 ||
        person.closedNew > 0 ||
        person.signaturesNew > 0 ||
        person.amountNew > 0,
    )
    .sort((a, b) => {
      const modeDelta =
        (MODE_ORDER[a.mode] ?? 9) - (MODE_ORDER[b.mode] ?? 9);
      if (modeDelta !== 0) return modeDelta;
      return b.amountNew - a.amountNew;
    });

  const company = companyFrom(window[fy] || {});
  const currentProd = productivityRow(fy, currentPeople, fteConfig);
  const previousProd = productivityRow(compare, previousPeople, fteConfig);

  const activeKeys = new Set(sales.map((person) => sfIdKey(person.ownerId)));
  const capacity = fys.map((year) => {
    const people = (peopleByFy[year] || []).filter((person) =>
      activeKeys.has(sfIdKey(person.ownerId)),
    );
    const prod = productionOf(people);
    return {
      fy: year,
      amountNew: prod.amountNew,
      signaturesNew: prod.signatures,
      detections: prod.detections,
    };
  });

  return {
    sales,
    activity,
    company: {
      amountNew: company.amountNew,
      signaturesNew: company.signaturesNew,
      detections: company.detections,
      closedNew: company.closedNew,
      closing: company.closing,
    },
    dg: {
      [compare]: dgFrom(previousPeople),
      [fy]: dgFrom(currentPeople),
    },
    capacity,
    ownerBridge: computeOwnerBridge(
      window[compare]?.won || [],
      window[fy]?.won || [],
    ),
    productivity: {
      [compare]: previousProd,
      [fy]: currentProd,
      evolution: {
        caPerFte: evoPct(currentProd.caPerFte, previousProd.caPerFte),
        signaturesPerFte: evoPct(
          currentProd.signaturesPerFte,
          previousProd.signaturesPerFte,
        ),
        detectionsPerFte: evoPct(
          currentProd.detectionsPerFte,
          previousProd.detectionsPerFte,
        ),
      },
    },
    conservation: company.conservation,
    attribution_limit: ATTRIBUTION_LIMIT,
    rdv_limit: RDV_LIMIT,
  };
}
