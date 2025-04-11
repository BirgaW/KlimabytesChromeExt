"use strict";

import { co2 } from "./vendor/co2/index.js";

const co2Lib = new co2();


const startBtn = document.getElementById("startTracking");
const stopBtn = document.getElementById("stopTracking");
const reqCountEl = document.getElementById("reqCount");
const totalBytesEl = document.getElementById("totalBytes");
const co2ValEl = document.getElementById("co2Val");
const unaccountedCountEl = document.getElementById("unaccountedCount");
const accountedTableBody = document.getElementById("accountedTableBody");
const unaccountedTableBody = document.getElementById("unaccountedTableBody");

let aggregatedRequests = [];           
let aggregatedUnaccountedRequests = [];   
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

async function fetchHostingProvider(url) {
  try {
    const hostname = extractDomain(url);
    const response = await fetch(`https://api.thegreenwebfoundation.org/api/v3/greencheck/${hostname}`);
    const data = await response.json();
    return data.green || false;
  } catch (error) {
    console.error("Error fetching hosting provider data:", error);
    return false;
  }
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

async function handleLoadingFinished(params, tabId) {
  const { requestId, encodedDataLength } = params;
  const key = `${tabId}-${requestId}`;
  const req = pendingRequests.get(key);
  if (!req) return;
  try {
    const headersSize = calculateHeadersSize(req.headers);
    const totalSize = encodedDataLength + headersSize;
    const domain = extractDomain(req.url);
    const filetype = req.mimeType?.split("/")?.[1] || "other";
    if (totalSize > 0) {
      const isGreen = await fetchHostingProvider(req.url);
      const co2Emissions = co2Lib.perByte(totalSize, isGreen);
      aggregatedRequests.push({
        visitedDomain: req.visitedDomain,
        hostdomain: domain,
        datavolume: totalSize,
        co2: co2Emissions,
        filetype
      });
      aggregatedTotalBytes += totalSize;
      aggregatedTotalCo2 += co2Emissions;
    } else {
      aggregatedUnaccountedRequests.push({
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
    aggregatedUnaccountedRequests.push({
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
    aggregatedUnaccountedRequests.push({
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
    return; // Do nothing if message is not valid
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
  reqCountEl.textContent = aggregatedRequests.length.toString();
  totalBytesEl.textContent = `${(aggregatedTotalBytes / 1024).toFixed(4)} KB`;
  co2ValEl.textContent = `${aggregatedTotalCo2.toFixed(10)} g`;
  unaccountedCountEl.textContent = aggregatedUnaccountedRequests.length.toString();
}

function updateAccountedDetailsTab() {
  const aggregatedData = new Map();
  aggregatedRequests.forEach(({ visitedDomain, hostdomain, datavolume, co2, filetype }) => {
    const key = `${visitedDomain}|${hostdomain}|${filetype}`;
    if (aggregatedData.has(key)) {
      const prev = aggregatedData.get(key);
      prev.datavolume += datavolume;
      prev.co2 += co2;
    } else {
      aggregatedData.set(key, { visitedDomain, hostdomain, filetype, datavolume, co2 });
    }
  });
  aggregatedData.forEach((data, key) => {
    if (accountedRowsMap.has(key)) {
      const row = accountedRowsMap.get(key);
      row.children[3].textContent = `${(data.datavolume / 1024).toFixed(4)} KB`;
      row.children[4].textContent = `${data.co2.toFixed(10)} g`;
    } else {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${data.visitedDomain}</td>
        <td>${data.hostdomain}</td>
        <td>${data.filetype}</td>
        <td>${(data.datavolume / 1024).toFixed(4)} KB</td>
        <td>${data.co2.toFixed(10)} g</td>
      `;
      accountedTableBody.appendChild(row);
      accountedRowsMap.set(key, row);
    }
  });
  populateAccountedFilters();
}

function updateUnaccountedDetailsTab() {
  const aggregatedData = new Map();
  aggregatedUnaccountedRequests.forEach(({ visitedDomain, hostdomain, filetype }) => {
    const key = `${visitedDomain}|${hostdomain}|${filetype}`;
    if (!aggregatedData.has(key)) {
      aggregatedData.set(key, { visitedDomain, hostdomain, filetype });
    }
  });
  aggregatedData.forEach((data, key) => {
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

function populateAccountedFilters() {
  const domains = [...new Set(aggregatedRequests.map((r) => r.visitedDomain))];
  const fileTypes = [...new Set(aggregatedRequests.map((r) => r.filetype))];
  populateFilterDropdowns("accountedDomainFilter", domains);
  populateFilterDropdowns("accountedTypeFilter", fileTypes);
}

function populateUnaccountedFilters() {
  const domains = [...new Set(aggregatedUnaccountedRequests.map((r) => r.visitedDomain))];
  const fileTypes = [...new Set(aggregatedUnaccountedRequests.map((r) => r.filetype))];
  populateFilterDropdowns("unaccountedDomainFilter", domains);
  populateFilterDropdowns("unaccountedTypeFilter", fileTypes);
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


async function startTracking() {

  aggregatedRequests = [];
  aggregatedUnaccountedRequests = [];
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
  const mbValue = (bytes / (1024 * 1024)).toFixed(4);
  return { value: mbValue, unit: "MB" };
}

function exportToCSV() {
  let csvContent = `"Visited Domain","Host Domain","Filetype","Data Volume (MB)","CO₂"\n`;
  
  aggregatedRequests.forEach(item => {
    const { value, unit } = formatBytes(item.datavolume);
    const row = [
      item.visitedDomain,
      item.hostdomain,
      item.filetype,
      `${value} ${unit}`,
      `${item.co2.toFixed(10)} g`
    ];
    csvContent += row.map(field => `"${field}"`).join(",") + "\n";
  });
  
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


