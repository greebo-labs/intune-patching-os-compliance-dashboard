/* ================================================================
   Windows Product Lifecycle Reference Data
   Source: Microsoft Learn — Windows Release Health
   https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information
   Last verified: 7 April 2026

   Created by Darren Reevell
   Confidential — For internal use only
   ================================================================ */

const LIFECYCLE_DATA = {
  lastUpdated: '2026-04-07',
  sourceUrl: 'https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information',

  windows11: [
    {
      version: '26H1',
      availability: '2026-02-10',
      editions: [
        { edition: 'Home / Pro', endOfSupport: '2028-03-14' },
        { edition: 'Enterprise / Education', endOfSupport: '2029-03-13' }
      ]
    },
    {
      version: '25H2',
      availability: '2025-09-30',
      editions: [
        { edition: 'Home / Pro', endOfSupport: '2027-10-12' },
        { edition: 'Enterprise / Education', endOfSupport: '2028-10-10' }
      ]
    },
    {
      version: '24H2',
      availability: '2024-10-01',
      editions: [
        { edition: 'Home / Pro', endOfSupport: '2026-10-13' },
        { edition: 'Enterprise / Education', endOfSupport: '2027-10-12' }
      ]
    },
    {
      version: '23H2',
      availability: '2023-10-31',
      editions: [
        { edition: 'Home / Pro', endOfSupport: '2025-11-11' },
        { edition: 'Enterprise / Education', endOfSupport: '2026-11-10' }
      ]
    },
    {
      version: '22H2',
      availability: '2022-09-20',
      editions: [
        { edition: 'Home / Pro', endOfSupport: '2024-10-08' },
        { edition: 'Enterprise / Education / IoT', endOfSupport: '2025-10-14' }
      ]
    },
    {
      version: '21H2',
      availability: '2021-10-04',
      editions: [
        { edition: 'Home / Pro', endOfSupport: '2023-10-10' },
        { edition: 'Enterprise / Education / IoT', endOfSupport: '2024-10-08' }
      ]
    }
  ],

  windows11LTSC: [
    {
      version: '24H2 LTSC',
      availability: '2024-10-01',
      editions: [
        { edition: 'Enterprise LTSC', endOfSupport: '2029-10-09' },
        { edition: 'IoT Enterprise LTSC', endOfSupport: '2034-10-10' }
      ]
    }
  ],

  windows10: [
    {
      version: '22H2',
      editions: [
        {
          edition: 'Home / Pro / Enterprise / Education',
          endOfSupport: '2025-10-14',
          esu: [
            { year: 1, edition: 'Consumer (Home / Pro)', endDate: '2026-10-13' },
            { year: 1, edition: 'Enterprise / Education', endDate: '2026-10-13' },
            { year: 2, edition: 'Enterprise / Education', endDate: '2027-10-12' },
            { year: 3, edition: 'Enterprise / Education', endDate: '2028-10-10' }
          ]
        }
      ]
    },
    {
      version: '21H2 LTSC',
      editions: [
        { edition: 'Enterprise LTSC', endOfSupport: '2027-01-12' },
        { edition: 'IoT Enterprise LTSC', endOfSupport: '2032-01-13' }
      ]
    },
    {
      version: '1809 LTSC',
      editions: [
        { edition: 'Enterprise LTSC', endOfSupport: '2029-01-09' }
      ]
    },
    {
      version: '1607 LTSB',
      editions: [
        { edition: 'Enterprise LTSB', endOfSupport: '2026-10-13' }
      ]
    }
  ],

  windows11ESU: {
    '23H2': { edition: 'Enterprise / Education', endDate: '2026-11-10' },
    '24H2': { edition: 'Enterprise / Education', endDate: '2027-10-12' }
  },

  buildMap: {
    '26100': { os: 'Windows 11', version: '24H2' },
    '22631': { os: 'Windows 11', version: '23H2' },
    '22621': { os: 'Windows 11', version: '22H2' },
    '22000': { os: 'Windows 11', version: '21H2' },
    '26200': { os: 'Windows 11', version: '25H2' },
    '28000': { os: 'Windows 11', version: '26H1' },

    '19045': { os: 'Windows 10', version: '22H2' },
    '19044': { os: 'Windows 10', version: '21H2' },
    '19043': { os: 'Windows 10', version: '21H1' },
    '19042': { os: 'Windows 10', version: '20H2' },
    '19041': { os: 'Windows 10', version: '2004' },
    '18363': { os: 'Windows 10', version: '1909' },
    '18362': { os: 'Windows 10', version: '1903' },
    '17763': { os: 'Windows 10', version: '1809' },
    '17134': { os: 'Windows 10', version: '1803' },
    '16299': { os: 'Windows 10', version: '1709' },
    '15063': { os: 'Windows 10', version: '1703' },
    '14393': { os: 'Windows 10', version: '1607' },
    '10240': { os: 'Windows 10', version: '1507' }
  }
};

function getLifecycleStatus(osName, version, editionHint) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const normalizedEdition = String(editionHint || '').trim();
  const isEnterprise = !normalizedEdition || /enterprise|education|iot|ltsc|ltsb/i.test(normalizedEdition);

  let entries = [];

  if (/windows\s*11/i.test(osName)) {
    const match = LIFECYCLE_DATA.windows11.find(v => v.version === version);
    if (match) entries = match.editions;
    const ltscMatch = LIFECYCLE_DATA.windows11LTSC.find(v => v.version.startsWith(version));
    if (ltscMatch) entries = entries.concat(ltscMatch.editions);
  } else if (/windows\s*10/i.test(osName)) {
    const match = LIFECYCLE_DATA.windows10.find(v => v.version === version || v.version.startsWith(version));
    if (match) entries = match.editions;
  }

  if (entries.length === 0) {
    return { status: 'Unknown', endDate: null, daysRemaining: null, risk: 'amber' };
  }

  let entry;
  if (isEnterprise) {
    entry = entries.find(e => /enterprise|education|iot/i.test(e.edition)) || entries[0];
  } else {
    entry = entries.find(e => /home|pro/i.test(e.edition)) || entries[0];
  }

  const endDate = new Date(entry.endOfSupport);
  const daysRemaining = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

  let status, risk, esuInfo = null;

  if (daysRemaining < 0) {
    esuInfo = getESUCoverage(osName, version, today, normalizedEdition);
    if (esuInfo) {
      status = 'ESU (' + esuInfo.label + ')';
      risk = esuInfo.daysRemaining <= 365 ? 'amber' : 'green';
    } else {
      status = 'Out of support';
      risk = 'red';
    }
  } else if (daysRemaining <= 365) {
    status = 'Nearing end of support';
    risk = 'amber';
  } else {
    status = 'Supported';
    risk = 'green';
  }

  return {
    status,
    endDate: esuInfo ? esuInfo.endDate : entry.endOfSupport,
    daysRemaining: esuInfo ? esuInfo.daysRemaining : daysRemaining,
    risk,
    esuInfo
  };
}

function getESUCoverage(osName, version, today, editionHint) {
  const normalizedEdition = String(editionHint || '').trim();
  const wantsEnterprise = !normalizedEdition || /enterprise|education|iot|ltsc|ltsb/i.test(normalizedEdition);
  const wantsConsumer = /home|pro/i.test(normalizedEdition) && !wantsEnterprise;

  if (/windows\s*10/i.test(osName) && version === '22H2') {
    const entry = LIFECYCLE_DATA.windows10.find(v => v.version === '22H2');
    const esuList = entry?.editions?.[0]?.esu || [];

    const eligible = esuList.filter(esu => {
      if (wantsEnterprise) return /enterprise|education/i.test(esu.edition);
      if (wantsConsumer) return /consumer|home|pro/i.test(esu.edition);
      return false;
    });

    for (let i = eligible.length - 1; i >= 0; i--) {
      const esu = eligible[i];
      const esuEnd = new Date(esu.endDate);
      const esuDays = Math.ceil((esuEnd - today) / (1000 * 60 * 60 * 24));
      if (esuDays >= 0) {
        return {
          label: 'Year ' + esu.year,
          endDate: esu.endDate,
          daysRemaining: esuDays,
          edition: esu.edition
        };
      }
    }
  }

  if (/windows\s*11/i.test(osName) && LIFECYCLE_DATA.windows11ESU[version]) {
    if (!wantsEnterprise) return null;

    const esu = LIFECYCLE_DATA.windows11ESU[version];
    const esuEnd = new Date(esu.endDate);
    const esuDays = Math.ceil((esuEnd - today) / (1000 * 60 * 60 * 24));

    if (esuDays >= 0) {
      return {
        label: 'Ent/Edu',
        endDate: esu.endDate,
        daysRemaining: esuDays,
        edition: esu.edition
      };
    }
  }

  return null;
}

function buildToVersion(buildStr) {
  if (!buildStr) return null;
  const s = String(buildStr).trim();
  const parts = s.split('.');

  if (parts.length === 4 && parts[0] === '10' && parts[1] === '0') {
    const major = parts[2];
    return LIFECYCLE_DATA.buildMap[major] || null;
  }

  if (parts.length === 2 && parts[0].length >= 4) {
    return LIFECYCLE_DATA.buildMap[parts[0]] || null;
  }

  if (parts.length === 1 && s.length >= 4) {
    return LIFECYCLE_DATA.buildMap[s] || null;
  }

  return LIFECYCLE_DATA.buildMap[parts[0]] || null;
}
