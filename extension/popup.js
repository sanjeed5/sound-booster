"use strict";

const slider = document.getElementById("volume");
const label = document.getElementById("volLabel");
const status = document.getElementById("status");
const siteEl = document.getElementById("site");
const resetBtn = document.getElementById("resetBtn");
const applyBtn = document.getElementById("applyBtn");
const limiterSwitch = document.getElementById("limiterSwitch");

const STORAGE_KEYS = {
  perSite: "perSite",
  limiter: "limiter",
};

let currentHost = null;
let limiterEnabled = true;

function setStatus(text, kind) {
  status.replaceChildren();
  status.className = "status" + (kind ? " " + kind : "");
  status.textContent = text;
}

function setStatusWithLink(beforeText, linkText, linkUrl, afterText, kind) {
  status.replaceChildren();
  status.className = "status" + (kind ? " " + kind : "");
  status.append(beforeText);
  const link = document.createElement("a");
  link.textContent = linkText;
  link.href = linkUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  status.appendChild(link);
  status.append(afterText);
}

function updateLabel(volume) {
  label.textContent = volume.toFixed(1) + "x";
  label.classList.remove("boost", "high");
  if (volume > 3.5) label.classList.add("high");
  else if (volume > 1.05) label.classList.add("boost");
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null);
    });
  });
}

function hostFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname || null;
  } catch {
    return null;
  }
}

async function loadState() {
  const tab = await getActiveTab();
  currentHost = tab && tab.url ? hostFromUrl(tab.url) : null;

  if (currentHost) {
    siteEl.textContent = currentHost;
  } else {
    siteEl.textContent = "(unsupported page)";
  }

  const data = await chrome.storage.local.get([STORAGE_KEYS.perSite, STORAGE_KEYS.limiter]);
  const perSite = data[STORAGE_KEYS.perSite] || {};
  limiterEnabled = data[STORAGE_KEYS.limiter] !== false;
  limiterSwitch.classList.toggle("on", limiterEnabled);
  limiterSwitch.setAttribute("aria-checked", String(limiterEnabled));

  const saved = currentHost && typeof perSite[currentHost] === "number" ? perSite[currentHost] : 1.0;
  slider.value = String(saved);
  updateLabel(saved);

  if (!tab || !currentHost) {
    setStatus("Open a regular web page to use the booster.", "err");
    slider.disabled = true;
    applyBtn.disabled = true;
    resetBtn.disabled = true;
    return;
  }

  await applyVolume(saved);
}

async function persistVolume(volume) {
  if (!currentHost) return;
  const data = await chrome.storage.local.get([STORAGE_KEYS.perSite]);
  const perSite = data[STORAGE_KEYS.perSite] || {};
  if (volume === 1.0) {
    delete perSite[currentHost];
  } else {
    perSite[currentHost] = volume;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.perSite]: perSite });
}

async function applyVolume(volume) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: injectGainControl,
      args: [volume, limiterEnabled],
    });
  } catch (err) {
    setStatus("Cannot run on this page (browser-protected).", "err");
    return;
  }

  let videosBoosted = 0;
  let iframeUrl = null;
  for (const r of results || []) {
    const v = r && r.result;
    if (!v) continue;
    if (typeof v.videos === "number") videosBoosted += v.videos;
    if (!iframeUrl && v.iframeUrl) iframeUrl = v.iframeUrl;
  }

  const badge = volume === 1.0 ? "" : volume.toFixed(1) + "x";
  chrome.action.setBadgeText({ text: badge, tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: volume > 3.5 ? "#f59e0b" : "#6366f1" });

  if (videosBoosted > 0) {
    const noun = videosBoosted === 1 ? "video" : "videos";
    const note = volume > 3.5 ? " (high gain — may distort)" : "";
    setStatus(`Boosted ${videosBoosted} ${noun}${note}`, volume > 3.5 ? "warn" : "ok");
  } else if (iframeUrl) {
    setStatusWithLink("No video here. Try opening the ", "embedded frame", iframeUrl, " directly.", "warn");
  } else {
    setStatus("No <video> elements found on this page.", "warn");
  }
}

function injectGainControl(volume, useLimiter) {
  const W = window;
  if (!W.__soundBoosterState) {
    W.__soundBoosterState = new WeakMap();
  }
  const state = W.__soundBoosterState;
  const videos = document.querySelectorAll("video");
  let count = 0;

  videos.forEach((video) => {
    let entry = state.get(video);
    if (!entry) {
      try {
        const Ctx = W.AudioContext || W.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const source = ctx.createMediaElementSource(video);
        const gain = ctx.createGain();
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -3;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.1;

        entry = { ctx, gain, limiter, source, limiterOn: null };
        state.set(video, entry);

        video.addEventListener("play", () => {
          if (ctx.state === "suspended") ctx.resume();
        });
      } catch (err) {
        return;
      }
    }

    const desired = !!useLimiter;
    if (entry.limiterOn !== desired) {
      try {
        entry.source.disconnect();
        entry.gain.disconnect();
        entry.limiter.disconnect();
      } catch {}
      if (desired) {
        entry.source.connect(entry.gain).connect(entry.limiter).connect(entry.ctx.destination);
      } else {
        entry.source.connect(entry.gain).connect(entry.ctx.destination);
      }
      entry.limiterOn = desired;
    }

    entry.gain.gain.value = volume;
    count += 1;
  });

  if (count > 0) return { videos: count, iframeUrl: null };

  let iframeUrl = null;
  for (const iframe of document.querySelectorAll("iframe")) {
    const src = iframe.src;
    if (!src) continue;
    if (!/^https?:/i.test(src)) continue;
    iframeUrl = src;
    break;
  }
  return { videos: 0, iframeUrl };
}

slider.addEventListener("input", async () => {
  const volume = parseFloat(slider.value);
  updateLabel(volume);
  await persistVolume(volume);
  await applyVolume(volume);
});

resetBtn.addEventListener("click", async () => {
  slider.value = "1";
  updateLabel(1.0);
  await persistVolume(1.0);
  await applyVolume(1.0);
});

applyBtn.addEventListener("click", async () => {
  slider.value = "2";
  updateLabel(2.0);
  await persistVolume(2.0);
  await applyVolume(2.0);
});

function toggleLimiter() {
  limiterEnabled = !limiterEnabled;
  limiterSwitch.classList.toggle("on", limiterEnabled);
  limiterSwitch.setAttribute("aria-checked", String(limiterEnabled));
  chrome.storage.local.set({ [STORAGE_KEYS.limiter]: limiterEnabled });
  applyVolume(parseFloat(slider.value));
}

limiterSwitch.addEventListener("click", toggleLimiter);
limiterSwitch.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    toggleLimiter();
  }
});

loadState();
