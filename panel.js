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

const domainMap = new Map();


let isTracking = false;
let requests = [];
let unaccountedRequests = [];
let totalBytes = 0;
let totalCo2 = 0;
let domainVisited = "";


function updateVisitedDomain() {
  chrome.devtools.inspectedWindow.eval("window.location.hostname", (result) => {

    if (result && result !== domainVisited) {
      console.log(`Domain changed from ${domainVisited} to ${result}`);
      domainVisited = result;
      updateRealTimeStats(); 
    }
  });

}


let networkDebuggerActive = false;
const pendingRequests = new Map();


let domainCheckInterval;

function extractDomain(url) {
  const a = document.createElement("a");
  a.href = url;
  return a.hostname;
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



async function setupNetworkDebugger() {
  const tabId = chrome.devtools.inspectedWindow.tabId;

  try {

    await new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, "1.3", () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        }
        resolve();
      });
    });


    await new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(
        { tabId },
        "Network.enable",
        {
          maxTotalBufferSize: 10000000,
          maxResourceBufferSize: 5000000
        },
        () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          }
          resolve();
        }
      );
    });

    networkDebuggerActive = true;
    setupNetworkEventListeners(tabId);

  } catch (error) {
    console.error("Failed to setup network debugger:", error);
    networkDebuggerActive = false;
  }
}

function setupNetworkEventListeners(tabId) {
  chrome.debugger.onEvent.addListener(async (source, method, params) => {
    if (source.tabId !== tabId || !isTracking) return;

 

    switch (method) {
      case "Network.requestWillBeSent":
        handleRequestStart(params);
        break;
      case "Network.responseReceived":
        await handleResponseReceived(params);
        break;

      case "Network.requestServedFromCache":
        handleRequestServedFromCache(params);
        break;

      case "Network.loadingFinished":
        await handleLoadingFinished(params);
        break;

      case "Network.loadingFailed":
        handleLoadingFailed(params);
        break;
    }
  });
}

function handleRequestStart(params) {
  const { requestId, request, timestamp } = params;
  pendingRequests.set(requestId, {
    url: request.url,
    startTime: timestamp,
    size: 0
  });
}

function handleRequestServedFromCache(params) {
  const { requestId } = params;
  const request = pendingRequests.get(requestId);
  if (!request) return;

  request.servedFromCache = true;
}

async function handleResponseReceived(params) {
  const { requestId, response } = params;
  const request = pendingRequests.get(requestId);

  if (!request) return;


  request.headers = response.headers;
  request.mimeType = response.mimeType;
  request.protocol = response.protocol;
  request.status = response.status;
}

async function handleLoadingFinished(params) {
  const { requestId, encodedDataLength } = params;
  const request = pendingRequests.get(requestId);

  if (!request) return;

  try {

    const headersSize = calculateHeadersSize(request.headers);
    const totalSize = encodedDataLength + headersSize;

    const domain = extractDomain(request.url);
    const filetype = request.mimeType?.split("/")?.[1] || "other";

    if (totalSize > 0) {
      
      const isGreen = await fetchHostingProvider(request.url);

      const co2Emissions = co2Lib.perByte(totalSize, isGreen);


      requests.push({
        visitedDomain: domainVisited,
        hostdomain: domain,
        datavolume: totalSize,
        co2: co2Emissions,
        filetype
      });

      totalBytes += totalSize;
      totalCo2 += co2Emissions;
    } else {
      unaccountedRequests.push({
        visitedDomain: domainVisited,
        hostdomain: domain,
        filetype
      });
    }

    updateRealTimeStats();
    updateAccountedDetailsTab();
    updateUnaccountedDetailsTab();

  } catch (error) {
    console.error(`Failed to process request ${request.url}:`, error);
    unaccountedRequests.push({
      visitedDomain: domainVisited,
      hostdomain: extractDomain(request.url),
      filetype: request.mimeType?.split("/")?.[1] || "other"
    });
    updateUnaccountedDetailsTab();
  } finally {
    pendingRequests.delete(requestId);
  }
}

function handleLoadingFailed(params) {
  const { requestId, errorText } = params;
  const request = pendingRequests.get(requestId);

  if (request) {
    console.warn(`Request failed for ${request.url}: ${errorText}`);
    unaccountedRequests.push({
      visitedDomain: domainVisited,
      hostdomain: extractDomain(request.url),
      filetype: request.mimeType?.split("/")?.[1] || "other"
    });
    updateUnaccountedDetailsTab();
    pendingRequests.delete(requestId);
  }
}


async function startTracking() {
  if (isTracking) return;

  isTracking = true;
  requests = [];
  unaccountedRequests = [];
  totalBytes = 0;
  totalCo2 = 0;
  pendingRequests.clear();

  reqCountEl.textContent = "0";
  totalBytesEl.textContent = "0 KB";
  co2ValEl.textContent = "0.0000 g";
  unaccountedCountEl.textContent = "0";

  updateVisitedDomain();
  domainCheckInterval = setInterval(updateVisitedDomain, 1000);

  await setupNetworkDebugger();
}


function stopTracking() {
  if (!isTracking) return;
  isTracking = false;

  clearInterval(domainCheckInterval);

  if (networkDebuggerActive) {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    chrome.debugger.detach({ tabId }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error detaching debugger:', chrome.runtime.lastError);
      }
      networkDebuggerActive = false;
    });
  }

  pendingRequests.clear();
}


function calculateHeadersSize(headers) {
  if (!headers) return 0;

  return Object.entries(headers)
    .reduce((size, [key, value]) => {
      return size + key.length + value.length + 4; 
    }, 2); 
}



function updateRealTimeStats() {
  reqCountEl.textContent = requests.length.toString();
  totalBytesEl.textContent = `${(totalBytes / 1024).toFixed(4)} KB`;
  co2ValEl.textContent = `${totalCo2.toFixed(10)} g`;
  unaccountedCountEl.textContent = unaccountedRequests.length.toString();
}




const accountedRowsMap = new Map();

function updateAccountedDetailsTab() {
  const filteredRequests = requests.filter(
    (r) => r.visitedDomain === domainVisited && r.co2 !== "unaccounted"
  );


  // Format: "visitedDomain|hostdomain|filetype"
  const aggregatedData = new Map();
  filteredRequests.forEach(({ visitedDomain, hostdomain, datavolume, co2, filetype }) => {
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
  unaccountedTableBody.innerHTML = "";
  unaccountedRequests.forEach(({ hostdomain, visitedDomain, filetype }) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${visitedDomain}</td>
      <td>${hostdomain}</td>
      <td>${filetype}</td>
      <td>N/A</td>
      <td>Unaccounted</td>
    `;
    unaccountedTableBody.appendChild(row);
  });

  populateUnaccountedFilters();

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

startBtn.addEventListener("click", startTracking);
stopBtn.addEventListener("click", stopTracking);



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
  const domains = [...new Set(requests.map((r) => r.visitedDomain))];
  const fileTypes = [...new Set(requests.map((r) => r.filetype))];

  populateFilterDropdowns("accountedDomainFilter", domains);
  populateFilterDropdowns("accountedTypeFilter", fileTypes);
}

function populateUnaccountedFilters() {
  const domains = [...new Set(unaccountedRequests.map((r) => r.visitedDomain))];
  const fileTypes = [...new Set(unaccountedRequests.map((r) => r.filetype))];

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

    const matchesDomain = domainFilter === "all" || visitedDomainCell === domainFilter;
    const matchesType = typeFilter === "all" || fileTypeCell === typeFilter;

    row.style.display = matchesDomain && matchesType ? "" : "none";
  });
}

function filterUnaccountedTable() {
  const domainFilter = document.getElementById("unaccountedDomainFilter").value;
  const typeFilter = document.getElementById("unaccountedTypeFilter").value;

  const rows = unaccountedTableBody.querySelectorAll("tr");
  rows.forEach((row) => {
    const visitedDomainCell = row.children[0].textContent;
    const fileTypeCell = row.children[2].textContent;

    const matchesDomain = domainFilter === "all" || visitedDomainCell === domainFilter;
    const matchesType = typeFilter === "all" || fileTypeCell === typeFilter;

    row.style.display = matchesDomain && matchesType ? "" : "none";
  });
}


document.getElementById("accountedDomainFilter").addEventListener("change", filterAccountedTable);
document.getElementById("accountedTypeFilter").addEventListener("change", filterAccountedTable);

document.getElementById("unaccountedDomainFilter").addEventListener("change", filterUnaccountedTable);
document.getElementById("unaccountedTypeFilter").addEventListener("change", filterUnaccountedTable);


