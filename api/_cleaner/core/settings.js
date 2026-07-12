export const CLEANER_SETTINGS_KEY = 'cleaner_v2';

export const DEFAULT_CLEANER_SETTINGS = {
  amountImplausibleMax: 100,
  closeDateCriticalDays: 90,
  opportunityOldDays: 365,
  opportunityVeryOldDays: 730,
  score: {
    overduePointEveryDays: 30,
    overdueCap: 12,
    neverActive: 8,
    inactive30Days: 2,
    inactive90Days: 5,
    inactive365Days: 5,
    amountMissing: 6,
    amountImplausible: 10,
    probabilityZero: 3,
    ownerInactive: 10,
    formerEmployee: 8,
    oldOpportunity: 2,
    veryOldOpportunity: 4,
    stalledStage: 3,
    amountPointEvery: 10000,
    amountCap: 5,
  },
};

const ROOT_KEYS = [
  'amountImplausibleMax',
  'closeDateCriticalDays',
  'opportunityOldDays',
  'opportunityVeryOldDays',
  'score',
];
const SCORE_KEYS = Object.keys(DEFAULT_CLEANER_SETTINGS.score);

function cloneSettings(settings) {
  return {
    ...settings,
    score: { ...settings.score },
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateSettings(value) {
  if (!isPlainObject(value)) return 'value must be an object';

  if (Object.keys(value).sort().join('|') !== [...ROOT_KEYS].sort().join('|')) {
    return 'value must contain exactly the cleaner_v2 fields';
  }
  if (!isPlainObject(value.score)) return 'score must be an object';
  if (
    Object.keys(value.score).sort().join('|') !==
    [...SCORE_KEYS].sort().join('|')
  ) {
    return 'score must contain exactly the supported score fields';
  }

  const topBounds = {
    amountImplausibleMax: [1, 1000000],
    closeDateCriticalDays: [1, 3650],
    opportunityOldDays: [1, 3650],
    opportunityVeryOldDays: [1, 7300],
  };
  for (const [key, [minimum, maximum]] of Object.entries(topBounds)) {
    const candidate = value[key];
    if (
      !Number.isInteger(candidate) ||
      candidate < minimum ||
      candidate > maximum
    ) {
      return `${key} must be an integer between ${minimum} and ${maximum}`;
    }
  }
  if (value.opportunityVeryOldDays <= value.opportunityOldDays) {
    return 'opportunityVeryOldDays must be greater than opportunityOldDays';
  }
  if (value.closeDateCriticalDays > value.opportunityOldDays) {
    return 'closeDateCriticalDays must not exceed opportunityOldDays';
  }

  const scoreBounds = {
    overduePointEveryDays: [1, 365],
    overdueCap: [0, 100],
    neverActive: [0, 1000],
    inactive30Days: [0, 1000],
    inactive90Days: [0, 1000],
    inactive365Days: [0, 1000],
    amountMissing: [0, 1000],
    amountImplausible: [0, 1000],
    probabilityZero: [0, 1000],
    ownerInactive: [0, 1000],
    formerEmployee: [0, 1000],
    oldOpportunity: [0, 1000],
    veryOldOpportunity: [0, 1000],
    stalledStage: [0, 1000],
    amountPointEvery: [1, 1000000000],
    amountCap: [0, 100],
  };
  for (const [key, [minimum, maximum]] of Object.entries(scoreBounds)) {
    const candidate = value.score[key];
    if (
      typeof candidate !== 'number' ||
      !Number.isFinite(candidate) ||
      candidate < minimum ||
      candidate > maximum
    ) {
      return `score.${key} must be a finite number between ${minimum} and ${maximum}`;
    }
  }
  return null;
}

function warning(index, message) {
  return {
    code: 'invalid_cleaner_v2',
    key: CLEANER_SETTINGS_KEY,
    index,
    message,
  };
}

export function normalizeCleanerSettings(rows) {
  if (!Array.isArray(rows)) {
    return {
      key: CLEANER_SETTINGS_KEY,
      settings: cloneSettings(DEFAULT_CLEANER_SETTINGS),
      warnings: [warning(null, 'stored settings rows must be an array')],
      usedFallback: true,
      source: 'default',
    };
  }

  const matchingRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row && row.key === CLEANER_SETTINGS_KEY);

  if (matchingRows.length === 0) {
    return {
      key: CLEANER_SETTINGS_KEY,
      settings: cloneSettings(DEFAULT_CLEANER_SETTINGS),
      warnings: [],
      usedFallback: true,
      source: 'default',
    };
  }

  if (matchingRows.length > 1) {
    return {
      key: CLEANER_SETTINGS_KEY,
      settings: cloneSettings(DEFAULT_CLEANER_SETTINGS),
      warnings: [warning(null, 'multiple cleaner_v2 rows are not allowed')],
      usedFallback: true,
      source: 'default',
    };
  }

  const [{ row, index }] = matchingRows;
  const message = validateSettings(row.value);
  if (message) {
    return {
      key: CLEANER_SETTINGS_KEY,
      settings: cloneSettings(DEFAULT_CLEANER_SETTINGS),
      warnings: [warning(index, message)],
      usedFallback: true,
      source: 'default',
    };
  }

  return {
    key: CLEANER_SETTINGS_KEY,
    settings: cloneSettings(row.value),
    warnings: [],
    usedFallback: false,
    source: 'stored',
  };
}
