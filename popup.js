// popup.js v2 — AI Vision (all features)
'use strict';
const $ = id => document.getElementById(id);

// ── State ──
let apiKey = '', selectedModel = 'meta-llama/llama-4-scout-17b-16e-instruct';
let messages = [], capturedImage = null, isThinking = false;
let systemPrompt = 'You are a helpful, intelligent AI assistant with vision capabilities. When analyzing images, be detailed and insightful. Format responses clearly using markdown. Be concise but thorough.';
let savedPrompts = [], autoLang = false, showFloat = false, showTokens = true;
let totalTokens = 0, currentHistoryId = null;

// ── DOM ──
const screenOnboard  = $('screen-onboard');
const screenChat     = $('screen-chat');
const screenHistory  = $('screen-history');
const screenSettings = $('screen-settings');
const messagesEl     = $('messages');
const chatInput      = $('chat-input');
const sendBtn        = $('send-btn');
const captureBtn     = $('capture-btn');
const capPrev        = $('cap-prev');
const capImg         = $('cap-img');
const capRm          = $('cap-rm');
const statusSub      = $('status-sub');
const keyDot         = $('key-dot');
const noKeyBanner    = $('no-key-banner');
const welcome        = $('welcome');
const toastEl        = $('toast');
const tokCount       = $('tok-count');
const msgCount       = $('msg-count');
const tokenBar       = document.querySelector('.token-bar');

// Onboard
const obApiInp = $('ob-api-inp'), obSave = $('ob-save'), obFb = $('ob-fb');
const obCta = $('ob-cta'), obSkip = $('ob-skip');
const badge2 = $('badge2'), badge3 = $('badge3'), obStep3 = $('ob-step3');

// Settings
const sKey = $('s-key'), sKeySave = $('s-key-save'), sKeyStatus = $('s-key-status');
const sysPromptEl = $('sys-prompt'), sysSave = $('sys-save');
const modelGrid = $('model-grid');
const promptList = $('prompt-list'), promptInp = $('prompt-inp'), promptAdd = $('prompt-add');
const togLang = $('tog-lang'), togFloat = $('tog-float'), togTokens = $('tog-tokens');

const GUARD_MODELS = ['meta-llama/llama-prompt-guard-2-22m','meta-llama/llama-prompt-guard-2-86m','openai/gpt-oss-safeguard-20b'];

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
chrome.storage.local.get(['groqApiKey','selectedModel','onboardDone','systemPrompt','savedPrompts','autoLang','showFloat','showTokens'], data => {
  if (data.groqApiKey)    apiKey = data.groqApiKey;
  if (data.selectedModel) selectedModel = data.selectedModel;
  if (data.systemPrompt)  systemPrompt = data.systemPrompt;
  if (data.savedPrompts)  savedPrompts = data.savedPrompts;
  if (typeof data.autoLang   !== 'undefined') autoLang   = data.autoLang;
  if (typeof data.showFloat  !== 'undefined') showFloat  = data.showFloat;
  if (typeof data.showTokens !== 'undefined') showTokens = data.showTokens;

  chrome.storage.session.get(['pendingCapture','contextText','summarizePage'], s => {
    if (data.onboardDone || data.groqApiKey) {
      goChat();
      if (s.pendingCapture) applyCapture(s.pendingCapture);
      if (s.contextText) { const t = s.contextText; chrome.storage.session.remove(['contextText']); prefillContext(t); }
      if (s.summarizePage) { const p = s.summarizePage; chrome.storage.session.remove(['summarizePage']); doSummarizePage(p); }
    } else {
      goOnboard();
    }
  });
});

// ══════════════════════════════════════
// NAV
// ══════════════════════════════════════
function goOnboard() { show(screenOnboard); }

function goChat() {
  show(screenChat);
  syncModelGrid();
  updateKeyUI();
  updateSendBtn();
  updateTokenBar();
  renderPromptChips();
  if (sysPromptEl) sysPromptEl.value = systemPrompt;
  if (togLang)   togLang.checked   = autoLang;
  if (togFloat)  togFloat.checked  = showFloat;
  if (togTokens) togTokens.checked = showTokens;
  // Sync float button state
  const floatBtn = $('btn-float');
  if (floatBtn) {
    floatBtn.classList.toggle('active', showFloat);
    floatBtn.dataset.tip = showFloat
      ? 'Floating Button — ACTIVE. A ✦ button is pinned to the page. Click again to remove it.'
      : 'Floating Button — pins a ✦ button to every webpage so you can open AI Vision without clicking the toolbar icon';
  }
}

function goHistory() {
  show(screenHistory);
  renderHistoryList();
}

function goSettings() {
  show(screenSettings);
  if (sKey) sKey.value = apiKey || '';
  if (sysPromptEl) sysPromptEl.value = systemPrompt;
  if (sKeyStatus) sKeyStatus.className = 's-status';
  syncModelGrid();
  renderPromptList();
  populateBrowserInfo();
  populateSessionStats();
  if (togLang)   togLang.checked   = autoLang;
  if (togFloat)  togFloat.checked  = showFloat;
  if (togTokens) togTokens.checked = showTokens;
}

function populateSessionStats() {
  const userMsgs = messages.filter(m => m.role === 'user').length;
  const aiMsgs   = messages.filter(m => m.role === 'assistant').length;
  const tokLimit = 4096;
  const pct = Math.min(Math.round((totalTokens / tokLimit) * 100), 100);

  const sTok = document.getElementById('s-tok-count');
  const sMsg = document.getElementById('s-msg-count');
  const sAi  = document.getElementById('s-ai-count');
  const sMod = document.getElementById('s-model-display');
  const sPct = document.getElementById('s-tok-pct');
  const sBar = document.getElementById('s-tok-bar');

  if (sTok) sTok.textContent = totalTokens.toLocaleString();
  if (sMsg) sMsg.textContent = userMsgs;
  if (sAi)  sAi.textContent  = aiMsgs;
  if (sMod) {
    const shortName = selectedModel.split('/').pop().replace(/-instruct$/,'').replace(/-\d+e$/,'');
    sMod.textContent = shortName;
  }
  if (sPct) sPct.textContent = pct;
  if (sBar) {
    sBar.style.width = pct + '%';
    sBar.style.background = pct > 80
      ? 'linear-gradient(90deg,#f87171,#f472b6)'
      : pct > 50
        ? 'linear-gradient(90deg,#fbbf24,#f472b6)'
        : 'linear-gradient(90deg,var(--accent),var(--accent2))';
  }
}

function show(el) {
  [screenOnboard,screenChat,screenHistory,screenSettings].forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

// ══════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════
obApiInp.addEventListener('input', () => {
  const v = obApiInp.value.trim();
  obCta.disabled = v.length < 5;
  obFb.className = 'ob-fb';
  obCta.innerHTML = v ? '<span>✓</span> Save Key & Start Chatting' : '<span>🔑</span> Save Key to Get Started';
});
function doSaveObKey() {
  const v = obApiInp.value.trim();
  if (!v) { obFb.className='ob-fb err'; obFb.textContent='Please paste your API key first.'; return; }
  if (!v.startsWith('gsk_')) { obFb.className='ob-fb err'; obFb.textContent='Groq keys start with gsk_ — check and retry.'; return; }
  apiKey = v;
  chrome.storage.local.set({ groqApiKey: v, onboardDone: true });
  badge2.textContent='✓'; badge2.className='step-badge done';
  badge3.className='step-badge active'; obStep3.classList.add('active-step');
  obFb.className='ob-fb ok'; obFb.textContent='✓ Key saved! Opening chat…';
  setTimeout(() => goChat(), 700);
}
obSave.addEventListener('click', doSaveObKey);
obCta.addEventListener('click', doSaveObKey);
obApiInp.addEventListener('keydown', e => { if (e.key==='Enter') doSaveObKey(); });
obSkip.addEventListener('click', () => { chrome.storage.local.set({ onboardDone: true }); goChat(); });

// ══════════════════════════════════════
// CHAT HEADER BUTTONS
// ══════════════════════════════════════
$('btn-settings').addEventListener('click', goSettings);
$('btn-history').addEventListener('click', goHistory);
$('btn-new').addEventListener('click', newChat);

$('btn-summarize').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: () => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script,style,nav,footer,header,aside').forEach(el => el.remove());
      return { text: (clone.innerText||'').replace(/\s+/g,' ').trim().slice(0,6000), title: document.title, url: location.href };
    }}).then(r => {
      if (r?.[0]?.result) doSummarizePage(r[0].result);
    }).catch(() => showToast('⚠ Cannot access this page'));
  });
});

$('btn-float').addEventListener('click', () => {
  showFloat = !showFloat;
  chrome.storage.local.set({ showFloat });
  chrome.runtime.sendMessage({ type: 'TOGGLE_FLOATING' });
  const btn = $('btn-float');
  btn.classList.toggle('active', showFloat);
  // Update tooltip to reflect current state
  btn.dataset.tip = showFloat
    ? 'Floating Button — ACTIVE. A ✦ button is pinned to the page. Click again to remove it.'
    : 'Floating Button — pins a ✦ button to every webpage so you can open AI Vision without clicking the toolbar icon';
  showToast(showFloat ? '✦ Floating button enabled' : 'Floating button removed');
});

function newChat() {
  if (currentHistoryId) saveCurrentChat();
  messages = []; totalTokens = 0; currentHistoryId = null;
  messagesEl.querySelectorAll('.msg,.err-msg').forEach(el => el.remove());
  if (welcome) welcome.style.display = '';
  updateTokenBar();
  capturedImage = null;
  capPrev.classList.remove('show');
  captureBtn.classList.remove('on');
  updateSendBtn();
  showToast('New chat');
}

// ══════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════
$('s-back').addEventListener('click', () => goChat());
$('hist-back').addEventListener('click', () => goChat());

sKeySave.addEventListener('click', () => {
  const v = sKey.value.trim();
  if (!v) { showSStatus('err','Please paste your API key.'); return; }
  if (!v.startsWith('gsk_')) { showSStatus('err','Key should start with gsk_'); return; }
  apiKey = v;
  chrome.storage.local.set({ groqApiKey: v, onboardDone: true });
  updateKeyUI(); updateSendBtn();
  showSStatus('ok','✓ API key saved!');
  showToast('✓ Key saved');
  setTimeout(() => { if(sKeyStatus) sKeyStatus.className='s-status'; }, 3000);
});
sKey.addEventListener('keydown', e => { if (e.key==='Enter') sKeySave.click(); });
function showSStatus(t,m) { sKeyStatus.className='s-status '+t; sKeyStatus.textContent=m; }

sysSave.addEventListener('click', () => {
  systemPrompt = sysPromptEl.value.trim() || 'You are a helpful, intelligent AI assistant with vision capabilities. When analyzing images, be detailed and insightful. Format responses clearly using markdown. Be concise but thorough.';
  chrome.storage.local.set({ systemPrompt });
  showToast('✓ System prompt saved');
});

modelGrid.addEventListener('click', e => {
  const chip = e.target.closest('[data-model]');
  if (!chip) return;
  selectedModel = chip.dataset.model;
  chrome.storage.local.set({ selectedModel });
  syncModelGrid();
  showToast('Model: ' + (chip.querySelector('.mc-name')?.textContent || selectedModel));
});

// Prompt library
promptAdd.addEventListener('click', addPrompt);
promptInp.addEventListener('keydown', e => { if (e.key==='Enter') addPrompt(); });
function addPrompt() {
  const v = promptInp.value.trim();
  if (!v) return;
  savedPrompts.push(v);
  chrome.storage.local.set({ savedPrompts });
  promptInp.value = '';
  renderPromptList();
  renderPromptChips();
  showToast('Prompt saved');
}
function renderPromptList() {
  if (!promptList) return;
  promptList.innerHTML = '';
  if (!savedPrompts.length) { promptList.innerHTML = '<div style="font-size:10.5px;color:var(--dim);padding:4px 2px">No saved prompts yet.</div>'; return; }
  savedPrompts.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'prompt-item';
    d.innerHTML = `<span class="prompt-text">${esc(p)}</span><button class="prompt-del" data-idx="${i}" title="Delete">✕</button>`;
    d.querySelector('.prompt-text').addEventListener('click', () => {
      chatInput.value = p;
      chatInput.dispatchEvent(new Event('input'));
      goChat();
      chatInput.focus();
    });
    d.querySelector('.prompt-del').addEventListener('click', e => {
      e.stopPropagation();
      savedPrompts.splice(i, 1);
      chrome.storage.local.set({ savedPrompts });
      renderPromptList(); renderPromptChips();
    });
    promptList.appendChild(d);
  });
}
function renderPromptChips() {
  const chips = $('prompt-chips');
  if (!chips) return;
  const defaults = ['🐛 Debug code', '📄 Summarize page', '💡 Explain this'];
  chips.innerHTML = '';
  defaults.forEach(label => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = label;
    b.dataset.msg = label.replace(/^[^\s]+\s/, '');
    chips.appendChild(b);
  });
  savedPrompts.slice(0,3).forEach(p => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = p.slice(0,22) + (p.length>22?'…':'');
    b.dataset.msg = p;
    chips.appendChild(b);
  });
}

// Toggles
togLang.addEventListener('change', () => { autoLang = togLang.checked; chrome.storage.local.set({ autoLang }); });
togFloat.addEventListener('change', () => { showFloat = togFloat.checked; chrome.storage.local.set({ showFloat }); chrome.runtime.sendMessage({ type: 'TOGGLE_FLOATING' }); });
togTokens.addEventListener('change', () => { showTokens = togTokens.checked; chrome.storage.local.set({ showTokens }); updateTokenBar(); });

function syncModelGrid() {
  if (!modelGrid) return;
  modelGrid.querySelectorAll('[data-model]').forEach(c => c.classList.toggle('sel', c.dataset.model === selectedModel));
}

function populateBrowserInfo() {
  const ua = navigator.userAgent;
  let browser = 'Google Chrome';
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('OPR/')) browser = 'Opera';
  const brEl = $('si-browser'); if (brEl) brEl.textContent = browser;
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs?.[0];
    if (!tab?.url) return;
    try {
      const u = new URL(tab.url);
      const sEl=$('si-site'), secEl=$('si-secure');
      if (sEl) sEl.textContent = u.hostname||tab.url;
      if (secEl) {
        const isChr = u.protocol.startsWith('chrome');
        const isHttp = u.protocol==='https:';
        secEl.innerHTML = isChr ? '<span class="secure-yes">🔒 Internal</span>' : isHttp ? '<span class="secure-yes">🔒 Secure</span>' : '<span class="secure-no">⚠ Not secure</span>';
      }
    } catch {}
  });
}

// ══════════════════════════════════════
// HISTORY
// ══════════════════════════════════════
function saveCurrentChat() {
  if (!messages.length) return;
  const id = currentHistoryId || 'chat-' + Date.now();
  currentHistoryId = id;
  const firstMsg = messages.find(m => m.role==='user');
  const preview = Array.isArray(firstMsg?.content)
    ? (firstMsg.content.find(c=>c.type==='text')?.text || 'Image conversation')
    : (firstMsg?.content || 'Conversation');
  const entry = { id, preview: preview.slice(0,60), messages, date: Date.now() };
  chrome.storage.local.get(['chatHistories'], d => {
    const histories = d.chatHistories || {};
    histories[id] = entry;
    // Keep max 30 conversations
    const keys = Object.keys(histories).sort((a,b) => histories[b].date - histories[a].date);
    if (keys.length > 30) keys.slice(30).forEach(k => delete histories[k]);
    chrome.storage.local.set({ chatHistories: histories });
  });
}

function renderHistoryList() {
  const list = $('hist-list');
  list.innerHTML = '';
  chrome.storage.local.get(['chatHistories'], d => {
    const histories = d.chatHistories || {};
    const sorted = Object.values(histories).sort((a,b) => b.date - a.date);
    if (!sorted.length) {
      list.innerHTML = '<div class="hist-empty">📭 No saved chats yet.<br><br>Start a conversation and it will appear here.</div>';
      return;
    }
    sorted.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'hist-item';
      const date = new Date(entry.date).toLocaleDateString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="hist-item-title">${esc(entry.preview)}</div>
          <button class="hist-item-del" data-id="${entry.id}">✕</button>
        </div>
        <div class="hist-item-meta"><span>${entry.messages.length} messages</span><span>${date}</span></div>`;
      item.addEventListener('click', e => {
        if (e.target.classList.contains('hist-item-del')) return;
        loadChat(entry);
      });
      item.querySelector('.hist-item-del').addEventListener('click', e => {
        e.stopPropagation();
        chrome.storage.local.get(['chatHistories'], d2 => {
          const h = d2.chatHistories || {};
          delete h[entry.id];
          chrome.storage.local.set({ chatHistories: h }, () => renderHistoryList());
        });
      });
      list.appendChild(item);
    });
  });
}

function loadChat(entry) {
  if (currentHistoryId) saveCurrentChat();
  messages = entry.messages;
  currentHistoryId = entry.id;
  totalTokens = 0;
  messagesEl.querySelectorAll('.msg,.err-msg').forEach(el => el.remove());
  if (welcome) welcome.style.display = 'none';
  renderHistory();
  updateTokenBar();
  goChat();
  showToast('Chat loaded');
}

$('hist-clear-all').addEventListener('click', () => {
  if (!confirm('Clear all chat history?')) return;
  chrome.storage.local.remove(['chatHistories'], () => { renderHistoryList(); showToast('History cleared'); });
});

// ══════════════════════════════════════
// CAPTURE
// ══════════════════════════════════════
captureBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'START_CAPTURE' }, () => {
    showToast('🖱 Draw a selection on the page');
    window.close();
  });
});
capRm.addEventListener('click', () => {
  capturedImage = null; capPrev.classList.remove('show'); capImg.src = '';
  captureBtn.classList.remove('on'); updateSendBtn();
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type==='CAPTURE_RESULT' && msg.dataUrl) applyCapture(msg.dataUrl);
});

function applyCapture(dataUrl) {
  chrome.storage.session.remove(['pendingCapture']);
  capturedImage = dataUrl; capImg.src = dataUrl;
  capPrev.classList.add('show'); captureBtn.classList.add('on');
  if (!chatInput.value.trim()) {
    chatInput.value = 'What is shown in this image? Please explain in detail.';
    chatInput.dispatchEvent(new Event('input'));
  }
  updateSendBtn(); showToast('✓ Region captured');
}

function prefillContext(text) {
  if (welcome) welcome.style.display = 'none';
  chatInput.value = `"${text.slice(0,120)}"\n\nPlease explain this.`;
  chatInput.dispatchEvent(new Event('input'));
}

function doSummarizePage(page) {
  if (!page?.text) { showToast('⚠ No page content found'); return; }
  if (welcome) welcome.style.display = 'none';
  const prompt = `Please summarize this webpage:\n\nTitle: ${page.title}\nURL: ${page.url}\n\nContent:\n${page.text}`;
  chatInput.value = '';
  chatInput.dispatchEvent(new Event('input'));
  const userContent = [{ type: 'text', text: prompt }];
  appendMsg('user', { text: `📄 Summarize: ${page.title}` });
  messages.push({ role: 'user', content: userContent });
  setThinking(true);
  callGroq().then(reply => {
    messages.push({ role: 'assistant', content: reply });
    appendMsg('ai', { text: reply });
    saveCurrentChat();
    updateTokenBar();
  }).catch(err => appendError(err.message)).finally(() => setThinking(false));
}

// ══════════════════════════════════════
// SEND
// ══════════════════════════════════════
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 90) + 'px';
  updateSendBtn();
});
chatInput.addEventListener('keydown', e => {
  if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); if(!sendBtn.disabled) sendMessage(); }
});
sendBtn.addEventListener('click', sendMessage);

async function sendMessage() {
  const text = chatInput.value.trim();
  if ((!text && !capturedImage) || !apiKey || isThinking) return;

  const userContent = [];
  if (capturedImage) userContent.push({ type:'image_url', image_url:{ url:capturedImage } });
  if (text) userContent.push({ type:'text', text });

  appendMsg('user', { text, image: capturedImage });
  messages.push({ role:'user', content:userContent });

  chatInput.value = ''; chatInput.style.height = 'auto';
  capturedImage = null; capPrev.classList.remove('show'); capImg.src = ''; captureBtn.classList.remove('on');
  if (welcome) welcome.style.display = 'none';

  setThinking(true);
  try {
    const reply = await callGroq();
    messages.push({ role:'assistant', content:reply });
    appendMsg('ai', { text:reply });
    // Estimate tokens (rough: 4 chars per token)
    totalTokens += Math.round((text.length + reply.length) / 4);
    updateTokenBar();
    saveCurrentChat();
  } catch(err) { appendError(err.message); }
  setThinking(false);
}

async function callGroq() {
  const isGuard = GUARD_MODELS.includes(selectedModel);
  const maxTok  = isGuard ? 512 : 1024;
  const langNote = autoLang ? ' Always respond in the same language the user writes in.' : '';
  const sysMsg = systemPrompt + langNote;

  const body = isGuard ? {
    model: selectedModel,
    messages: [{ role:'user', content: messages.filter(m=>m.role==='user').slice(-1)[0]?.content?.find?.(c=>c.type==='text')?.text || '' }],
    max_tokens: 512, temperature: 0
  } : {
    model: selectedModel,
    messages: [{ role:'system', content:sysMsg }, ...messages],
    max_tokens: maxTok, temperature: 0.7
  };

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e?.error?.message || `API error ${res.status}`); }
  const data = await res.json();
  const raw = data.choices[0]?.message?.content || '';
  if (isGuard) {
    const score = parseFloat(raw);
    if (!isNaN(score)) {
      const pct=(score*100).toFixed(1), level=score>.8?'High':score>.5?'Medium':score>.2?'Low':'Very Low';
      const emoji=score>.8?'🔴':score>.5?'🟠':score>.2?'🟡':'🟢';
      const bar='█'.repeat(Math.round(score*10))+'░'.repeat(10-Math.round(score*10));
      return `**${emoji} Guard Model Result**\n\n**Verdict:** ${score>.5?'⚠ Potentially harmful':'✅ Content appears safe'}\n**Risk Level:** ${level} (${pct}%)\n**Score:** \`${bar}\` ${pct}%\n\n> *100% = harmful, 0% = safe*`;
    }
  }
  return raw || 'No response received.';
}

// ══════════════════════════════════════
// DELEGATED CLICKS
// ══════════════════════════════════════
document.addEventListener('click', e => {
  if (e.target.closest('#feat-capture'))  { captureBtn.click(); return; }
  if (e.target.closest('#feat-summarize')) { $('btn-summarize').click(); return; }

  // Think block toggle
  const toggle = e.target.closest('.think-toggle');
  if (toggle) { const b = toggle.closest('.think-block'); if(b) b.classList.toggle('open'); return; }

  // Copy button
  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) {
    const text = copyBtn.dataset.text;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = '✓ Copied'; copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = '⎘ Copy'; copyBtn.classList.remove('copied'); }, 2000);
    });
    return;
  }

  // Regenerate button
  const regenBtn = e.target.closest('.regen-btn');
  if (regenBtn) { regenLastMessage(); return; }

  // Chip / data-msg
  const el = e.target.closest('[data-msg]');
  if (el && !e.target.closest('#model-grid')) {
    chatInput.value = el.dataset.msg;
    chatInput.dispatchEvent(new Event('input'));
    chatInput.focus();
  }

  // No-key banner
  if (e.target.closest('#no-key-banner')) { goSettings(); return; }
});

async function regenLastMessage() {
  const lastAI = [...messagesEl.querySelectorAll('.msg.ai')].pop();
  if (lastAI) lastAI.remove();
  const lastAiIdx = messages.findLastIndex(m => m.role==='assistant');
  if (lastAiIdx !== -1) messages.splice(lastAiIdx, 1);
  setThinking(true);
  try {
    const reply = await callGroq();
    messages.push({ role:'assistant', content:reply });
    appendMsg('ai', { text:reply });
    saveCurrentChat();
  } catch(err) { appendError(err.message); }
  setThinking(false);
}

// ══════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════
function updateSendBtn() { sendBtn.disabled = (!chatInput.value.trim()&&!capturedImage)||!apiKey||isThinking; }
function updateKeyUI() { const ok=!!apiKey; if(keyDot) keyDot.className='key-dot'+(ok?' ok':''); if(noKeyBanner) noKeyBanner.classList.toggle('hidden',ok); }
function updateTokenBar() { if(tokenBar) tokenBar.style.display=showTokens?'':'none'; if(tokCount) tokCount.textContent=totalTokens; if(msgCount) msgCount.textContent=messages.length; }

function setThinking(on) {
  isThinking=on; updateSendBtn();
  document.querySelector('.app').classList.toggle('thinking',on);
  if(statusSub) statusSub.textContent=on?'Thinking…':'Ready to assist';
  const ind=$('typing-indicator');
  if(on) {
    if(ind) return;
    const d=document.createElement('div'); d.className='msg ai'; d.id='typing-indicator';
    d.innerHTML=`<div class="msg-av">✦</div><div class="msg-inner"><div class="msg-bub"><div class="typing"><span></span><span></span><span></span></div></div></div>`;
    messagesEl.appendChild(d); scrollBottom();
  } else { if(ind) ind.remove(); }
}

function appendMsg(role, content) {
  const d = document.createElement('div');
  d.className = 'msg '+role;
  const time = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const av = role==='user'?'👤':'✦';
  const bodyText = content.text || '';
  let body = '';
  if (content.image) {
    body += `<div class="img-lbl">📸 Captured region</div><img class="msg-img" src="${content.image}" alt="" />`;
    if (bodyText) body += `<div style="margin-top:5px">${esc(bodyText)}</div>`;
  } else {
    body += role==='ai' ? renderAiContent(bodyText) : fmt(bodyText);
  }
  const actions = role==='ai' ? `
    <div class="msg-actions">
      <button class="msg-act-btn copy-btn" data-text="${bodyText.replace(/"/g,'&quot;')}">⎘ Copy</button>
      <button class="msg-act-btn regen-btn">↺ Retry</button>
    </div>` : '';
  d.innerHTML = `<div class="msg-av">${av}</div><div class="msg-inner"><div class="msg-bub">${body}</div>${actions}<div class="msg-time">${time}</div></div>`;
  messagesEl.appendChild(d); scrollBottom();
}

function appendError(msg) {
  const d=document.createElement('div'); d.className='err-msg'; d.innerHTML=`⚠ ${esc(msg)}`; messagesEl.appendChild(d); scrollBottom();
}

function renderHistory() {
  for (const m of messages) {
    if (m.role==='system') continue;
    if (m.role==='user') {
      const c=Array.isArray(m.content)?m.content:[{type:'text',text:m.content}];
      const txt=c.find(x=>x.type==='text'), img=c.find(x=>x.type==='image_url');
      appendMsg('user',{text:txt?.text||'',image:img?.image_url?.url||null});
    } else { appendMsg('ai',{text:typeof m.content==='string'?m.content:''}); }
  }
}

// ── Think block renderer ──
function renderAiContent(raw) {
  let text = raw.replace(/&lt;think&gt;/gi,'<think>').replace(/&lt;\/think&gt;/gi,'</think>');
  const re = /<think\s*>([\s\S]*?)<\/think\s*>/gi;
  const blocks=[]; let m;
  while((m=re.exec(text))!==null) blocks.push(m[1].trim());
  const clean = text.replace(/<think\s*>[\s\S]*?<\/think\s*>/gi,'').trim();
  if (!blocks.length) return fmt(text);
  const id='tb-'+Math.random().toString(36).slice(2,9);
  const preview=esc(blocks[0].slice(0,55));
  const body=blocks.map(b=>esc(b).replace(/\n/g,'<br>')).join('<hr class="md-hr">');
  const thinkHtml=`<div class="think-block" id="${id}"><button class="think-toggle" data-think-id="${id}"><span class="think-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span><span class="think-label">Thinking</span><span class="think-preview">${preview}${blocks[0].length>55?'…':''}</span><span class="think-chevron"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span></button><div class="think-body">${body}</div></div>`;
  return thinkHtml+(clean?fmt(clean):'');
}

function fmt(text) {
  const e=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const il=raw=>e(raw).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/__(.+?)__/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code class="inline-code">$1</code>').replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,'<em>$1</em>');
  const lines=text.split('\n'), out=[], inCode={v:false,lang:'',lines:[]}, num={c:0};
  for (const line of lines) {
    if(line.startsWith('```')) { if(!inCode.v){inCode.v=true;inCode.lang=line.slice(3).trim();inCode.lines=[];}else{inCode.v=false;const lang=inCode.lang?`<span class="code-lang">${e(inCode.lang)}</span>`:'';out.push(`<div class="code-block">${lang}<pre><code>${inCode.lines.map(e).join('\n')}</code></pre></div>`);inCode.lang='';inCode.lines=[];} continue; }
    if(inCode.v){inCode.lines.push(line);continue;}
    if(!line.trim()){num.c=0;out.push('<div class="msg-spacer"></div>');continue;}
    const hm=line.match(/^(#{1,3})\s+(.+)/); if(hm){const sz=['15px','13.5px','12.5px'];out.push(`<div class="md-h" style="font-size:${sz[hm[1].length-1]}">${il(hm[2])}</div>`);num.c=0;continue;}
    const bm=line.match(/^(\s*)[*\-]\s+(.+)/); if(bm){out.push(`<div class="md-bullet"${bm[1].length>0?' style="margin-left:14px"':''}><span class="bullet-dot">•</span><span>${il(bm[2])}</span></div>`);num.c=0;continue;}
    const nm=line.match(/^\s*\d+\.\s+(.+)/); if(nm){num.c++;out.push(`<div class="md-num"><span class="num-badge">${num.c}</span><span>${il(nm[1])}</span></div>`);continue;}
    if(/^[-*_]{3,}$/.test(line.trim())){out.push('<hr class="md-hr">');num.c=0;continue;}
    const qm=line.match(/^>\s*(.+)/); if(qm){out.push(`<div class="md-quote">${il(qm[1])}</div>`);num.c=0;continue;}
    num.c=0; out.push(`<span>${il(line)}</span><br>`);
  }
  if(inCode.v&&inCode.lines.length) out.push(`<div class="code-block"><pre><code>${inCode.lines.map(e).join('\n')}</code></pre></div>`);
  return out.join('');
}

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function scrollBottom(){setTimeout(()=>{messagesEl.scrollTop=messagesEl.scrollHeight;},50);}
function showToast(msg){toastEl.textContent=msg;toastEl.classList.add('show');setTimeout(()=>toastEl.classList.remove('show'),2500);}
