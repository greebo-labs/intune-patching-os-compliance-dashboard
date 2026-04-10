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

  // Windows 11 versions
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

  // Windows 11 LTSC
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

  // Windows 10
  windows10: [
    {
      version: '22H2',
      editions: [
        { edition: 'Home / Pro / Enterprise / Education', endOfSupport: '2025-10-14', esu: [
          { year: 1, edition: 'Consumer (Home / Pro)', endDate: '2026-10-13' },
          { year: 1, edition: 'Enterprise / Education', endDate: '2026-10-13' },
          { year: 2, edition: 'Enterprise / Education', endDate: '2027-10-12' },
          { year: 3, edition: 'Enterprise / Education', endDate: '2028-10-10' }
        ]}
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

  // Windows 11 ESU dates (Enterprise/Education only)
  windows11ESU: {
    '23H2': { edition: 'Enterprise / Education', endDate: '2026-11-10' },
    '24H2': { edition: 'Enterprise / Education', endDate: '2027-10-12' }
  },

  // Build-to-version mapping for matching Intune exports
  buildMap: {
    // Windows 11
    '26100': { os: 'Windows 11', version: '24H2' },
    '22631': { os: 'Windows 11', version: '23H2' },
    '22621': { os: 'Windows 11', version: '22H2' },
    '22000': { os: 'Windows 11', version: '21H2' },
    '26200': { os: 'Windows 11', version: '25H2' },
    '28000': { os: 'Windows 11', version: '26H1' },
    // Windows 10
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

/**
 * Determine the support status of a given OS + version.
 * Returns { status, endDate, daysRemaining, risk }
 *   status: 'Supported' | 'Nearing end of support' | 'Out of support'
 *   risk: 'green' | 'amber' | 'red'
 */
function getLifecycleStatus(osName, version, editionHint) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Default to Enterprise/Education for managed corporate estates
  const isEnterprise = !editionHint || /enterprise|education|iot|ltsc|ltsb/i.test(editionHint);

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

  // Pick Enterprise/Education edition by default (managed estate)
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
    // Check if covered by ESU
    esuInfo = getESUCoverage(osName, version, today);
    if (esuInfo) {
      status = 'ESU (' + esuInfo.label + ')';
      risk = 'amber';
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

  return { status, endDate: entry.endOfSupport, daysRemaining, risk, esuInfo };
}

/**
 * Check if a version has active ESU coverage.
 * Returns { label, endDate, daysRemaining } or null.
 */
function getESUCoverage(osName, version, today) {
  // Windows 10 22H2 ESU
  if (/windows\s*10/i.test(osName) && version === '22H2') {
    const entry = LIFECYCLE_DATA.windows10.find(v => v.version === '22H2');
    if (entry && entry.editions[0] && entry.editions[0].esu) {
      // Find the latest active ESU year
      for (let i = entry.editions[0].esu.length - 1; i >= 0; i--) {
        const esu = entry.editions[0].esu[i];
        const esuEnd = new Date(esu.endDate);
        const esuDays = Math.ceil((esuEnd - today) / (1000 * 60 * 60 * 24));
        if (esuDays >= 0) {
          return { label: 'Year ' + esu.year, endDate: esu.endDate, daysRemaining: esuDays, edition: esu.edition };
        }
      }
    }
  }
  // Windows 11 versions with ESU
  if (/windows\s*11/i.test(osName) && LIFECYCLE_DATA.windows11ESU[version]) {
    const esu = LIFECYCLE_DATA.windows11ESU[version];
    const esuEnd = new Date(esu.endDate);
    const esuDays = Math.ceil((esuEnd - today) / (1000 * 60 * 60 * 24));
    if (esuDays >= 0) {
      return { label: 'Ent/Edu', endDate: esu.endDate, daysRemaining: esuDays, edition: esu.edition };
    }
  }
  return null;
}

/**
 * Map a build number to OS name + version.
 * Handles multiple formats:
 *   - "10.0.19045.5371" (Intune OSVersion format)
 *   - "19045.5371" (OSBuild format)
 *   - "19045" (bare build number)
 */
function buildToVersion(buildStr) {
  if (!buildStr) return null;
  const s = String(buildStr).trim();
  const parts = s.split('.');

  // Format: 10.0.XXXXX.YYYY — Intune OSVersion
  if (parts.length === 4 && parts[0] === '10' && parts[1] === '0') {
    const major = parts[2];
    return LIFECYCLE_DATA.buildMap[major] || null;
  }
  // Format: XXXXX.YYYY — OSBuild
  if (parts.length === 2 && parts[0].length >= 4) {
    return LIFECYCLE_DATA.buildMap[parts[0]] || null;
  }
  // Format: XXXXX — bare build number
  if (parts.length === 1 && s.length >= 4) {
    return LIFECYCLE_DATA.buildMap[s] || null;
  }
  // Fallback: try first part
  return LIFECYCLE_DATA.buildMap[parts[0]] || null;
}
