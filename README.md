# Intune Patching & OS Compliance Dashboard

**Version:** 1.0  
**Author:** Darren Reevell  
**Classification:** Confidential — For internal use only

---

## Overview

A browser-based patching and OS compliance dashboard that ingests CSV exports from Microsoft Intune and presents executive governance, patch compliance, Windows OS lifecycle posture, and audit-ready evidence views. All data is processed locally in the browser — no data leaves the device.

## Features

| Tab | Description |
|-----|-------------|
| **Executive Summary** | Leadership headline with patch and lifecycle posture. Priority actions, risk by OS version chart, ISO 27001 evidence checklist (A.8.1, A.8.8, A.12.6), and end-of-support alerts. |
| **Patch Compliance** | KPIs for total devices, compliance percentage, up-to-date and non-compliant counts, alerted devices, and high-risk devices. Charts for compliance state, alerts by ring, and non-compliant devices by deployment ring. Patch exception device table. |
| **Windows Versions** | KPIs for supported OS percentage, nearing end-of-support, unsupported OS, and current/supported counts. Version compliance bar chart, lifecycle posture doughnut, and device review table with risk ratings. |
| **OS Lifecycle** | Windows 11 and Windows 10 lifecycle reference tables sourced from Microsoft Learn. Unsupported OS and nearing-end-of-support device counts with CSV export. |

### Additional Capabilities

- **CSV Export** on every KPI card, chart, and table
- **Light and dark mode** with toggle (light mode default)
- **Auto-refresh** every 24 hours to re-evaluate lifecycle status
- **End-of-support alerts** banner when devices are running unsupported OS versions
- **Microsoft lifecycle integration** using verified end-of-support dates from Microsoft Learn

## Data Sources

The dashboard accepts two CSV files exported from Microsoft Intune:

### 1. Quality Update Status Export (Patch tab)

Export from **Intune > Reports > Windows Updates > Quality Update Status**.

Expected columns (flexible matching):
- `DeviceName` / `Device name`
- `QUStatusLevel1Name` — values: `Up To Date`, `Not Up To Date`
- `AlertCount`
- `DeploymentGroupName` / `Ring`
- `BusinessGroupName`
- `OSBuild`
- `UserPrincipalName`

### 2. Devices with Inventory Export (Windows tab)

Export from **Intune > Reports > Device compliance > DevicesWithInventory**.

Expected columns (flexible matching):
- `DeviceName` / `Device name`
- `OSVersion` / `OS version` — format: `10.0.XXXXX.YYYY`
- `OS` — typically `Windows`
- `UserPrincipalName` / `User principal name`
- `LastContact` / `Last check-in`
- `SerialNumber` / `Serial number`
- `Manufacturer`, `Model`

The dashboard maps OS build numbers to Windows release versions automatically:

| Build | Version |
|-------|---------|
| 28000 | Windows 11 26H1 |
| 26200 | Windows 11 25H2 |
| 26100 | Windows 11 24H2 |
| 22631 | Windows 11 23H2 |
| 22621 | Windows 11 22H2 |
| 22000 | Windows 11 21H2 |
| 19045 | Windows 10 22H2 |
| 17763 | Windows 10 1809 |
| 14393 | Windows 10 1607 |

## Windows Lifecycle Dates

Verified against [Microsoft Learn — Windows 11 Release Information](https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information) on 7 April 2026.

| Version | Home / Pro EOS | Enterprise / Education EOS |
|---------|---------------|---------------------------|
| Windows 11 26H1 | 14 March 2028 | 13 March 2029 |
| Windows 11 25H2 | 12 October 2027 | 10 October 2028 |
| Windows 11 24H2 | 13 October 2026 | 12 October 2027 |
| Windows 11 23H2 | 11 November 2025 | 10 November 2026 |
| Windows 10 22H2 | 14 October 2025 | 14 October 2025 |

## How to Use

1. Open the dashboard in a modern browser (Edge, Chrome, Firefox).
2. Click **Patch Export** in the sidebar and select the Quality Update Status CSV.
3. Click **Windows Inventory** and select the DevicesWithInventory CSV.
4. Click **Analyse Uploaded Files**.
5. Navigate between tabs using the sidebar.
6. Use **Export CSV** buttons to download filtered device lists.
7. Toggle dark mode using the button in the top-right corner.

## File Structure

```
intune-dashboard/
├── index.html        Main dashboard page
├── styles.css        Stylesheet
├── dashboard.js      Core logic, CSV parsing, rendering
├── lifecycle.js      Windows lifecycle reference data and mapping
└── README.md         This file
```

## Updating Lifecycle Data

When Microsoft releases a new Windows version or an existing version reaches end of support, update the `LIFECYCLE_DATA` object in `lifecycle.js`:

1. Add the new version to the `windows11` or `windows10` array with edition-specific end-of-support dates.
2. Add the build number mapping to the `buildMap` object.
3. Update the `lastUpdated` field to the current date.

Source: [Microsoft Learn — Windows Release Health](https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information)

## Browser Compatibility

Tested on:
- Microsoft Edge (Chromium)
- Google Chrome
- Mozilla Firefox

Requires JavaScript enabled. No server required — runs entirely client-side.

## Security and Privacy

- All CSV data is processed locally in the browser.
- No data is transmitted to any external service.
- No cookies or local storage are used.
- The dashboard is suitable for environments handling sensitive device inventory data.

---

**Confidential — For internal use only**
