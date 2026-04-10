/* ================================================================
   Intune Patching & OS Compliance Dashboard
   Created by Darren Reevell
   Confidential — For internal use only
   ================================================================ */

/* ---- DATE UTILITY ---- */
function parseIntuneDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  // Already ISO: 2026-04-01T10:30:00Z or 2026-04-01
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  // dd/mm/yyyy or dd/mm/yyyy HH:mm
  const ukMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\s,T]+(\d{1,2}):(\d{2}))?/);
  if (ukMatch) {
    const [, day, month, year, hr, min] = ukMatch;
    d = new Date(year, month - 1, day, hr || 0, min || 0);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function formatDateUK(dateOrStr) {
  const d = (dateOrStr instanceof Date) ? dateOrStr : parseIntuneDate(dateOrStr);
  if (!d || isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
}

/* ---- HTML ESCAPING (XSS prevention) ---- */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---- STATE ---- */
let patchData = [];
let windowsData = [];
let chartInstances = {};
let autoRefreshTimer = null;
const AUTO_REFRESH_MS = 24 * 60 * 60 * 1000; // 24 hours

/* ---- THEME ---- */
function toggleTheme() {
  const body = document.body;
  const isDark = body.classList.toggle('dark');
  body.classList.toggle('light', !isDark);
  document.getElementById('sunIcon').style.display = isDark ? 'none' : '';
  document.getElementById('moonIcon').style.display = isDark ? '' : 'none';
  // Rebuild charts with new colours
  if (patchData.length || windowsData.length) {
    renderAll();
  }
}

/* ---- NAVIGATION ---- */
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector('[data-tab="' + tab + '"]').classList.add('active');
  // Re-render unsupported OS cards when switching to lifecycle tab
  if (tab === 'lifecycle' && windowsData.length) {
    renderUnsupportedCards();
  }
  // Scroll main to top on tab switch
  document.getElementById('main').scrollTop = 0;
}

/* ---- CSV PARSER ---- */
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (vals[idx] || '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

/* ---- FILE HANDLING ---- */
let patchFileRaw = null;
let windowsFileRaw = null;

function handlePatchUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    patchFileRaw = e.target.result;
    const status = document.getElementById('patchStatus');
    status.textContent = file.name;
    status.classList.add('loaded');
    checkAnalyseReady();
  };
  reader.readAsText(file);
}

function handleWindowsUpload(input) {
  const file = input.files[0];
  if (!file) return;
  // Stream large files in chunks
  const reader = new FileReader();
  reader.onload = function(e) {
    windowsFileRaw = e.target.result;
    const status = document.getElementById('windowsStatus');
    status.textContent = file.name;
    status.classList.add('loaded');
    checkAnalyseReady();
  };
  reader.readAsText(file);
}

function checkAnalyseReady() {
  document.getElementById('analyseBtn').disabled = !(patchFileRaw || windowsFileRaw);
}

function analyseData() {
  if (patchFileRaw) {
    patchData = parseCSV(patchFileRaw);
  }
  if (windowsFileRaw) {
    // For large files, only keep needed columns
    const raw = parseCSV(windowsFileRaw);
    const keepCols = [
      'DeviceName', 'Device name', 'Device Name', 'Device',
      'DeviceId', 'Device ID', 'Device Id',
      'AADDeviceId', 'AzureADDeviceId', 'Microsoft Entra Device ID', 'ReferenceId',
      'OSVersion', 'OS version', 'OS Version',
      'OS', 'OperatingSystem', 'Operating system',
      'OSBuild', 'OS Build', 'Build',
      'ManagedBy', 'Managed by',
      'UserPrincipalName', 'UPN', 'User principal name', 'UserName', 'User name', 'Primary user display name', 'PrimaryUserDisplayName', 'PrimaryUserUPN',
      'Manufacturer', 'Model',
      'SerialNumber', 'Serial number',
      'LastCheckIn', 'LastSyncDateTime', 'Last check-in', 'Last contact', 'LastContact',
      'SupportState', 'Support State', 'SupportHorizon',
      'LifecycleStatus', 'Lifecycle Status',
      'ComplianceState', 'Compliance state', 'Compliance',
      'OwnerType', 'Ownership', 'Owner type',
      'ManagementAgent', 'Management agent', 'ManagementAgents',
      'Category', 'DeviceCategory', 'Device category'
    ];
    windowsData = raw.map(row => {
      const slim = {};
      for (const key of Object.keys(row)) {
        if (keepCols.some(k => k.toLowerCase() === key.toLowerCase())) {
          slim[key] = row[key];
        }
      }
      return slim;
    });
  }
  renderAll();
  startAutoRefresh();
}


/* ---- RENDER ALL ---- */
function renderAll() {
  buildESULookup();
  enrichLifecycleData();
  markStaleDevices();
  renderPatch();
  renderWindows();
  renderExecutive();
  renderLifecycleTables();
  renderUnsupportedCards();
  checkEOSAlerts();
}

/* ---- ESU LOOKUP from patch data ---- */
let esuLookup = {}; // keyed by AADDeviceId or DeviceName
function buildESULookup() {
  esuLookup = {};
  patchData.forEach(r => {
    const esu = findCol(r, 'ExtendedSecurity', 'ExtendedSecurityUpdate', 'Extended Security', 'ESU', 'ESUStatus');
    if (esu && /enrolled/i.test(esu)) {
      const aadId = findCol(r, 'AADDeviceId', 'AzureADDeviceId', 'Azure AD Device ID');
      const name = findCol(r, 'DeviceName', 'Device name', 'Device');
      if (aadId) esuLookup['id:' + aadId.toLowerCase()] = true;
      if (name) esuLookup['name:' + name.toLowerCase()] = true;
    }
  });
}

function isESUEnrolled(row) {
  // Check direct ESU field on the row itself (if patch data)
  const esu = findCol(row, 'ExtendedSecurity', 'ExtendedSecurityUpdate', 'Extended Security', 'ESU', 'ESUStatus');
  if (esu && /enrolled/i.test(esu)) return true;
  // Check via lookup (for inventory rows matched to patch data)
  const aadId = findCol(row, 'AADDeviceId', 'AzureADDeviceId', 'Azure AD Device ID', 'Microsoft Entra Device ID', 'ReferenceId');
  const name = findCol(row, 'DeviceName', 'Device name', 'Device Name', 'Device');
  if (aadId && esuLookup['id:' + aadId.toLowerCase()]) return true;
  if (name && esuLookup['name:' + name.toLowerCase()]) return true;
  return false;
}

/* ---- MARK STALE DEVICES (from inventory data) ---- */
function markStaleDevices() {
  const STALE_MS = 30 * 86400000;
  const now = Date.now();
  windowsData.forEach(row => {
    const ls = findCol(row, 'LastContact', 'Last contact', 'Last check-in', 'LastCheckIn', 'LastSyncDateTime');
    const d = parseIntuneDate(ls);
    if (d) {
      row._lastContact = d;
      row._lastContactDisplay = formatDateUK(d);
      row._daysSinceContact = Math.floor((now - d.getTime()) / 86400000);
      row._isStale = (now - d.getTime()) > STALE_MS;
    } else {
      row._lastContact = null;
      row._lastContactDisplay = '';
      row._daysSinceContact = null;
      row._isStale = false;
    }
  });
}

/* ---- ENRICH LIFECYCLE ---- */
function enrichLifecycleData() {
  windowsData.forEach(row => {
    // Try multiple sources for build info:
    // 1. OSVersion (Intune format: "10.0.19045.5371")
    // 2. OSBuild (e.g. "19045.5371")
    // 3. OS version (e.g. "Windows 11 24H2")
    const osVersion = findCol(row, 'OSVersion', 'OS version', 'osVersion') || '';
    const osBuild = findCol(row, 'OSBuild', 'OS Build', 'Build') || '';
    const osField = findCol(row, 'OS', 'OperatingSystem') || '';
    const deviceName = findCol(row, 'DeviceName', 'Device name', 'Device Name', 'Device') || '';

    // Store device name for consistent access
    row._deviceName = deviceName;

    // Try build mapping from multiple sources
    let mapped = buildToVersion(osVersion) || buildToVersion(osBuild);

    if (mapped) {
      row._osName = mapped.os;
      row._version = mapped.version;
      row._buildDisplay = osVersion || osBuild;
      const lifecycle = getLifecycleStatus(mapped.os, mapped.version, null);
      row._lifecycleStatus = lifecycle.status;
      row._endDate = lifecycle.endDate;
      row._daysRemaining = lifecycle.daysRemaining;
      row._risk = lifecycle.risk;
    } else {
      // Try parsing from a friendly OS version string like "Windows 11 24H2"
      const vMatch = osVersion.match(/(Windows\s*\d+)\s+(\S+)/i) ||
                     osField.match(/(Windows\s*\d+)\s+(\S+)/i);
      if (vMatch) {
        row._osName = vMatch[1];
        row._version = vMatch[2];
        const lifecycle = getLifecycleStatus(vMatch[1], vMatch[2], null);
        row._lifecycleStatus = lifecycle.status;
        row._endDate = lifecycle.endDate;
        row._daysRemaining = lifecycle.daysRemaining;
        row._risk = lifecycle.risk;
      } else {
        // Fallback: use SupportState from Intune if present
        const ss = findCol(row, 'SupportState', 'Support State', 'SupportHorizon') || '';
        if (/out of support|unsupported/i.test(ss)) {
          row._lifecycleStatus = 'Out of support';
          row._risk = 'red';
        } else if (/in support|supported/i.test(ss)) {
          row._lifecycleStatus = 'Supported';
          row._risk = 'green';
        } else {
          row._lifecycleStatus = 'Unknown';
          row._risk = 'amber';
        }
        row._osName = osField || 'Windows';
        row._version = '';
      }
      row._buildDisplay = osVersion || osBuild;
    }

    // Reclassify Unknown as Out of support
    if (row._lifecycleStatus === 'Unknown') {
      row._lifecycleStatus = 'Out of support';
      row._risk = 'red';
    }

    // ESU override: if device is out of support but enrolled in ESU, mark as in-support
    row._esuEnrolled = isESUEnrolled(row);
    if (row._esuEnrolled && (row._lifecycleStatus === 'Out of support' || (row._lifecycleStatus || '').startsWith('ESU'))) {
      // Check ESU coverage end date to determine if nearing end of ESU
      const esuCheck = (row._osName && row._version) ? getESUCoverage(row._osName, row._version, new Date()) : null;
      if (esuCheck && esuCheck.daysRemaining <= 365) {
        row._lifecycleStatus = 'ESU (Enrolled)';
        row._risk = 'amber'; // ESU coverage ending within 12 months
        row._endDate = esuCheck.endDate;
        row._daysRemaining = esuCheck.daysRemaining;
      } else {
        row._lifecycleStatus = 'ESU (Enrolled)';
        row._risk = 'green';
        if (esuCheck) {
          row._endDate = esuCheck.endDate;
          row._daysRemaining = esuCheck.daysRemaining;
        }
      }
    }
  });
}

/* ---- HELPER: column finder ---- */
function findCol(row, ...candidates) {
  for (const c of candidates) {
    const cl = c.toLowerCase().replace(/[\s_-]/g, '');
    for (const key of Object.keys(row)) {
      // Exact match (case-insensitive)
      if (key.toLowerCase() === c.toLowerCase()) return row[key];
      // Normalised match (ignore spaces, underscores, hyphens)
      if (key.toLowerCase().replace(/[\s_-]/g, '') === cl) return row[key];
    }
  }
  return '';
}

/* ---- PATCH RENDERING ---- */
function renderPatch() {
  if (!patchData.length) return;
  document.getElementById('patchEmpty').style.display = 'none';
  document.getElementById('patchContent').style.display = 'block';

  const total = patchData.length;
  const upToDate = patchData.filter(r => {
    const s = findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus');
    return s === 'Up To Date';
  }).length;
  const notUpToDate = patchData.filter(r => {
    const s = findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus');
    return s === 'Not Up To Date';
  }).length;
  const alerted = patchData.filter(r => parseInt(findCol(r, 'AlertCount', 'Alerts') || '0') > 0).length;
  const compPct = total > 0 ? ((upToDate / total) * 100).toFixed(1) : 0;
  const highRisk = patchData.filter(r => {
    const s = findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus');
    const a = parseInt(findCol(r, 'AlertCount', 'Alerts') || '0');
    return s === 'Not Up To Date' || a >= 3;
  }).length;

  const kpis = [
    { label: 'Total Devices', value: total.toLocaleString(), cls: '', key: 'totalDevices' },
    { label: 'Patch Compliance', value: compPct + '%', cls: parseFloat(compPct) >= 95 ? 'kpi-green' : parseFloat(compPct) >= 85 ? 'kpi-amber' : 'kpi-red', key: 'patchCompliance' },
    { label: 'Up to Date', value: upToDate.toLocaleString(), cls: 'kpi-green', key: 'upToDate' },
    { label: 'Not up to Date', value: notUpToDate.toLocaleString(), cls: 'kpi-red', key: 'notUpToDate' },
    { label: 'Alerted Devices', value: alerted.toLocaleString(), cls: 'kpi-amber', key: 'alerted' },
    { label: 'Patch High Risk', value: highRisk.toLocaleString(), cls: 'kpi-red', key: 'patchHighRisk' }
  ];

  const kpiGrid = document.getElementById('patchKpis');
  kpiGrid.innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.cls}">
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-label">${k.label}</div>
      <button class="export-btn kpi-export" data-kpi-tab="patch" data-kpi-export="${k.key}">Export CSV</button>
    </div>
  `).join('');

  // Compliance chart — with count labels
  renderChart('complianceChart', 'doughnut', {
    labels: ['Up to Date (' + upToDate.toLocaleString() + ')', 'Not up to Date (' + notUpToDate.toLocaleString() + ')'],
    datasets: [{
      data: [upToDate, notUpToDate],
      backgroundColor: [getColor('green'), getColor('red')],
      borderWidth: 0
    }]
  }, {
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { callbacks: { label: function(ctx) { return ctx.label + ': ' + ctx.parsed.toLocaleString(); } } }
    }
  });

  // Alerts by ring
  const rings = {};
  patchData.forEach(r => {
    const ring = findCol(r, 'DeploymentGroupName', 'Ring', 'DeploymentGroup') || 'Unknown';
    const a = parseInt(findCol(r, 'AlertCount', 'Alerts') || '0');
    if (a > 0) rings[ring] = (rings[ring] || 0) + 1;
  });
  renderChart('ringChart', 'bar', {
    labels: Object.keys(rings),
    datasets: [{
      label: 'Alerted devices',
      data: Object.values(rings),
      backgroundColor: getColor('amber'),
      borderRadius: 4
    }]
  });

  // Alerts by deployment ring (horizontal bar) — more useful than by business group
  // which often shows N/A for Intune exports
  const ringAlertCounts = {};
  patchData.forEach(r => {
    const ring = findCol(r, 'DeploymentGroupName', 'Ring', 'DeploymentGroup', 'BusinessGroupName', 'BusinessGroup', 'Group') || 'Unknown';
    const s = findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus');
    if (s === 'Not Up To Date') ringAlertCounts[ring] = (ringAlertCounts[ring] || 0) + 1;
  });
  const sortedRings = Object.entries(ringAlertCounts).sort((a, b) => b[1] - a[1]);
  renderChart('groupChart', 'bar', {
    labels: sortedRings.map(e => e[0]),
    datasets: [{
      label: 'Non-compliant devices',
      data: sortedRings.map(e => e[1]),
      backgroundColor: getColor('accent'),
      borderRadius: 4
    }]
  }, { indexAxis: 'y' });

  // Exception table
  const exceptions = patchData
    .filter(r => {
      const s = findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus');
      return s === 'Not Up To Date';
    })
    .sort((a, b) => (parseInt(findCol(b, 'AlertCount') || '0')) - (parseInt(findCol(a, 'AlertCount') || '0')))
    .slice(0, 100);

  const tbody = document.getElementById('patchExceptionBody');
  tbody.innerHTML = exceptions.map(r => `<tr>
    <td>${esc(findCol(r, 'DeviceName', 'Device'))}</td>
    <td>${esc(findCol(r, 'BusinessGroupName', 'BusinessGroup', 'Group'))}</td>
    <td>${esc(findCol(r, 'DeploymentGroupName', 'Ring', 'DeploymentGroup'))}</td>
    <td><span class="badge badge-red">Not up to Date</span></td>
    <td>${esc(findCol(r, 'AlertCount', 'Alerts'))}</td>
    <td>${esc(findCol(r, 'OSBuild', 'Build'))}</td>
  </tr>`).join('');
}

/* ---- WINDOWS RENDERING ---- */
function renderWindows() {
  if (!windowsData.length) return;
  document.getElementById('windowsEmpty').style.display = 'none';
  document.getElementById('windowsContent').style.display = 'block';

  const total = windowsData.length;
  const supported = windowsData.filter(r => r._lifecycleStatus === 'Supported').length;
  const esuEnrolled = windowsData.filter(r => r._lifecycleStatus === 'ESU (Enrolled)').length;
  const esuNearing = windowsData.filter(r => r._lifecycleStatus === 'ESU (Enrolled)' && r._risk === 'amber').length;
  const nearing = windowsData.filter(r => r._lifecycleStatus === 'Nearing end of support').length;
  const nearingTotal = nearing + esuNearing;
  const unsupported = windowsData.filter(r => r._lifecycleStatus === 'Out of support').length;
  const unknown = windowsData.filter(r => r._lifecycleStatus === 'Unknown').length;
  const staleCount = windowsData.filter(r => r._isStale).length;
  // Supported OS % = everything that is NOT Out of support and NOT Unknown
  const inSupportTotal = total - unsupported - unknown;
  const supportedPct = total > 0 ? ((inSupportTotal / total) * 100).toFixed(1) : 0;

  const kpis = [
    { label: 'Total Devices', value: total.toLocaleString(), cls: '', key: 'winTotal' },
    { label: 'Supported OS', value: supportedPct + '%', cls: parseFloat(supportedPct) >= 95 ? 'kpi-green' : parseFloat(supportedPct) >= 80 ? 'kpi-amber' : 'kpi-red', key: 'winSupported' },
    { label: 'ESU (Enrolled)', value: esuEnrolled.toLocaleString(), cls: 'kpi-green', key: 'winESU' },
    { label: 'Nearing End of Support', value: nearingTotal.toLocaleString(), cls: 'kpi-amber', key: 'winNearing' },
    { label: 'Unsupported OS', value: unsupported.toLocaleString(), cls: 'kpi-red', key: 'winUnsupported' },
    { label: 'Stale (30+ days)', value: staleCount.toLocaleString(), cls: staleCount > 0 ? 'kpi-red' : '', key: 'winStale' },
  ];

  const kpiGrid = document.getElementById('windowsKpis');
  kpiGrid.innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.cls}">
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-label">${k.label}</div>
      <button class="export-btn kpi-export" data-kpi-tab="windows" data-kpi-export="${k.key}">Export CSV</button>
    </div>
  `).join('');

  // Version compliance chart
  const versions = {};
  windowsData.forEach(r => {
    const label = (r._osName || 'Unknown') + ' ' + (r._version || '');
    versions[label] = (versions[label] || 0) + 1;
  });
  const vLabels = Object.keys(versions).sort();
  const vColors = vLabels.map(l => {
    const sample = windowsData.find(r => (r._osName + ' ' + r._version).trim() === l.trim());
    if (sample && sample._risk === 'red') return getColor('red');
    if (sample && sample._risk === 'amber') return getColor('amber');
    return getColor('green');
  });
  renderChart('versionChart', 'bar', {
    labels: vLabels,
    datasets: [{
      label: 'Devices',
      data: vLabels.map(l => versions[l]),
      backgroundColor: vColors,
      borderRadius: 4
    }]
  });

  // Lifecycle posture doughnut — with counts in labels
  renderChart('lifecycleChart', 'doughnut', {
    labels: [
      'Supported (' + supported.toLocaleString() + ')',
      'ESU Enrolled (' + esuEnrolled.toLocaleString() + ')',
      'Nearing EOS (' + nearingTotal.toLocaleString() + ')',
      'Out of support (' + unsupported.toLocaleString() + ')',
      'Unknown (' + unknown.toLocaleString() + ')'
    ],
    datasets: [{
      data: [supported, esuEnrolled, nearingTotal, unsupported, unknown],
      backgroundColor: [getColor('green'), '#22d3ee', getColor('amber'), getColor('red'), '#9ca3af'],
      borderWidth: 0
    }]
  }, {
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { callbacks: { label: function(ctx) { return ctx.label + ': ' + ctx.parsed.toLocaleString(); } } }
    }
  });

  // Exception table — includes stale devices and shows ESU status
  const winExceptions = windowsData
    .filter(r => r._risk === 'red' || r._risk === 'amber' || r._isStale)
    .sort((a, b) => {
      // Stale first, then by risk
      if (a._isStale !== b._isStale) return a._isStale ? -1 : 1;
      return (a._daysRemaining || 9999) - (b._daysRemaining || 9999);
    })
    .slice(0, 150);

  const wBody = document.getElementById('windowsExceptionBody');
  wBody.innerHTML = winExceptions.map(r => {
    let badgeCls = r._risk === 'red' ? 'badge-red' : r._risk === 'amber' ? 'badge-amber' : 'badge-green';
    let riskLabel = r._risk === 'red' ? 'High' : r._risk === 'amber' ? 'Medium' : 'Low';
    if (r._isStale) { riskLabel = 'Stale'; badgeCls = 'badge-red'; }
    const lastCheckin = r._lastContactDisplay || '—';
    return `<tr${r._isStale ? ' style="opacity:0.7;background:var(--red-bg)"' : ''}>
      <td>${esc(r._deviceName || findCol(r, 'DeviceName', 'Device name', 'Device'))}</td>
      <td>${esc((r._osName || '') + ' ' + (r._version || ''))}</td>
      <td>${esc(r._buildDisplay || findCol(r, 'OSVersion', 'OSBuild', 'Build'))}</td>
      <td><span class="badge ${r._lifecycleStatus === 'ESU (Enrolled)' ? 'badge-green' : badgeCls}">${esc(r._lifecycleStatus)}</span></td>
      <td>${esc(r._endDate || '—')}</td>
      <td>${esc(lastCheckin)}</td>
      <td><span class="badge ${badgeCls}">${esc(riskLabel)}</span></td>
    </tr>`;
  }).join('');
}

/* ---- EXECUTIVE RENDERING ---- */
function renderExecutive() {
  if (!patchData.length && !windowsData.length) return;
  document.getElementById('execEmpty').style.display = 'none';
  document.getElementById('execContent').style.display = 'block';

  // Headline
  const pTotal = patchData.length;
  const pUpToDate = patchData.filter(r => findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus') === 'Up To Date').length;
  const pPct = pTotal > 0 ? ((pUpToDate / pTotal) * 100).toFixed(1) : 'N/A';
  const wTotal = windowsData.length;
  const wUnsupportedExec = windowsData.filter(r => r._lifecycleStatus === 'Out of support').length;
  const wUnknownExec = windowsData.filter(r => r._lifecycleStatus === 'Unknown').length;
  // Supported OS % = everything that is NOT Out of support and NOT Unknown
  const wPct = wTotal > 0 ? (((wTotal - wUnsupportedExec - wUnknownExec) / wTotal) * 100).toFixed(1) : 'N/A';
  const wUnsupported = windowsData.filter(r => r._lifecycleStatus === 'Out of support').length;
  const wNearing = windowsData.filter(r => r._lifecycleStatus === 'Nearing end of support').length;

  // Stale device analysis — sourced from Device Inventory (windowsData)
  const wStale = windowsData.filter(r => r._isStale).length;
  const wActive = wTotal - wStale;

  // ESU enrolled count
  const wESU = windowsData.filter(r => r._lifecycleStatus === 'ESU (Enrolled)').length;

  // Patch compliance adjusted for stale inventory devices
  // Match stale inventory devices to patch data via AADDeviceId or DeviceName
  const staleDeviceNames = new Set();
  windowsData.filter(r => r._isStale).forEach(r => {
    const name = (r._deviceName || '').toLowerCase();
    const aadId = (findCol(r, 'AADDeviceId', 'AzureADDeviceId', 'Microsoft Entra Device ID', 'ReferenceId') || '').toLowerCase();
    if (name) staleDeviceNames.add('name:' + name);
    if (aadId) staleDeviceNames.add('id:' + aadId);
  });
  function isPatchDeviceStale(row) {
    const name = (findCol(row, 'DeviceName', 'Device name', 'Device') || '').toLowerCase();
    const aadId = (findCol(row, 'AADDeviceId', 'AzureADDeviceId', 'Azure AD Device ID') || '').toLowerCase();
    return (name && staleDeviceNames.has('name:' + name)) || (aadId && staleDeviceNames.has('id:' + aadId));
  }
  const pStale = patchData.filter(isPatchDeviceStale).length;
  const pActive = pTotal - pStale;
  const pActiveUpToDate = patchData.filter(r => !isPatchDeviceStale(r) && findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus') === 'Up To Date').length;
  const pActivePct = pActive > 0 ? ((pActiveUpToDate / pActive) * 100).toFixed(1) : 'N/A';

  // Build headline
  let headlineHtml = `<h2>Executive Headline</h2><p>`;
  headlineHtml += `Patch compliance stands at <strong>${pPct}%</strong> across ${pTotal.toLocaleString()} devices. `;
  headlineHtml += parseFloat(pPct) >= 95 ? 'The estate is within target. ' : parseFloat(pPct) >= 85 ? 'Compliance is below the 95% target and requires remediation. ' : 'Compliance is critically below target and requires immediate action. ';

  if (wStale > 0) {
    headlineHtml += `<strong>${wStale.toLocaleString()}</strong> device${wStale !== 1 ? 's have' : ' has'} not reported to Intune in 30 or more days (based on Device Inventory). `;
    if (pStale > 0) {
      headlineHtml += `Excluding these stale devices, active patch compliance is <strong>${pActivePct}%</strong> across ${pActive.toLocaleString()} active devices. `;
    }
  }

  if (wTotal > 0) {
    headlineHtml += `Windows lifecycle posture: <strong>${wPct}%</strong> of ${wTotal.toLocaleString()} devices are running a supported OS`;
    if (wESU > 0) headlineHtml += ` (including ${wESU.toLocaleString()} covered by Extended Security Updates)`;
    headlineHtml += `. ${wUnsupported.toLocaleString()} device${wUnsupported !== 1 ? 's are' : ' is'} running an unsupported OS and ${wNearing.toLocaleString()} ${wNearing !== 1 ? 'are' : 'is'} nearing end of support within 12 months.`;
  }
  headlineHtml += `</p>`;
  document.getElementById('execHeadline').innerHTML = headlineHtml;

  // Priority actions
  const actions = [];
  if (pTotal > 0 && parseFloat(pPct) < 95) {
    actions.push({ text: `Remediate ${(pTotal - pUpToDate).toLocaleString()} non-compliant devices to reach 95% patch compliance`, level: parseFloat(pPct) < 85 ? 'red' : 'amber' });
  }
  if (wStale > 0) {
    actions.push({ text: `Investigate ${wStale.toLocaleString()} device${wStale !== 1 ? 's' : ''} with no Intune check-in for 30+ days (from Device Inventory) — compliance data may be unreliable`, level: wStale > (wTotal * 0.05) ? 'red' : 'amber' });
  }
  if (wUnsupported > 0) {
    actions.push({ text: `Upgrade ${wUnsupported.toLocaleString()} device${wUnsupported !== 1 ? 's' : ''} running unsupported OS versions (no ESU enrolment)`, level: 'red' });
  }
  if (wNearing > 0) {
    actions.push({ text: `Plan migration for ${wNearing.toLocaleString()} device${wNearing !== 1 ? 's' : ''} nearing end of support`, level: 'amber' });
  }
  if (actions.length === 0) {
    actions.push({ text: 'All targets met — estate is compliant and within lifecycle', level: 'green' });
  }

  document.getElementById('priorityList').innerHTML = actions.map(a => `
    <div class="priority-item">
      <div class="priority-icon ${a.level}"></div>
      <div>${a.text}</div>
    </div>
  `).join('');

  // Device Connectivity card (sourced from Device Inventory)
  const wStalePct = wTotal > 0 ? ((wStale / wTotal) * 100).toFixed(1) : '0';
  const connectivityItems = [
    { label: 'Device Inventory — total devices', value: wTotal.toLocaleString(), badge: 'badge-green' },
    { label: 'Active devices (checked in within 30 days)', value: wActive.toLocaleString(), badge: 'badge-green' },
    { label: 'Stale devices (30+ days no check-in)', value: wStale.toLocaleString(), badge: wStale > 0 ? (parseFloat(wStalePct) > 5 ? 'badge-red' : 'badge-amber') : 'badge-green' },
    { label: 'Stale percentage', value: wStalePct + '%', badge: parseFloat(wStalePct) > 5 ? 'badge-red' : parseFloat(wStalePct) > 0 ? 'badge-amber' : 'badge-green' },
    { label: 'ESU enrolled devices', value: wESU.toLocaleString(), badge: wESU > 0 ? 'badge-green' : '' },
  ];
  if (pStale > 0) {
    connectivityItems.push(
      { label: 'Patch devices matched as stale', value: pStale.toLocaleString(), badge: 'badge-amber' }
    );
  }
  document.getElementById('connectivityGrid').innerHTML = connectivityItems.map(item => `
    <div class="iso-row">
      <div>${item.label}</div>
      <span class="badge ${item.badge}">${item.value}</span>
    </div>
  `).join('');

  // Adjusted Patch Compliance card (excluding stale devices)
  const pNotUpActive = patchData.filter(r => !isPatchDeviceStale(r) && findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus') === 'Not Up To Date').length;
  const adjustedItems = [
    { label: 'Overall compliance (all devices)', value: pPct + '%', badge: parseFloat(pPct) >= 95 ? 'badge-green' : parseFloat(pPct) >= 85 ? 'badge-amber' : 'badge-red' },
    { label: 'Active compliance (excl. stale)', value: pActivePct + '%', badge: parseFloat(pActivePct) >= 95 ? 'badge-green' : parseFloat(pActivePct) >= 85 ? 'badge-amber' : 'badge-red' },
    { label: 'Active devices — up to date', value: pActiveUpToDate.toLocaleString(), badge: 'badge-green' },
    { label: 'Active devices — not up to date', value: pNotUpActive.toLocaleString(), badge: pNotUpActive > 0 ? 'badge-red' : 'badge-green' },
    { label: 'Stale devices excluded', value: pStale.toLocaleString(), badge: pStale > 0 ? 'badge-amber' : 'badge-green' },
    { label: 'Compliance difference', value: pStale > 0 ? ((parseFloat(pActivePct) - parseFloat(pPct)) >= 0 ? '+' : '') + (parseFloat(pActivePct) - parseFloat(pPct)).toFixed(1) + ' pp' : 'N/A', badge: parseFloat(pActivePct) > parseFloat(pPct) ? 'badge-green' : 'badge-amber' }
  ];
  document.getElementById('adjustedGrid').innerHTML = adjustedItems.map(item => `
    <div class="iso-row">
      <div>${item.label}</div>
      <span class="badge ${item.badge}">${item.value}</span>
    </div>
  `).join('');

  // Risk by OS version — more useful than regional when no region data exists
  const osRiskMap = {};
  windowsData.forEach(r => {
    const label = (r._osName || 'Unknown') + ' ' + (r._version || '');
    if (!osRiskMap[label]) osRiskMap[label] = { total: 0, risk: 0, nearing: 0, unsupported: 0 };
    osRiskMap[label].total++;
    if (r._lifecycleStatus === 'Out of support') osRiskMap[label].unsupported++;
    if (r._lifecycleStatus === 'Nearing end of support') osRiskMap[label].nearing++;
    if (r._risk === 'red' || r._risk === 'amber') osRiskMap[label].risk++;
  });
  // Sort by risk count descending
  const osLabels = Object.keys(osRiskMap).sort((a, b) => osRiskMap[b].risk - osRiskMap[a].risk);
  renderChart('regionalChart', 'bar', {
    labels: osLabels,
    datasets: [{
      label: 'Unsupported',
      data: osLabels.map(l => osRiskMap[l].unsupported),
      backgroundColor: getColor('red'),
      borderRadius: 4
    }, {
      label: 'Nearing EOS',
      data: osLabels.map(l => osRiskMap[l].nearing),
      backgroundColor: getColor('amber'),
      borderRadius: 4
    }, {
      label: 'Supported',
      data: osLabels.map(l => osRiskMap[l].total - osRiskMap[l].risk),
      backgroundColor: getColor('green'),
      borderRadius: 4
    }]
  });

  // ISO evidence
  const isoItems = [
    { label: 'A.8.8 — Patch management policy enforced', value: pTotal > 0 ? 'Yes' : 'No data', badge: pTotal > 0 ? 'badge-green' : 'badge-red' },
    { label: 'A.8.8 — Non-compliant devices identified', value: patchData.filter(r => findCol(r, 'QUStatusLevel1Name') === 'Not Up To Date').length.toLocaleString(), badge: 'badge-amber' },
    { label: 'A.12.6 — Supported OS percentage (incl. ESU)', value: wTotal > 0 ? wPct + '%' : 'No data', badge: parseFloat(wPct) >= 95 ? 'badge-green' : 'badge-amber' },
    { label: 'A.12.6 — ESU enrolled devices', value: wESU.toLocaleString(), badge: wESU > 0 ? 'badge-green' : '' },
    { label: 'A.12.6 — Unsupported OS devices (no ESU)', value: wUnsupported.toLocaleString(), badge: wUnsupported === 0 ? 'badge-green' : 'badge-red' },
    { label: 'A.8.1 — Asset inventory coverage', value: wTotal > 0 ? wTotal.toLocaleString() + ' devices' : 'No data', badge: wTotal > 0 ? 'badge-green' : 'badge-red' },
    { label: 'A.8.1 — Stale devices (30+ days)', value: wStale.toLocaleString(), badge: wStale > 0 ? 'badge-red' : 'badge-green' },
    { label: 'Lifecycle data source', value: 'Microsoft Learn', badge: 'badge-green' },
    { label: 'Last lifecycle refresh', value: LIFECYCLE_DATA.lastUpdated, badge: 'badge-green' }
  ];

  document.getElementById('isoGrid').innerHTML = isoItems.map(item => `
    <div class="iso-row">
      <div>${item.label}</div>
      <span class="badge ${item.badge}">${item.value}</span>
    </div>
  `).join('');

  // EOS alerts
  renderEOSAlerts();
}

function renderEOSAlerts() {
  if (!windowsData.length) return;

  // Group by version and count nearing + unsupported
  const versionGroups = {};
  windowsData.forEach(r => {
    const key = (r._osName || '') + ' ' + (r._version || '');
    if (!versionGroups[key]) {
      versionGroups[key] = { count: 0, endDate: r._endDate, risk: r._risk, status: r._lifecycleStatus };
    }
    versionGroups[key].count++;
  });

  const alertItems = Object.entries(versionGroups)
    .filter(([_, v]) => v.risk === 'red' || v.risk === 'amber')
    .sort((a, b) => (a[1].endDate || '').localeCompare(b[1].endDate || ''));

  const list = document.getElementById('eosAlertList');
  if (alertItems.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No end-of-support alerts at this time.</p>';
    return;
  }

  list.innerHTML = alertItems.map(([version, data]) => {
    const badgeCls = data.risk === 'red' ? 'badge-red' : 'badge-amber';
    return `<div class="eos-item">
      <div>
        <span class="eos-label">${esc(version.trim())}</span>
        <span class="eos-date"> — ${esc(data.endDate || 'Unknown')}</span>
      </div>
      <div>
        <span class="eos-count">${data.count.toLocaleString()}</span> devices
        <span class="badge ${badgeCls}" style="margin-left:8px">${esc(data.status)}</span>
      </div>
    </div>`;
  }).join('');
}

/* ---- LIFECYCLE TABLES ---- */
function renderLifecycleTables() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Windows 11
  const w11Body = document.getElementById('win11LifecycleBody');
  let w11Html = '';
  LIFECYCLE_DATA.windows11.concat(LIFECYCLE_DATA.windows11LTSC).forEach(ver => {
    ver.editions.forEach(ed => {
      const end = new Date(ed.endOfSupport);
      const days = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
      let badge, badgeCls;
      if (days < 0) { badge = 'Out of support'; badgeCls = 'badge-red'; }
      else if (days <= 365) { badge = 'Nearing end of support'; badgeCls = 'badge-amber'; }
      else { badge = 'Supported'; badgeCls = 'badge-green'; }
      w11Html += `<tr>
        <td>${ver.version}</td>
        <td>${ed.edition}</td>
        <td>${ver.availability || '—'}</td>
        <td>${ed.endOfSupport}</td>
        <td>${days >= 0 ? days + ' days' : Math.abs(days) + ' days ago'}</td>
        <td><span class="badge ${badgeCls}">${badge}</span></td>
      </tr>`;
    });
  });
  w11Body.innerHTML = w11Html;

  // Windows 10 (with ESU)
  const w10Body = document.getElementById('win10LifecycleBody');
  let w10Html = '';
  LIFECYCLE_DATA.windows10.forEach(ver => {
    ver.editions.forEach(ed => {
      const end = new Date(ed.endOfSupport);
      const days = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
      let badge, badgeCls;
      // Check ESU coverage
      const esuCoverage = (days < 0 && ed.esu) ? ed.esu.filter(e => {
        const eEnd = new Date(e.endDate);
        return Math.ceil((eEnd - today) / (1000 * 60 * 60 * 24)) >= 0;
      }) : [];
      const latestEsu = esuCoverage.length > 0 ? esuCoverage[esuCoverage.length - 1] : null;

      if (days < 0 && latestEsu) {
        const esuEnd = new Date(latestEsu.endDate);
        const esuDays = Math.ceil((esuEnd - today) / (1000 * 60 * 60 * 24));
        badge = 'ESU Year ' + latestEsu.year;
        badgeCls = 'badge-amber';
      } else if (days < 0) {
        badge = 'Out of support'; badgeCls = 'badge-red';
      } else if (days <= 365) {
        badge = 'Nearing end of support'; badgeCls = 'badge-amber';
      } else {
        badge = 'Supported'; badgeCls = 'badge-green';
      }

      // ESU end date display
      let esuDisplay = '—';
      if (ed.esu && ed.esu.length > 0) {
        const lastEsu = ed.esu[ed.esu.length - 1];
        esuDisplay = lastEsu.endDate + ' (Year ' + lastEsu.year + ')';
      }

      w10Html += `<tr>
        <td>${ver.version}</td>
        <td>${ed.edition}</td>
        <td>${ed.endOfSupport}</td>
        <td>${esuDisplay}</td>
        <td>${days >= 0 ? days + ' days' : Math.abs(days) + ' days ago'}</td>
        <td><span class="badge ${badgeCls}">${badge}</span></td>
      </tr>`;
    });
  });
  w10Body.innerHTML = w10Html;

  // Update lifecycle info in sidebar
  document.getElementById('lifecycleUpdated').textContent = 'Last verified: ' + LIFECYCLE_DATA.lastUpdated;
}

/* ---- UNSUPPORTED OS CARDS ---- */
function renderUnsupportedCards() {
  const unsupportedEl = document.getElementById('unsupportedOsCount');
  const nearingEl = document.getElementById('nearingEosCount');
  if (!windowsData.length) {
    unsupportedEl.textContent = 'No data';
    nearingEl.textContent = 'No data';
    return;
  }
  const unsupported = windowsData.filter(r => r._lifecycleStatus === 'Out of support');
  const nearing = windowsData.filter(r => r._lifecycleStatus === 'Nearing end of support');
  unsupportedEl.textContent = unsupported.length.toLocaleString();
  nearingEl.textContent = nearing.length.toLocaleString();

  // Update card colour based on count
  const unsupportedCard = document.getElementById('unsupportedOsCard');
  const nearingCard = document.getElementById('nearingEosCard');
  unsupportedCard.className = 'kpi-card ' + (unsupported.length > 0 ? 'kpi-red' : 'kpi-green');
  nearingCard.className = 'kpi-card ' + (nearing.length > 0 ? 'kpi-amber' : 'kpi-green');
}

/* ---- EXPORT: UNSUPPORTED OS (the key feature) ---- */
function exportUnsupportedOS() {
  if (!windowsData.length) {
    alert('No data loaded. Please upload files or load demo data first.');
    return;
  }
  const unsupported = windowsData.filter(r => r._lifecycleStatus === 'Out of support');
  if (unsupported.length === 0) {
    alert('No unsupported OS devices found in the current dataset.');
    return;
  }
  const headers = ['Device Name', 'OS', 'Version', 'OS Build', 'Compliance Status', 'Support Status', 'End of Support Date', 'Days Since End of Support', 'User'];
  const rows = unsupported.map(r => [
    findCol(r, 'DeviceName', 'Device'),
    r._osName || '',
    r._version || '',
    findCol(r, 'OSBuild', 'Build'),
    findCol(r, 'ComplianceState', 'Compliance') || 'Noncompliant',
    r._lifecycleStatus,
    r._endDate || '',
    r._daysRemaining !== null ? Math.abs(r._daysRemaining) : '',
    findCol(r, 'UserPrincipalName', 'UPN', 'User')
  ]);
  downloadCSV('unsupported-os-devices.csv', headers, rows);
}

/* ---- EXPORT: NEARING EOS ---- */
function exportNearingEOS() {
  if (!windowsData.length) {
    alert('No data loaded. Please upload files or load demo data first.');
    return;
  }
  const nearing = windowsData.filter(r => r._lifecycleStatus === 'Nearing end of support');
  if (nearing.length === 0) {
    alert('No devices nearing end of support found.');
    return;
  }
  const headers = ['Device Name', 'OS', 'Version', 'OS Build', 'Compliance Status', 'Support Status', 'End of Support Date', 'Days Remaining', 'User'];
  const rows = nearing.map(r => [
    findCol(r, 'DeviceName', 'Device'),
    r._osName || '',
    r._version || '',
    findCol(r, 'OSBuild', 'Build'),
    findCol(r, 'ComplianceState', 'Compliance') || 'Compliant',
    r._lifecycleStatus,
    r._endDate || '',
    r._daysRemaining || '',
    findCol(r, 'UserPrincipalName', 'UPN', 'User')
  ]);
  downloadCSV('nearing-eos-devices.csv', headers, rows);
}

/* ---- EXPORT: CHART CSV ---- */
function exportChartCSV(chartKey) {
  let headers, rows;

  switch (chartKey) {
    case 'complianceState': {
      headers = ['Device Name', 'Business Group', 'Ring', 'Status', 'Alert Count', 'OS Build'];
      rows = patchData.map(r => [
        findCol(r, 'DeviceName', 'Device'),
        findCol(r, 'BusinessGroupName', 'BusinessGroup', 'Group'),
        findCol(r, 'DeploymentGroupName', 'Ring', 'DeploymentGroup'),
        findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus'),
        findCol(r, 'AlertCount', 'Alerts'),
        findCol(r, 'OSBuild', 'Build')
      ]);
      downloadCSV('compliance-state.csv', headers, rows);
      break;
    }
    case 'alertsByRing': {
      const data = {};
      patchData.forEach(r => {
        const ring = findCol(r, 'DeploymentGroupName', 'Ring', 'DeploymentGroup') || 'Unknown';
        const a = parseInt(findCol(r, 'AlertCount', 'Alerts') || '0');
        if (a > 0) data[ring] = (data[ring] || 0) + 1;
      });
      headers = ['Ring', 'Alerted Devices'];
      rows = Object.entries(data).map(([k, v]) => [k, v]);
      downloadCSV('alerts-by-ring.csv', headers, rows);
      break;
    }
    case 'alertsByGroup': {
      const data = {};
      patchData.forEach(r => {
        const g = findCol(r, 'BusinessGroupName', 'BusinessGroup', 'Group') || 'Unknown';
        const a = parseInt(findCol(r, 'AlertCount', 'Alerts') || '0');
        if (a > 0) data[g] = (data[g] || 0) + 1;
      });
      headers = ['Business Group', 'Alerted Devices'];
      rows = Object.entries(data).map(([k, v]) => [k, v]);
      downloadCSV('alerts-by-group.csv', headers, rows);
      break;
    }
    case 'patchExceptions': {
      const exceptions = patchData.filter(r => findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus') === 'Not Up To Date');
      headers = ['Device Name', 'Business Group', 'Ring', 'Status', 'Alert Count', 'OS Build'];
      rows = exceptions.map(r => [
        findCol(r, 'DeviceName', 'Device'),
        findCol(r, 'BusinessGroupName', 'BusinessGroup', 'Group'),
        findCol(r, 'DeploymentGroupName', 'Ring', 'DeploymentGroup'),
        'Not Up To Date',
        findCol(r, 'AlertCount', 'Alerts'),
        findCol(r, 'OSBuild', 'Build')
      ]);
      downloadCSV('patch-exceptions.csv', headers, rows);
      break;
    }
    case 'versionCompliance': {
      const data = {};
      windowsData.forEach(r => {
        const label = (r._osName || 'Unknown') + ' ' + (r._version || '');
        if (!data[label]) data[label] = { count: 0, status: r._lifecycleStatus, endDate: r._endDate };
        data[label].count++;
      });
      headers = ['OS Version', 'Device Count', 'Support Status', 'End of Support'];
      rows = Object.entries(data).map(([k, v]) => [k, v.count, v.status, v.endDate || '']);
      downloadCSV('version-compliance.csv', headers, rows);
      break;
    }
    case 'lifecyclePosture': {
      headers = ['Device Name', 'OS', 'Version', 'Build', 'Lifecycle Status', 'End of Support', 'Days Remaining'];
      rows = windowsData.map(r => [
        findCol(r, 'DeviceName', 'Device'),
        r._osName || '',
        r._version || '',
        findCol(r, 'OSBuild', 'Build'),
        r._lifecycleStatus,
        r._endDate || '',
        r._daysRemaining !== null ? r._daysRemaining : ''
      ]);
      downloadCSV('lifecycle-posture.csv', headers, rows);
      break;
    }
    case 'windowsExceptions': {
      const data = windowsData.filter(r => r._risk === 'red' || r._risk === 'amber');
      headers = ['Device Name', 'OS Version', 'Build', 'Support Status', 'End of Support', 'Risk'];
      rows = data.map(r => [
        findCol(r, 'DeviceName', 'Device'),
        (r._osName || '') + ' ' + (r._version || ''),
        findCol(r, 'OSBuild', 'Build'),
        r._lifecycleStatus,
        r._endDate || '',
        r._risk === 'red' ? 'High' : 'Medium'
      ]);
      downloadCSV('windows-exceptions.csv', headers, rows);
      break;
    }
    case 'staleDevices': {
      const staleThreshold = 30 * 86400000;
      const nowTs = Date.now();
      function isStaleExport(row) {
        const ls = findCol(row, 'LastSyncDateTime', 'LastCheckIn', 'Last check-in', 'Last contact', 'LastContact', 'LastSyncSuccessUtc');
        const d = parseIntuneDate(ls);
        return d && (nowTs - d.getTime()) > staleThreshold;
      }
      const stalePatch = patchData.filter(isStaleExport);
      const staleWin = windowsData.filter(isStaleExport);
      headers = ['Source', 'Device Name', 'Status', 'Last Check-in', 'Days Since Check-in', 'OS Build', 'User'];
      rows = [];
      stalePatch.forEach(r => {
        const ls = findCol(r, 'LastSyncDateTime', 'LastCheckIn', 'Last check-in', 'Last contact');
        const d = parseIntuneDate(ls);
        const daysSince = d ? Math.floor((nowTs - d.getTime()) / 86400000) : '';
        rows.push(['Patch', findCol(r, 'DeviceName', 'Device name', 'Device'), findCol(r, 'QUStatusLevel1Name', 'Status'), formatDateUK(ls), daysSince, findCol(r, 'OSBuild', 'Build'), findCol(r, 'UserPrincipalName', 'UPN', 'User')]);
      });
      staleWin.forEach(r => {
        const ls = findCol(r, 'LastSyncDateTime', 'LastCheckIn', 'Last check-in', 'Last contact', 'LastContact');
        const d = parseIntuneDate(ls);
        const daysSince = d ? Math.floor((nowTs - d.getTime()) / 86400000) : '';
        rows.push(['Inventory', r._deviceName || findCol(r, 'DeviceName', 'Device name'), r._lifecycleStatus || '', formatDateUK(ls), daysSince, r._buildDisplay || '', findCol(r, 'UserPrincipalName', 'UPN', 'User principal name')]);
      });
      downloadCSV('stale-devices-30days.csv', headers, rows);
      break;
    }
    case 'isoEvidence': {
      const pTotal = patchData.length;
      const pUp = patchData.filter(r => findCol(r, 'QUStatusLevel1Name') === 'Up To Date').length;
      const wTotal = windowsData.length;
      const wUns = windowsData.filter(r => r._lifecycleStatus === 'Out of support').length;
      const wUnk = windowsData.filter(r => r._lifecycleStatus === 'Unknown').length;
      const wSupportedPct = wTotal > 0 ? (((wTotal - wUns - wUnk) / wTotal) * 100).toFixed(1) : '0';
      headers = ['ISO Control', 'Evidence', 'Value'];
      rows = [
        ['A.8.8', 'Patch management enforced', pTotal > 0 ? 'Yes' : 'No data'],
        ['A.8.8', 'Non-compliant devices', (pTotal - pUp).toString()],
        ['A.12.6', 'Supported OS %', wTotal > 0 ? wSupportedPct + '%' : 'No data'],
        ['A.12.6', 'Unsupported OS devices', wUns.toString()],
        ['A.8.1', 'Asset inventory coverage', wTotal.toLocaleString() + ' devices'],
        ['—', 'Lifecycle data source', 'Microsoft Learn'],
        ['—', 'Last lifecycle refresh', LIFECYCLE_DATA.lastUpdated]
      ];
      downloadCSV('iso27001-evidence.csv', headers, rows);
      break;
    }
    case 'eosAlertDevices': {
      const data = windowsData.filter(r => r._risk === 'red' || r._risk === 'amber');
      headers = ['Device Name', 'OS', 'Version', 'Build', 'Support Status', 'End of Support', 'Days Remaining', 'User'];
      rows = data.map(r => [
        findCol(r, 'DeviceName', 'Device'),
        r._osName || '',
        r._version || '',
        findCol(r, 'OSBuild', 'Build'),
        r._lifecycleStatus,
        r._endDate || '',
        r._daysRemaining !== null ? r._daysRemaining : '',
        findCol(r, 'UserPrincipalName', 'UPN', 'User')
      ]);
      downloadCSV('eos-alert-devices.csv', headers, rows);
      break;
    }
    case 'win11Lifecycle': {
      headers = ['Version', 'Edition', 'Availability', 'End of Support'];
      rows = [];
      LIFECYCLE_DATA.windows11.concat(LIFECYCLE_DATA.windows11LTSC).forEach(ver => {
        ver.editions.forEach(ed => {
          rows.push([ver.version, ed.edition, ver.availability || '', ed.endOfSupport]);
        });
      });
      downloadCSV('windows11-lifecycle.csv', headers, rows);
      break;
    }
    case 'win10Lifecycle': {
      headers = ['Version', 'Edition', 'End of Support'];
      rows = [];
      LIFECYCLE_DATA.windows10.forEach(ver => {
        ver.editions.forEach(ed => {
          rows.push([ver.version, ed.edition, ed.endOfSupport]);
        });
      });
      downloadCSV('windows10-lifecycle.csv', headers, rows);
      break;
    }
    default:
      alert('Export not available for this view.');
  }
}

/* ---- EXPORT: KPI CSV ---- */
function exportKpiCSV(tab, key) {
  let headers, rows;

  if (tab === 'patch') {
    headers = ['Device Name', 'Business Group', 'Ring', 'Status', 'Alert Count', 'OS Build', 'User'];
    let filtered;
    switch (key) {
      case 'totalDevices': filtered = patchData; break;
      case 'patchCompliance':
      case 'upToDate':
        filtered = patchData.filter(r => findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus') === 'Up To Date');
        break;
      case 'notUpToDate':
        filtered = patchData.filter(r => findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus') === 'Not Up To Date');
        break;
      case 'alerted':
        filtered = patchData.filter(r => parseInt(findCol(r, 'AlertCount', 'Alerts') || '0') > 0);
        break;
      case 'patchHighRisk':
        filtered = patchData.filter(r => {
          const s = findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus');
          const a = parseInt(findCol(r, 'AlertCount', 'Alerts') || '0');
          return s === 'Not Up To Date' || a >= 3;
        });
        break;
      default: filtered = patchData;
    }
    rows = filtered.map(r => [
      findCol(r, 'DeviceName', 'Device'),
      findCol(r, 'BusinessGroupName', 'BusinessGroup', 'Group'),
      findCol(r, 'DeploymentGroupName', 'Ring', 'DeploymentGroup'),
      findCol(r, 'QUStatusLevel1Name', 'Status', 'UpdateStatus'),
      findCol(r, 'AlertCount', 'Alerts'),
      findCol(r, 'OSBuild', 'Build'),
      findCol(r, 'UserPrincipalName', 'UPN', 'User')
    ]);
    downloadCSV(`patch-${key}.csv`, headers, rows);
  } else if (tab === 'windows') {
    headers = ['Device Name', 'OS', 'Version', 'OS Build', 'Support Status', 'End of Support', 'Compliance', 'User'];
    let filtered;
    switch (key) {
      case 'winTotal': filtered = windowsData; break;
      case 'winSupported':
        // Supported OS export includes Supported + Nearing EOS + ESU Enrolled
        filtered = windowsData.filter(r => r._lifecycleStatus === 'Supported' || r._lifecycleStatus === 'Nearing end of support' || r._lifecycleStatus === 'ESU (Enrolled)');
        break;
      case 'winESU':
        filtered = windowsData.filter(r => r._lifecycleStatus === 'ESU (Enrolled)');
        break;
      case 'winCurrent':
        filtered = windowsData.filter(r => r._lifecycleStatus === 'Supported');
        break;
      case 'winStale':
        filtered = windowsData.filter(r => r._isStale);
        break;
      case 'winNearing':
        filtered = windowsData.filter(r => r._lifecycleStatus === 'Nearing end of support' || (r._lifecycleStatus === 'ESU (Enrolled)' && r._risk === 'amber'));
        break;
      case 'winUnsupported':
        filtered = windowsData.filter(r => r._lifecycleStatus === 'Out of support');
        break;
      case 'winUnknown':
        filtered = windowsData.filter(r => r._lifecycleStatus === 'Unknown');
        break;
      default: filtered = windowsData;
    }
    rows = filtered.map(r => [
      findCol(r, 'DeviceName', 'Device'),
      r._osName || '',
      r._version || '',
      findCol(r, 'OSBuild', 'Build'),
      r._lifecycleStatus,
      r._endDate || '',
      findCol(r, 'ComplianceState', 'Compliance'),
      findCol(r, 'UserPrincipalName', 'UPN', 'User')
    ]);
    downloadCSV(`windows-${key}.csv`, headers, rows);
  }
}

/* ---- CSV DOWNLOAD HELPER ---- */
function downloadCSV(filename, headers, rows) {
  const escape = v => {
    const s = String(v == null ? '' : v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---- CHART HELPER ---- */
function renderChart(canvasId, type, data, extraOpts) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const isDark = document.body.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#9ca3af' : '#5f6774';

  const defaultPlugins = {
    legend: { labels: { color: textColor, font: { family: "'Inter', sans-serif", size: 12 } } }
  };
  const extraPlugins = (extraOpts && extraOpts.plugins) || {};
  const mergedPlugins = { ...defaultPlugins, ...extraPlugins };
  // Merge legend labels colour into any overridden legend
  if (mergedPlugins.legend && mergedPlugins.legend.labels) {
    mergedPlugins.legend.labels.color = mergedPlugins.legend.labels.color || textColor;
    mergedPlugins.legend.labels.font = mergedPlugins.legend.labels.font || { family: "'Inter', sans-serif", size: 12 };
  }

  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: mergedPlugins,
    ...(extraOpts || {})
  };
  opts.plugins = mergedPlugins; // Ensure plugins aren't overwritten by spread

  if (type === 'bar') {
    opts.scales = {
      x: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor } },
      y: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor } },
      ...(extraOpts || {}).scales
    };
    if (extraOpts && extraOpts.indexAxis === 'y') {
      opts.indexAxis = 'y';
    }
  }

  chartInstances[canvasId] = new Chart(ctx, { type, data, options: opts });
}

/* ---- COLOUR HELPER ---- */
function getColor(name) {
  const isDark = document.body.classList.contains('dark');
  const map = {
    green: '#16a34a',
    amber: '#d97706',
    red: '#dc2626',
    accent: isDark ? '#3b82f6' : '#2563eb'
  };
  return map[name] || name;
}

/* ---- REGION MAPPER ---- */
function mapToRegion(str) {
  const s = str.toLowerCase();
  if (/emea|europe|africa|middle\s*east|uk|germany|france|spain|italy/i.test(s)) return 'EMEA';
  if (/apac|asia|pacific|japan|australia|india|china|korea/i.test(s)) return 'APAC';
  if (/latam|latin|brazil|mexico|south\s*america/i.test(s)) return 'LATAM';
  if (/amer|us|usa|united\s*states|canada|north\s*america/i.test(s)) return 'AMER';
  return str || 'Unknown';
}

/* ---- AUTO-REFRESH ---- */
function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    // Re-evaluate lifecycle status against current dates
    if (windowsData.length || patchData.length) {
      renderAll();
      updateRefreshBadge();
    }
  }, AUTO_REFRESH_MS);
  updateRefreshBadge();
}

function updateRefreshBadge() {
  const badge = document.getElementById('refreshText');
  badge.textContent = 'Refreshed: ' + formatDateUK(new Date()) + ' · Next: 24h';
}

/* ---- EOS ALERTS CHECK ---- */
function checkEOSAlerts() {
  if (!windowsData.length) return;
  const nearing = windowsData.filter(r => r._lifecycleStatus === 'Nearing end of support');
  const unsupported = windowsData.filter(r => r._lifecycleStatus === 'Out of support');

  const banner = document.getElementById('alertBanner');
  const bannerText = document.getElementById('alertBannerText');

  if (unsupported.length > 0) {
    banner.style.display = 'flex';
    banner.className = 'alert-banner critical';
    bannerText.textContent = `${unsupported.length.toLocaleString()} device${unsupported.length !== 1 ? 's are' : ' is'} running an unsupported OS. ${nearing.length > 0 ? nearing.length.toLocaleString() + ' more nearing end of support within 12 months.' : ''}`;
  } else if (nearing.length > 0) {
    banner.style.display = 'flex';
    banner.className = 'alert-banner';
    bannerText.textContent = `${nearing.length.toLocaleString()} device${nearing.length !== 1 ? 's are' : ' is'} nearing end of support within the next 12 months. Plan migration now.`;
  } else {
    banner.style.display = 'none';
  }
}

/* ---- EVENT BINDING (no inline handlers — SharePoint compatible) ---- */
document.addEventListener('DOMContentLoaded', function() {
  // Lifecycle tables on load
  renderLifecycleTables();
  renderUnsupportedCards();

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Navigation tabs
  document.querySelectorAll('.nav-btn[data-tab]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      switchTab(this.getAttribute('data-tab'));
    });
  });

  // File uploads
  document.getElementById('patchFile').addEventListener('change', function() {
    handlePatchUpload(this);
  });
  document.getElementById('windowsFile').addEventListener('change', function() {
    handleWindowsUpload(this);
  });

  // Analyse button
  document.getElementById('analyseBtn').addEventListener('click', analyseData);

  // Alert dismiss
  document.getElementById('alertDismiss').addEventListener('click', function() {
    document.getElementById('alertBanner').style.display = 'none';
  });

  // Export CSV buttons (delegated)
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-export]');
    if (!btn) return;
    var key = btn.getAttribute('data-export');
    if (key === 'unsupportedOS') { exportUnsupportedOS(); return; }
    if (key === 'nearingEOS') { exportNearingEOS(); return; }
    exportChartCSV(key);
  });

  // KPI export buttons (dynamically created — delegated)
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-kpi-export]');
    if (!btn) return;
    var tab = btn.getAttribute('data-kpi-tab');
    var key = btn.getAttribute('data-kpi-export');
    exportKpiCSV(tab, key);
  });
});
