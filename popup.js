// popup.js — AI Vision Extension

const $ = id => document.getElementById(id);

// ── State ──
let apiKey = '';
let selectedModel = 'meta-llama/llama-4-scout-17b-16e-instruct';
let messages = [];
let capturedImage = null;
let isThinking = false;

// ── Onboarding elements ──
const screenOnboard = $('screen-onboard');
const screenChat    = $('screen-chat');
const obApiInput    = $('ob-api-input');
const obSaveBtn     = $('ob-save-btn');
const obFeedback    = $('ob-feedback');
const obCta         = $('ob-cta');
const obSkip        = $('ob-skip');
const badge2        = $('badge2');
const badge3        = $('badge3');
const obStep3       = $('ob-step3');

// ── Chat elements ──
const messagesEl    = $('messages');
const chatInput     = $('chat-input');
const sendBtn       = $('send-btn');
const captureBtn    = $('capture-btn');
const capPreview    = $('cap-preview');
const capImg        = $('cap-img');
const capRm         = $('cap-rm');
const statusSub     = $('status-sub');
const keyDot        = $('key-dot');
const settingsToggle= $('settings-toggle');
const settingsDrawer= $('settings-drawer');
const newChatBtn    = $('new-chat-btn');
const dApi          = $('d-api');
const dSave         = $('d-save');
const noKeyBanner   = $('no-key-banner');
const modelGrid     = $('model-grid');
const welcome       = $('welcome');
const toastEl       = $('toast');

// ══════════════════════════════════════
// INIT — load storage & decide screen
// ══════════════════════════════════════
chrome.storage.local.get(['groqApiKey', 'selectedModel', 'chatHistory', 'onboardDone'], init);

function init(data) {
  if (data.groqApiKey) {
    apiKey = data.groqApiKey;
    dApi.value = data.groqApiKey;
  }
  if (data.selectedModel) {
    selectedModel = data.selectedModel;
    modelGrid.querySelectorAll('.model-chip').forEach(c => {
      c.classList.toggle('sel', c.dataset.model === selectedModel);
    });
  }
  if (data.chatHistory?.length) {
    messages = data.chatHistory;
  }

  // Check pending capture from background
  chrome.storage.session.get(['pendingCapture'], (s) => {
    const hasPending = !!s.pendingCapture;

    if (data.onboardDone || data.groqApiKey) {
      // Go straight to chat
      showChatScreen();
      if (data.chatHistory?.length) renderHistory();
      if (hasPending) applyCapture(s.pendingCapture);
    } else {
      // Show onboarding
      showOnboardScreen();
      if (hasPending) {
        // They captured something before setting key — wait, remember it
        chrome.storage.session.get(['pendingCapture'], () => {});
      }
    }
  });
}

// ══════════════════════════════════════
// SCREEN SWITCHING
// ══════════════════════════════════════
function showOnboardScreen() {
  screenOnboard.classList.add('active');
  screenChat.classList.remove('active');
}

function showChatScreen() {
  screenChat.classList.add('active');
  screenOnboard.classList.remove('active');
  updateKeyIndicators();
  updateSendBtn();
}

// ══════════════════════════════════════
// ONBOARDING LOGIC
// ══════════════════════════════════════

// Live enable CTA when input has text
obApiInput.addEventListener('input', () => {
  const val = obApiInput.value.trim();
  obCta.disabled = val.length < 5;
  if (val.length > 0) {
    obFeedback.className = 'api-feedback';
    obFeedback.textContent = '';
  }
  // Update CTA label
  obCta.innerHTML = val ? '<span>✓</span> Save Key &amp; Start Chatting' : '<span>🔑</span> Save Key to Get Started';
});

// Save from inline button or CTA
function doSaveKey() {
  const val = obApiInput.value.trim();
  if (!val) { showObError('Please paste your API key first.'); return; }
  if (!val.startsWith('gsk_')) {
    showObError('Groq keys start with gsk_ — double-check and try again.');
    return;
  }
  apiKey = val;
  chrome.storage.local.set({ groqApiKey: val, onboardDone: true });

  // Mark step 2 done, step 3 active
  badge2.textContent = '✓';
  badge2.className = 'step-badge done';
  badge3.className = 'step-badge active';
  obStep3.classList.add('active-step');

  obFeedback.className = 'api-feedback ok';
  obFeedback.textContent = '✓ Key saved! Redirecting…';

  setTimeout(() => {
    showChatScreen();
    dApi.value = val;
  }, 650);
}

obSaveBtn.addEventListener('click', doSaveKey);
obCta.addEventListener('click', doSaveKey);

obApiInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') doSaveKey();
});

obSkip.addEventListener('click', () => {
  chrome.storage.local.set({ onboardDone: true });
  showChatScreen();
});

function showObError(msg) {
  obFeedback.className = 'api-feedback error';
  obFeedback.textContent = '⚠ ' + msg;
}

// ══════════════════════════════════════
// CHAT SCREEN LOGIC
// ══════════════════════════════════════

// Settings toggle
settingsToggle.addEventListener('click', () => {
  settingsDrawer.classList.toggle('open');
  settingsToggle.classList.toggle('active');
});

// New chat
newChatBtn.addEventListener('click', () => {
  messages = [];
  messagesEl.querySelectorAll('.msg, .err-msg').forEach(el => el.remove());
  if (welcome) welcome.style.display = '';
  chrome.storage.local.remove('chatHistory');
  capturedImage = null;
  capPreview.classList.remove('show');
  captureBtn.classList.remove('active');
  updateSendBtn();
  showToast('New chat started');
});

// Update API key from drawer
dSave.addEventListener('click', () => {
  const val = dApi.value.trim();
  if (!val.startsWith('gsk_')) { showToast('⚠ Key should start with gsk_'); return; }
  apiKey = val;
  chrome.storage.local.set({ groqApiKey: val });
  updateKeyIndicators();
  settingsDrawer.classList.remove('open');
  showToast('✓ API key updated');
});

// Model chips
modelGrid.addEventListener('click', e => {
  const chip = e.target.closest('.model-chip');
  if (!chip) return;
  selectedModel = chip.dataset.model;
  chrome.storage.local.set({ selectedModel });
  modelGrid.querySelectorAll('.model-chip').forEach(c => c.classList.toggle('sel', c === chip));
  showToast('Model: ' + chip.querySelector('.mc-name').textContent);
});

// No-key banner
noKeyBanner.addEventListener('click', () => {
  settingsDrawer.classList.add('open');
  dApi.focus();
});

// Capture remove
capRm.addEventListener('click', () => {
  capturedImage = null;
  capPreview.classList.remove('show');
  capImg.src = '';
  captureBtn.classList.remove('active');
  updateSendBtn();
});

// Capture button
captureBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'START_CAPTURE' }, () => {
    showToast('🖱 Draw a selection on the page');
    window.close();
  });
});

// Feature cards
document.addEventListener('click', e => {
  // Capture card
  if (e.target.closest('#feat-capture')) {
    captureBtn.click();
    return;
  }
  // Data-msg cards/chips
  const el = e.target.closest('[data-msg]');
  if (el) {
    chatInput.value = el.dataset.msg;
    chatInput.dispatchEvent(new Event('input'));
    chatInput.focus();
  }
});

// Textarea auto-resize
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 96) + 'px';
  updateSendBtn();
});

chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) sendMessage(); }
});

sendBtn.addEventListener('click', sendMessage);

// Listen for capture result from background/content
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'CAPTURE_RESULT' && msg.dataUrl) {
    applyCapture(msg.dataUrl);
  }
});

function applyCapture(dataUrl) {
  chrome.storage.session.remove(['pendingCapture']);
  capturedImage = dataUrl;
  capImg.src = dataUrl;
  capPreview.classList.add('show');
  captureBtn.classList.add('active');
  updateSendBtn();
  showToast('✓ Region captured — ask AI about it!');
  if (!chatInput.value.trim()) {
    chatInput.value = 'What is shown in this image? Please explain in detail.';
    chatInput.dispatchEvent(new Event('input'));
  }
}

function updateSendBtn() {
  const hasContent = chatInput.value.trim().length > 0 || !!capturedImage;
  sendBtn.disabled = !hasContent || !apiKey || isThinking;
}

function updateKeyIndicators() {
  const hasKey = !!apiKey;
  keyDot.className = 'key-dot' + (hasKey ? ' ok' : '');
  noKeyBanner.classList.toggle('hidden', hasKey);
}

// ══════════════════════════════════════
// SEND MESSAGE
// ══════════════════════════════════════
async function sendMessage() {
  const text = chatInput.value.trim();
  if ((!text && !capturedImage) || !apiKey || isThinking) return;

  const userContent = [];
  if (capturedImage) userContent.push({ type: 'image_url', image_url: { url: capturedImage } });
  if (text) userContent.push({ type: 'text', text });

  appendMsg('user', { text, image: capturedImage });
  messages.push({ role: 'user', content: userContent });

  chatInput.value = '';
  chatInput.style.height = 'auto';
  capturedImage = null;
  capPreview.classList.remove('show');
  capImg.src = '';
  captureBtn.classList.remove('active');
  if (welcome) welcome.style.display = 'none';

  setThinking(true);
  try {
    const reply = await callGroq();
    messages.push({ role: 'assistant', content: reply });
    appendMsg('ai', { text: reply });
    chrome.storage.local.set({ chatHistory: messages.slice(-20) });
  } catch (err) {
    appendError(err.message);
  }
  setThinking(false);
}

// ══════════════════════════════════════
// GROQ API
// ══════════════════════════════════════
async function callGroq() {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: selectedModel,
      messages: [
        { role: 'system', content: 'You are a helpful, intelligent AI assistant with vision capabilities. When analyzing images, be detailed and insightful. Format responses clearly. Be concise but thorough.' },
        ...messages
      ],
      max_tokens: 1024,
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.choices[0]?.message?.content || 'No response received.';
}

// ══════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════
function setThinking(on) {
  isThinking = on;
  updateSendBtn();
  document.querySelector('.app').classList.toggle('thinking', on);
  statusSub.textContent = on ? 'Thinking…' : 'Ready to assist';
  const indicator = $('typing-indicator');
  if (on) {
    if (indicator) return;
    const d = document.createElement('div');
    d.className = 'msg ai'; d.id = 'typing-indicator';
    d.innerHTML = `<div class="msg-av">✦</div><div class="msg-inner"><div class="msg-bub"><div class="typing"><span></span><span></span><span></span></div></div></div>`;
    messagesEl.appendChild(d);
    scrollBottom();
  } else {
    if (indicator) indicator.remove();
  }
}

function appendMsg(role, content) {
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const av = role === 'user' ? '👤' : '✦';
  let html = `<div class="msg-av">${av}</div><div class="msg-inner"><div class="msg-bub">`;
  if (content.image) {
    html += `<div class="img-lbl">📸 Captured region</div>`;
    html += `<img class="msg-img" src="${content.image}" alt="Captured" />`;
    if (content.text) html += `<div style="margin-top:6px">${esc(content.text)}</div>`;
  } else {
    html += fmt(content.text || '');
  }
  html += `</div><div class="msg-time">${time}</div></div>`;
  d.innerHTML = html;
  messagesEl.appendChild(d);
  scrollBottom();
}

function appendError(msg) {
  const d = document.createElement('div');
  d.className = 'err-msg';
  d.innerHTML = `⚠ ${esc(msg)}`;
  messagesEl.appendChild(d);
  scrollBottom();
}

function renderHistory() {
  if (welcome) welcome.style.display = 'none';
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') {
      if (Array.isArray(m.content)) {
        const txt = m.content.find(c => c.type === 'text');
        const img = m.content.find(c => c.type === 'image_url');
        appendMsg('user', { text: txt?.text || '', image: img?.image_url?.url || null });
      } else {
        appendMsg('user', { text: m.content });
      }
    } else {
      appendMsg('ai', { text: m.content });
    }
  }
}

function fmt(text) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inline = raw => esc(raw)
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/__(.+?)__/g,'<strong>$1</strong>')
    .replace(/`([^`]+)`/g,'<code class="inline-code">$1</code>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,'<em>$1</em>');

  const lines = text.split('\n');
  const out = [];
  let inCode = false, codeLang = '', codeLines = [];
  let numCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (!inCode) { inCode = true; codeLang = line.slice(3).trim(); codeLines = []; }
      else {
        inCode = false;
        const lang = codeLang ? `<span class="code-lang">${esc(codeLang)}</span>` : '';
        out.push(`<div class="code-block">${lang}<pre><code>${codeLines.map(esc).join('\n')}</code></pre></div>`);
        codeLines = []; codeLang = '';
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    if (!line.trim()) { numCount = 0; out.push('<div class="msg-spacer"></div>'); continue; }
    const hm = line.match(/^(#{1,3})\s+(.+)/);
    if (hm) { const sz=['15px','13.5px','12.5px']; out.push(`<div class="md-h" style="font-size:${sz[hm[1].length-1]}">${inline(hm[2])}</div>`); numCount=0; continue; }
    const bm = line.match(/^(\s*)[*\-]\s+(.+)/);
    if (bm) { const ind=bm[1].length>0?' style="margin-left:14px"':''; out.push(`<div class="md-bullet"${ind}><span class="bullet-dot">•</span><span>${inline(bm[2])}</span></div>`); numCount=0; continue; }
    const nm = line.match(/^\s*\d+\.\s+(.+)/);
    if (nm) { numCount++; out.push(`<div class="md-num"><span class="num-badge">${numCount}</span><span>${inline(nm[1])}</span></div>`); continue; }
    if (/^[-*_]{3,}$/.test(line.trim())) { out.push('<hr class="md-hr">'); numCount=0; continue; }
    const qm = line.match(/^>\s*(.+)/);
    if (qm) { out.push(`<div class="md-quote">${inline(qm[1])}</div>`); numCount=0; continue; }
    numCount=0;
    out.push(`<span class="md-line">${inline(line)}</span><br>`);
  }
  if (inCode && codeLines.length) out.push(`<div class="code-block"><pre><code>${codeLines.map(esc).join('\n')}</code></pre></div>`);
  return out.join('');
}
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function scrollBottom() {
  setTimeout(() => { messagesEl.scrollTop = messagesEl.scrollHeight; }, 50);
}
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// ══════════════════════════════════════
// SETTINGS SCREEN
// ══════════════════════════════════════
const screenSettings = document.getElementById('screen-settings');
const settingsBack   = document.getElementById('settings-back');
const sKeyInput      = document.getElementById('s-key-input');
const sKeySave       = document.getElementById('s-key-save');
const sKeyStatus     = document.getElementById('s-key-status');
const sModelGrid     = document.getElementById('s-model-grid');

// Open settings screen
settingsToggle.addEventListener('click', () => {
  screenChat.classList.remove('active');
  screenSettings.classList.add('active');
  // Pre-fill key
  if (apiKey) sKeyInput.value = apiKey;
  // Sync model chips
  sModelGrid.querySelectorAll('.s-model-chip').forEach(c => {
    c.classList.toggle('sel', c.dataset.model === selectedModel);
  });
  // Populate browser info
  populateBrowserInfo();
});

// Back button
settingsBack.addEventListener('click', () => {
  screenSettings.classList.remove('active');
  screenChat.classList.add('active');
  sKeyStatus.className = 's-key-status';
});

// Save key from settings page
sKeySave.addEventListener('click', () => {
  const val = sKeyInput.value.trim();
  if (!val) { showSKeyStatus('error', 'Please paste your API key.'); return; }
  if (!val.startsWith('gsk_')) { showSKeyStatus('error', 'Key should start with gsk_ — check and try again.'); return; }
  apiKey = val;
  chrome.storage.local.set({ groqApiKey: val });
  updateKeyIndicators();
  showSKeyStatus('ok', '✓ API key saved successfully!');
  showToast('✓ API key saved');
  setTimeout(() => { sKeyStatus.className = 's-key-status'; }, 3000);
});

sKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') sKeySave.click(); });

function showSKeyStatus(type, msg) {
  sKeyStatus.className = 's-key-status ' + type;
  sKeyStatus.textContent = msg;
}

// Model selection in settings
sModelGrid.addEventListener('click', e => {
  const chip = e.target.closest('.s-model-chip');
  if (!chip) return;
  selectedModel = chip.dataset.model;
  chrome.storage.local.set({ selectedModel });
  sModelGrid.querySelectorAll('.s-model-chip').forEach(c => c.classList.toggle('sel', c === chip));
  // Sync main model grid too
  if (modelGrid) modelGrid.querySelectorAll('.model-chip').forEach(c => {
    c.classList.toggle('sel', c.dataset.model === selectedModel);
  });
  showToast('Model: ' + chip.querySelector('.smc-name').textContent);
});

// Browser info
function populateBrowserInfo() {
  // Browser name
  const ua = navigator.userAgent;
  let browser = 'Chrome';
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('OPR/')) browser = 'Opera';
  else if (ua.includes('Brave')) browser = 'Brave';
  else if (ua.includes('Chrome/')) browser = 'Google Chrome';
  const el = document.getElementById('si-browser');
  if (el) el.textContent = browser;

  // Current tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    if (!tab) return;

    const siteEl   = document.getElementById('si-site');
    const secureEl = document.getElementById('si-secure');

    if (tab.url) {
      try {
        const u = new URL(tab.url);
        if (siteEl)   siteEl.textContent = u.hostname || tab.url;
        const isHttps = u.protocol === 'https:';
        const isChromeInternal = u.protocol.startsWith('chrome');
        if (secureEl) {
          if (isChromeInternal) {
            secureEl.innerHTML = '<span class="secure-badge yes">🔒 Internal page</span>';
          } else if (isHttps) {
            secureEl.innerHTML = '<span class="secure-badge yes">🔒 Secure (HTTPS)</span>';
          } else {
            secureEl.innerHTML = '<span class="secure-badge no">⚠ Not secure (HTTP)</span>';
          }
        }
      } catch {
        if (siteEl) siteEl.textContent = 'Unknown';
      }
    }
  });
}

// Remove old inline settings drawer toggle (was previously the only settings)
// Override: settings toggle now always goes to full screen
