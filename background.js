"use strict";


const ALLOWED_MESSAGE_TYPES = new Set(["START_TRACKING", "STOP_TRACKING"]);

const trackedTabs = new Set();
const attemptedTabs = new Set();
let initialTabHandled = false;
let trackingStarted = false;

function isValidUrl(url) {
  return url && !url.startsWith("chrome://") && !url.startsWith("about:");
}
function attachDebugger(tabId) {
  tabId = Number(tabId);

  if (trackedTabs.has(tabId)) {
    console.log(`Debugger already attached to tab ${tabId}`);
    return;
  }
  chrome.debugger.attach({ tabId }, "1.3", () => {
    if (chrome.runtime.lastError) {
      console.error("Debugger attach error:", chrome.runtime.lastError.message);
      return;
    }
    chrome.debugger.sendCommand(
      { tabId },
      "Network.enable",
      {
        maxTotalBufferSize: 10000000,
        maxResourceBufferSize: 5000000
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Network.enable error:", chrome.runtime.lastError.message);
          return;
        }
        trackedTabs.add(tabId);
        console.log(`Debugger attached to tab ${tabId}`);
      }
    );
  });
}



chrome.tabs.onCreated.addListener((tab) => {
  if(trackingStarted === false) {
    return;
  }

  if (initialTabHandled === false) {
    initialTabHandled = true;
    return;
  }

  if (isValidUrl(tab.url)) {
    chrome.notifications.create(`track-tab-${tab.id}`, {
      type: "basic",
      iconUrl: "./images/logokb.webp",
      title: "Enable Tracking",
      message: `Do you want to track network requests on ${tab.url}?`,
      buttons: [{ title: "Yes" }, { title: "No" }],
      isClickable: true
    });
  } else {
    console.log(`Tab ${tab.id} created with an invalid URL: ${tab.url}`);
  }
});




chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if(trackingStarted === false) {
    return;
  }
  if (initialTabHandled === false) {
    initialTabHandled = true;
    return;
  }

  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.startsWith("http") &&
    !trackedTabs.has(tabId) &&
    !attemptedTabs.has(tabId)
  ) {
    attemptedTabs.add(tabId);
    chrome.notifications.create(`track-tab-${tabId}`, {
      type: "basic",
      iconUrl: "/images/logokb.webp",
      title: "Enable Tracking",
      message: `Do you want to track network requests on ${tab.url}?`,
      buttons: [{ title: "Yes" }, { title: "No" }],
      isClickable: true
    });
  }
});



chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId.startsWith("track-tab-")) {
    const tabId = parseInt(notificationId.split("-")[2]);
    if (buttonIndex === 0) {
      attachDebugger(tabId);
    } else {
      console.log(`Tracking for Tab ${tabId} declined.`);
    }
    chrome.notifications.clear(notificationId);
  }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!trackedTabs.has(source.tabId)) return;
  chrome.runtime.sendMessage({
    type: "NETWORK_EVENT",
    eventType: method,
    params: params,
    tabId: source.tabId
  });
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string" || !ALLOWED_MESSAGE_TYPES.has(message.type)) {
    console.error("Received an unknown or disallowed message type:", message);
    return;
  }

  if (message.type === "START_TRACKING") {
    const tabId = message.tabId || (sender && sender.tab && sender.tab.id);
    if (trackedTabs.has(tabId)) {
      sendResponse({ status: "Tracking already started" });
    } else {

      attachDebugger(tabId);
      trackingStarted = true;
      sendResponse({ status: "Tracking started" });
    }
  } else if (message.type === "STOP_TRACKING") {
    trackingStarted = false;
    trackedTabs.forEach((tabId) => {
      chrome.debugger.detach({ tabId }, () => {
        if (chrome.runtime.lastError) {
          console.error(`Error detaching debugger from tab ${tabId}:`, chrome.runtime.lastError.message);
        }
        trackedTabs.delete(tabId);
      });
    });
    sendResponse({ status: "Tracking stopped" });
  }
});


chrome.tabs.onRemoved.addListener((tabId) => {
  if (trackedTabs.has(tabId)) {
    initialTabHandled = false;
    trackingStarted = false;
    chrome.debugger.detach({ tabId }, () => {
      trackedTabs.delete(tabId);
      console.log(`Debugger detached from removed tab ${tabId}`);
    });
  }
});





