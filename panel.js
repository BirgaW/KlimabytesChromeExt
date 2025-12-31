"use strict";

import { co2 } from "./vendor/co2/index.js";
import { averageIntensity } from "./vendor/co2/index.js";

const co2Lib = new co2({ model: "swd", version: 4 });

const startBtn = document.getElementById("startTracking");
const stopBtn = document.getElementById("stopTracking");
const reqCountEl = document.getElementById("reqCount");
const totalBytesEl = document.getElementById("totalBytes");
const co2ValEl = document.getElementById("co2Val");
const unaccountedCountEl = document.getElementById("unaccountedCount");
const accountedTableBody = document.getElementById("accountedTableBody");
const unaccountedTableBody = document.getElementById("unaccountedTableBody");

let aggregatedTotalBytes = 0;
let aggregatedTotalCo2 = 0;

const pendingRequests = new Map();
const accountedRowsMap = new Map();
const unaccountedRowsMap = new Map();

let domainCheckInterval;

function extractDomain(url) {
  const a = document.createElement("a");
  a.href = url;
  const hostname = a.hostname;
  const parts = hostname.split('.');

  if (parts.length > 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}


function calculateHeadersSize(headers) {
  if (!headers) return 0;
  return Object.entries(headers).reduce((size, [key, value]) => size + key.length + value.length + 4, 2);
}



function handleRequestStart(params, tabId) {
  const { requestId, request, timestamp } = params;

  if (!request.url || !request.url.startsWith("http")) {
    return;
  }

  const key = `${tabId}-${requestId}`;
  const visitedDomain = extractDomain(params.documentURL);

  pendingRequests.set(key, {
    url: request.url,
    startTime: timestamp,
    size: 0,
    visitedDomain
  });
}

function handleRequestServedFromCache(params, tabId) {
  const { requestId } = params;
  const key = `${tabId}-${requestId}`;
  const req = pendingRequests.get(key);
  if (req) req.servedFromCache = true;
}

async function handleResponseReceived(params, tabId) {
  const { requestId, response } = params;
  const key = `${tabId}-${requestId}`;
  const req = pendingRequests.get(key);
  if (!req) return;
  req.headers = response.headers;
  req.mimeType = response.mimeType;
  req.protocol = response.protocol;
  req.status = response.status;
}

const greenCache = new Map();
const GREEN_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchHostingProviderCached(url) {
  const host = extractDomain(url);
  const now = Date.now();

  const cached = greenCache.get(host);
  if (cached && cached.expires > now) return cached.value;

  try {
    const res = await fetch(`https://api.thegreenwebfoundation.org/api/v3/greencheck/${host}`);
    const data = await res.json();
    const value = !!data.green;

    greenCache.set(host, { value, expires: now + GREEN_TTL_MS });
    return value;
  } catch (e) {
    greenCache.set(host, { value: false, expires: now + 5 * 60 * 1000 });
    return false;
  }
}
async function handleLoadingFinished(params, tabId) {
  const { requestId, encodedDataLength } = params;
  const key = `${tabId}-${requestId}`;
  const req = pendingRequests.get(key);
  if (!req) return;

  try {
    const headersSize = calculateHeadersSize(req.headers);
    const totalSize = (encodedDataLength || 0) + headersSize;

    const domain = extractDomain(req.url);
    const filetype = req.mimeType?.split("/")?.[1] || "other";

    if (totalSize > 0) {
      const isGreen = await fetchHostingProviderCached(req.url);

      const trace = co2Lib.perByteTrace(totalSize, isGreen, {
        gridIntensity: { device: intensitySelect }
      });

      const co2Emissions = trace.co2;

      addAccounted({
        visitedDomain: req.visitedDomain,
        hostdomain: domain,
        datavolume: totalSize,
        co2: co2Emissions,
        filetype
      });

      aggregatedTotalBytes += totalSize;
      aggregatedTotalCo2 += co2Emissions;
    } else {
      addUnaccounted({
        visitedDomain: req.visitedDomain,
        hostdomain: domain,
        filetype
      });
    }

    updateRealTimeStats();
    updateAccountedDetailsTab();
    updateUnaccountedDetailsTab();
  } catch (error) {
    console.error(`Failed to process request ${req.url}:`, error);

    addUnaccounted({
      visitedDomain: req.visitedDomain,
      hostdomain: extractDomain(req.url),
      filetype: req.mimeType?.split("/")?.[1] || "other"
    });

    updateUnaccountedDetailsTab();
  } finally {
    pendingRequests.delete(key);
  }
}

function handleLoadingFailed(params, tabId) {
  const { requestId, errorText } = params;
  const key = `${tabId}-${requestId}`;
  const req = pendingRequests.get(key);
  if (req) {
    console.warn(`Request failed for ${req.url}: ${errorText}`);
    addUnaccounted({
      visitedDomain: req.visitedDomain,
      hostdomain: extractDomain(req.url),
      filetype: req.mimeType?.split("/")?.[1] || "other"
    });

    updateUnaccountedDetailsTab();
    pendingRequests.delete(key);
  }
}



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "NETWORK_EVENT") {
    const { eventType, params, tabId } = message;
    const allowedMethods = new Set([
      "Network.requestWillBeSent",
      "Network.responseReceived",
      "Network.requestServedFromCache",
      "Network.loadingFinished",
      "Network.loadingFailed"
    ]);

    if (!allowedMethods.has(eventType)) {
      console.warn(`Received unexpected network event: ${eventType}`);
      return;
    }

    switch (eventType) {
      case "Network.requestWillBeSent":
        handleRequestStart(params, tabId);
        break;
      case "Network.responseReceived":
        handleResponseReceived(params, tabId);
        break;
      case "Network.requestServedFromCache":
        handleRequestServedFromCache(params, tabId);
        break;
      case "Network.loadingFinished":
        handleLoadingFinished(params, tabId);
        break;
      case "Network.loadingFailed":
        handleLoadingFailed(params, tabId);
        break;
      default:
        console.warn("Unhandled event type:", eventType);
    }
  }
});

function updateRealTimeStats() {
  reqCountEl.textContent = accountedRequestCount.toString();
  totalBytesEl.textContent = `${(aggregatedTotalBytes / 1024).toFixed(2)} KB`;
  co2ValEl.textContent = `${aggregatedTotalCo2.toFixed(2)} g`;
  unaccountedCountEl.textContent = unaccountedRequestCount.toString();
}

function updateAccountedDetailsTab() {
  accountedAgg.forEach((data, key) => {
    if (accountedRowsMap.has(key)) {
      const row = accountedRowsMap.get(key);
      row.children[3].textContent = `${(data.datavolume / 1024).toFixed(2)} KB`;
      row.children[4].textContent = `${data.co2.toFixed(7)} g`;
    } else {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${data.visitedDomain}</td>
        <td>${data.hostdomain}</td>
        <td>${data.filetype}</td>
        <td>${(data.datavolume / 1024).toFixed(2)} KB</td>
        <td>${data.co2.toFixed(7)} g</td>
      `;
      accountedTableBody.appendChild(row);
      accountedRowsMap.set(key, row);
    }
  });

  populateAccountedFilters();
}


function updateUnaccountedDetailsTab() {
  unaccountedAgg.forEach((data, key) => {
    if (!unaccountedRowsMap.has(key)) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${data.visitedDomain}</td>
        <td>${data.hostdomain}</td>
        <td>${data.filetype}</td>
        <td>N/A</td>
        <td>Unaccounted</td>
      `;
      unaccountedTableBody.appendChild(row);
      unaccountedRowsMap.set(key, row);
    }
  });

  populateUnaccountedFilters();
}

function populateAccountedFilters() {
  const values = [...accountedAgg.values()];
  const domains = [...new Set(values.map((r) => r.visitedDomain))].sort();
  const fileTypes = [...new Set(values.map((r) => r.filetype))].sort();

  populateFilterDropdowns("accountedDomainFilter", domains);
  populateFilterDropdowns("accountedTypeFilter", fileTypes);
}

function populateUnaccountedFilters() {
  const values = [...unaccountedAgg.values()];
  const domains = [...new Set(values.map((r) => r.visitedDomain))].sort();
  const fileTypes = [...new Set(values.map((r) => r.filetype))].sort();

  populateFilterDropdowns("unaccountedDomainFilter", domains);
  populateFilterDropdowns("unaccountedTypeFilter", fileTypes);
}


function populateFilterDropdowns(dropdownId, values) {
  const dropdown = document.getElementById(dropdownId);
  dropdown.innerHTML = '<option value="all">All</option>';
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    dropdown.appendChild(option);
  });
}




function filterAccountedTable() {
  const domainFilter = document.getElementById("accountedDomainFilter").value;
  const typeFilter = document.getElementById("accountedTypeFilter").value;
  const rows = accountedTableBody.querySelectorAll("tr");
  rows.forEach((row) => {
    const visitedDomainCell = row.children[0].textContent;
    const fileTypeCell = row.children[2].textContent;
    row.style.display =
      (domainFilter === "all" || visitedDomainCell === domainFilter) &&
        (typeFilter === "all" || fileTypeCell === typeFilter)
        ? ""
        : "none";
  });
}

function filterUnaccountedTable() {
  const domainFilter = document.getElementById("unaccountedDomainFilter").value;
  const typeFilter = document.getElementById("unaccountedTypeFilter").value;
  const rows = unaccountedTableBody.querySelectorAll("tr");
  rows.forEach((row) => {
    const visitedDomainCell = row.children[0].textContent;
    const fileTypeCell = row.children[2].textContent;
    row.style.display =
      (domainFilter === "all" || visitedDomainCell === domainFilter) &&
        (typeFilter === "all" || fileTypeCell === typeFilter)
        ? ""
        : "none";
  });
}

document.getElementById("accountedDomainFilter").addEventListener("change", filterAccountedTable);
document.getElementById("accountedTypeFilter").addEventListener("change", filterAccountedTable);
document.getElementById("unaccountedDomainFilter").addEventListener("change", filterUnaccountedTable);
document.getElementById("unaccountedTypeFilter").addEventListener("change", filterUnaccountedTable);
document.addEventListener("DOMContentLoaded", () => {
  const sel = document.getElementById("deviceGridIntensity");
  if (sel) {
    sel.addEventListener("change", adjustDeviceIntensity);
    adjustDeviceIntensity();
  }
});


let intensitySelect = averageIntensity.WORLD;

function adjustDeviceIntensity() {
  const code = document.getElementById("deviceGridIntensity").value;
  intensitySelect = averageIntensity[code] ?? averageIntensity.WORLD;
}


const accountedAgg = new Map();
const unaccountedAgg = new Map();

let accountedRequestCount = 0;
let unaccountedRequestCount = 0;

function makeKey(visitedDomain, hostdomain, filetype) {
  return `${visitedDomain}|${hostdomain}|${filetype}`;
}

function addAccounted({ visitedDomain, hostdomain, filetype, datavolume, co2 }) {
  const key = makeKey(visitedDomain, hostdomain, filetype);
  const prev = accountedAgg.get(key);
  if (prev) {
    prev.datavolume += datavolume;
    prev.co2 += co2;
  } else {
    accountedAgg.set(key, { visitedDomain, hostdomain, filetype, datavolume, co2 });
  }
  accountedRequestCount++;
}

function addUnaccounted({ visitedDomain, hostdomain, filetype }) {
  const key = makeKey(visitedDomain, hostdomain, filetype);
  if (!unaccountedAgg.has(key)) {
    unaccountedAgg.set(key, { visitedDomain, hostdomain, filetype });
  }
  unaccountedRequestCount++;
}


async function startTracking() {
  accountedAgg.clear();
  unaccountedAgg.clear();
  accountedRequestCount = 0;
  unaccountedRequestCount = 0;
  aggregatedTotalBytes = 0;
  aggregatedTotalCo2 = 0;
  pendingRequests.clear();
  accountedRowsMap.clear();
  unaccountedRowsMap.clear();
  reqCountEl.textContent = "0";
  totalBytesEl.textContent = "0 KB";
  co2ValEl.textContent = "0.0000 g";
  unaccountedCountEl.textContent = "0";
  accountedTableBody.innerHTML = "";
  unaccountedTableBody.innerHTML = "";

  const tabId = chrome.devtools.inspectedWindow.tabId;


  chrome.runtime.sendMessage({ type: "START_TRACKING", tabId }, (response) => {
    console.log("Background response:", response.status);
  });

}

function stopTracking() {

  chrome.runtime.sendMessage({ type: "STOP_TRACKING" });
  clearInterval(domainCheckInterval);
}

document.addEventListener("DOMContentLoaded", () => {
  const mainTabs = document.querySelectorAll(".tab-button");
  const mainContents = document.querySelectorAll(".tab-content");
  mainTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      mainTabs.forEach((t) => t.classList.remove("active"));
      mainContents.forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });
  const nestedTabs = document.querySelectorAll(".nested-tab-button");
  const nestedContents = document.querySelectorAll(".nested-tab-content");
  nestedTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      nestedTabs.forEach((t) => t.classList.remove("active"));
      nestedContents.forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });
});


function formatBytes(bytes) {
  const kbValue = (bytes / (1024)).toFixed(2);
  return { value: kbValue, unit: "KB" };
}

function exportToCSV() {
  let csvContent = `"Visited Domain","Host Domain","Filetype","Data Volume (KB)","CO₂"\n`;

  for (const item of accountedAgg.values()) {
    const { value, unit } = formatBytes(item.datavolume);
    const row = [
      item.visitedDomain,
      item.hostdomain,
      item.filetype,
      `${value} ${unit}`,
      `${item.co2.toFixed(7)} g`
    ];
    csvContent += row.map(field => `"${field}"`).join(",") + "\n";
  }

  return csvContent;
}


document.getElementById("downloadData").addEventListener("click", () => {
  const csvData = exportToCSV();
  const blob = new Blob([csvData], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "network_data.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

startBtn.addEventListener("click", startTracking);
stopBtn.addEventListener("click", stopTracking);


