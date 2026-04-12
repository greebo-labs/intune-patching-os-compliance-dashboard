# Intune Patching & OS Compliance Dashboard

**Version:** 1.1  
**Author:** Darren Reevell  
**Classification:**  — Public release (use at own risk)  
**Live Dashboard:** https://greebo-labs.github.io/intune-patching-os-compliance-dashboard/

---

## Overview

A browser-based compliance dashboard that ingests two CSV exports from Microsoft Intune and produces executive governance, patch compliance, Windows OS lifecycle posture, and audit-ready evidence views.

All data is processed **locally in your browser** — no data is sent to any external service.

---

## Quick Start

1. Go to the [live dashboard](https://greebo-labs.github.io/intune-patching-os-compliance-dashboard/)
2. Export the two CSV files from Intune (see steps below)
3. Upload the files using the sidebar controls
4. Click **Analyse Uploaded Files**

---

## Step 1 — Export the Patch Status File from Intune

This file contains patch compliance data for all devices.

1. Sign in to the [Microsoft Intune admin centre](https://intune.microsoft.com)
2. Go to **Reports** → **Windows updates** → **Reports** tab
3. Click **Quality update status**
4. Click **Generate report** (or open an existing report)
5. Once generated, click **Export** → **Export to CSV**
6. Save the file — name it something like `Patch_Status_07April2026.csv`

**What this file contains:** Device name, deployment ring, patch status (Up To Date / Not Up To Date), alert count, OS build, Extended Security update enrolment, hotpatch readiness.

---

## Step 2 — Export the Device Inventory File from Intune

This file contains device inventory data including OS version and last check-in date.

1. In the [Intune admin centre](https://intune.microsoft.com), go to **Devices** → **All devices**
2. Click **Export** at the top of the device list
3. Select **Export (CSV)** — this downloads all device inventory data
4. Save the file — name it something like `Inventory_07April2026.csv`

Alternatively, for a more detailed inventory export:

1. Go to **Reports** → **Device compliance** → **Reports** tab
2. Click **Device compliance** or **Devices with inventory**
3. Generate and export as CSV

**What this file contains:** Device name, Azure AD Device ID, OS version (in `10.0.XXXXX.YYYY` format), last contact date, serial number, manufacturer, model, compliance state.

---

## Step 3 — Open the Dashboard

**Option A — Live (recommended):** Open [greebo-labs.github.io/intune-patching-os-compliance-dashboard](https://greebo-labs.github.io/intune-patching-os-compliance-dashboard/) in Microsoft Edge or Google Chrome.

**Option B — Local:** Download the repository as a ZIP, extract it, and open `index.html` in Edge or Chrome.

---

## Step 4 — Upload and Analyse

1. In the left-hand sidebar, click **Patch Export** and select your patch status CSV
2. Click **Windows Inventory** and select your device inventory CSV
3. Click the blue **Analyse Uploaded Files** button
4. Wait a few seconds — the dashboard populates all tabs automatically

> **Note:** The inventory file can be large (20–30 MB). It may take 5–10 seconds to process. Do not close the tab during this time.

---

## Step 5 — Navigate the Dashboard

| Tab | What it shows |
|-----|--------------|
| **Executive Summary** | Leadership headline, priority actions, stale device connectivity report, adjusted patch compliance (excl. stale devices), ISO 27001 evidence, end-of-support alerts |
| **Patch Compliance** | Total devices, compliance %, Up to Date / Not Up to Date counts, alerted devices, high-risk devices, alerts by ring, non-compliant devices by ring, patch exception table |
| **Windows Versions** | Supported OS %, ESU enrolled count, nearing end-of-support count, unsupported OS count, stale devices, version compliance chart, lifecycle posture chart, device review table |
| **OS Lifecycle** | Windows 11 and Windows 10 lifecycle reference tables (Enterprise/Education dates), ESU coverage dates, unsupported OS device count with CSV export |

---

## Step 6 — Export Data

Every KPI card, chart, and table has an **Export CSV** button. Click it to download the underlying device data as a CSV file that can be opened in Excel.

Key exports:
- **Patch Compliance** → exports all devices by status
- **Unsupported OS Devices** → full device list with end-of-support dates
- **Nearing End of Support** → devices within 12 months of EOS
- **Stale Devices** → devices not checked in for 30+ days
- **Export ISO CSV** → ISO 27001 evidence summary

---

## Understanding the Data

### Lifecycle Dates

The dashboard uses **Enterprise/Education** edition lifecycle dates for all Windows versions, appropriate for a managed corporate estate:

| Version | Enterprise/Education EOS | Status (April 2026) |
|---------|--------------------------|---------------------|
| Windows 11 26H1 | 13 March 2029 | Supported |
| Windows 11 25H2 | 10 October 2028 | Supported |
| Windows 11 24H2 | **12 October 2027** | Supported |
| Windows 11 23H2 | 10 November 2026 | Nearing EOS |
| Windows 10 22H2 | 14 October 2025 | ESU Year 1 (until Oct 2026) |

### ESU (Extended Security Updates)

Devices running Windows 10 22H2 that are enrolled in the ESU programme are shown as **ESU (Enrolled)** with a green badge and counted as in-support. The ESU enrolment status is read from the `ExtendedSecurity` column in the patch export (value: `Enrolled`).

### Stale Devices

Any device with no Intune check-in for **30 or more days** is flagged as stale. Stale devices are highlighted in red in the Windows Device Review table. Patch compliance figures are shown both including and excluding stale devices, since stale data may not reflect the current device state.

### Supported OS Percentage

Counts all devices that are NOT "Out of support" — i.e. Supported + Nearing EOS + ESU Enrolled are all included. Only genuinely out-of-support and unknown devices are excluded.

---

## Updating the Dashboard

When you have new Intune exports:
1. Open the dashboard
2. Click **Patch Export** and select the new patch CSV
3. Click **Windows Inventory** and select the new inventory CSV
4. Click **Analyse Uploaded Files**

The previous data is replaced automatically.

---

## Keeping Lifecycle Data Current

Microsoft publishes lifecycle dates at [Microsoft Learn — Windows Release Health](https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information).

When Microsoft releases a new Windows version or an existing version goes out of support, update `lifecycle.js`:

1. Open `lifecycle.js` in the repository
2. Add the new version to the `windows11` or `windows10` array with correct edition end dates
3. Add the build number to the `buildMap` object (e.g. `'26100': { os: 'Windows 11', version: '24H2' }`)
4. Update the `lastUpdated` field

---

## Browser Compatibility

| Browser | Status |
|---------|--------|
| Microsoft Edge (Chromium) | ✅ Recommended |
| Google Chrome | ✅ Supported |
| Mozilla Firefox | ✅ Supported |
| Safari | ✅ Supported |
| Internet Explorer | ❌ Not supported |

---

## Security & Privacy

- All CSV data is processed locally in the browser
- No data is transmitted to any external service
- No cookies, local storage, or tracking of any kind
- The Content Security Policy blocks all outbound network requests except for the Chart.js library (loaded from jsDelivr CDN with integrity verification)

---

## File Structure

```
intune-patching-os-compliance-dashboard/
├── index.html        Main dashboard page (no inline event handlers)
├── styles.css        Stylesheet — light/dark mode
├── dashboard.js      Core logic, CSV parsing, rendering, exports
├── lifecycle.js      Windows lifecycle reference data and build mapping
└── README.md         This file
```

---

## Troubleshooting

**Nothing happens when I click buttons**  
Make sure you're opening the file in Edge or Chrome, not Internet Explorer. If using the local version, try pressing **Ctrl + Shift + R** to hard-reload.

**The inventory file takes a long time to load**  
The DevicesWithInventory export can be 20–30 MB. This is normal. Leave the tab open and wait up to 30 seconds.

**Charts or tables are blank after clicking Analyse**  
Check that you've selected the correct files — the patch CSV should be the Quality Update Status export, and the inventory CSV should be the DevicesWithInventory export. Swapping them will produce blank results.

**Supported OS % looks wrong**  
The dashboard classifies all devices whose OS build cannot be mapped to a known Windows version as "Out of support". This can happen with very old, pre-release, or non-standard builds. Export the "Unknown" KPI to see which devices are affected.

**Windows 11 24H2 shows as "Nearing end of support"**  
This means you're running an older version of the dashboard. Download the latest files from this repository — the v1.1 build uses Enterprise/Education dates, so 24H2 correctly shows as Supported until 12 October 2027.

---

*For questions or issues, contact Darren Reevell.*
