// popup.js — Groq Vision AI Extension

let apiKey = '';
let selectedModel = 'meta-llama/llama-4-scout-17b-16e-instruct';
let messages = [];
let capturedImage = null;
let isThinking = false;

const $ = id => document.getElementById(id);

// DOM elements
const settingsToggle = $('settings-toggle');
const apiPanel = $('api-panel');
const apiKeyInput = $('api-key-input');
const saveKeyBtn = $('save-key');
const modelSelect = $('model-select');
const messagesEl = $('messages');
const chatInput = $('chat-input');
const sendBtn = $('send-btn');
const captureBtn = $('capture-btn');
const capturePreview = $('capture-preview');
const captureImg = $('capture-img');
const removeCapture = $('remove-capture');
const statusSub = $('status-sub');
const toastEl = $('toast');
const welcome = $('welcome');

// Check for pending capture from screen selection
chrome.storage.session.get(['pendingCapture'], (data) => {
  if (data.pendingCapture) {
    capturedImage = data.pendingCapture;
    captureImg.src = data.pendingCapture;
    capturePreview.classList.add('show');
    captureBtn.classList.add('active');
    chatInput.value = 'What is shown in this captured region? Please explain in detail.';
    chatInput.dispatchEvent(new Event('input'));
    showToast('✓ Screen capture ready');
    // Clear the pending capture
    chrome.storage.session.remove(['pendingCapture']);
  }
});

// Load saved settings
chrome.storage.local.get(['groqApiKey', 'selectedModel', 'chatHistory'], (data) => {
  if (data.groqApiKey) {
    apiKey = data.groqApiKey;
    apiKeyInput.value = data.groqApiKey;
    updateSendBtn();
  }
  if (data.selectedModel) {
    selectedModel = data.selectedModel;
    modelSelect.value = selectedModel;
  }
  if (data.chatHistory && data.chatHistory.length > 0) {
    messages = data.chatHistory;
    renderHistory();
  }
});

// Settings toggle
settingsToggle.addEventListener('click', () => {
  apiPanel.classList.toggle('show');
});

// Save API key
saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key.startsWith('gsk_') && key.length > 0) {
    showToast('⚠ Key should start with gsk_');
    return;
  }
  apiKey = key;
  chrome.storage.local.set({ groqApiKey: key });
  showToast('✓ API key saved');
  apiPanel.classList.remove('show');
  updateSendBtn();
});

// Model selection
modelSelect.addEventListener('change', () => {
  selectedModel = modelSelect.value;
  chrome.storage.local.set({ selectedModel });
});

// Auto-resize textarea
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
  updateSendBtn();
});

// Enter to send
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

// Suggestion chips
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('suggestion-chip')) {
    const msg = e.target.dataset.msg;
    chatInput.value = msg;
    chatInput.dispatchEvent(new Event('input'));
    chatInput.focus();
  }
});

// Send button
sendBtn.addEventListener('click', sendMessage);

// Capture button
captureBtn.addEventListener('click', initiateCapture);

// Remove capture
removeCapture.addEventListener('click', () => {
  capturedImage = null;
  capturePreview.classList.remove('show');
  captureImg.src = '';
  captureBtn.classList.remove('active');
  updateSendBtn();
});

function updateSendBtn() {
  const hasText = chatInput.value.trim().length > 0;
  const hasCapture = !!capturedImage;
  const hasKey = !!apiKey;
  sendBtn.disabled = (!hasText && !hasCapture) || !hasKey || isThinking;
}

// Listen for captured image from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CAPTURE_RESULT' && msg.dataUrl) {
    capturedImage = msg.dataUrl;
    captureImg.src = msg.dataUrl;
    capturePreview.classList.add('show');
    captureBtn.classList.add('active');
    updateSendBtn();
    showToast('✓ Region captured');

    // If no text typed, auto-fill a prompt
    if (!chatInput.value.trim()) {
      chatInput.value = 'What is shown in this image? Please explain in detail.';
      chatInput.dispatchEvent(new Event('input'));
    }
  }
});

async function initiateCapture() {
  // Send message to background to start capture flow
  chrome.runtime.sendMessage({ type: 'START_CAPTURE' }, (response) => {
    if (chrome.runtime.lastError) {
      showToast('⚠ Could not start capture');
    } else {
      showToast('🖱 Draw a selection on the page');
      // Close popup briefly so user can select screen area
      window.close();
    }
  });
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if ((!text && !capturedImage) || !apiKey || isThinking) return;

  const userContent = [];
  if (capturedImage) {
    userContent.push({
      type: 'image_url',
      image_url: { url: capturedImage }
    });
  }
  if (text) {
    userContent.push({ type: 'text', text });
  }

  // Display user message
  const displayContent = { text, image: capturedImage };
  appendMessage('user', displayContent);
  messages.push({ role: 'user', content: userContent });

  // Clear input
  chatInput.value = '';
  chatInput.style.height = 'auto';
  capturedImage = null;
  capturePreview.classList.remove('show');
  captureImg.src = '';
  captureBtn.classList.remove('active');

  // Hide welcome
  if (welcome) welcome.style.display = 'none';

  setThinking(true);

  try {
    const response = await callGroq();
    const aiText = response;
    messages.push({ role: 'assistant', content: aiText });
    appendMessage('ai', { text: aiText });

    // Save history (keep last 20 messages)
    const trimmed = messages.slice(-20);
    chrome.storage.local.set({ chatHistory: trimmed });
  } catch (err) {
    appendError(err.message);
  }

  setThinking(false);
}

async function callGroq() {
  // Build messages array for API — convert image_url to base64 format for vision models
  const apiMessages = messages.map(m => {
    if (Array.isArray(m.content)) {
      const content = m.content.map(c => {
        if (c.type === 'image_url') {
          return {
            type: 'image_url',
            image_url: { url: c.image_url.url }
          };
        }
        return c;
      });
      return { role: m.role, content };
    }
    return m;
  });

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful, intelligent AI assistant with vision capabilities. When analyzing images, be detailed and insightful. Format your responses clearly using markdown where helpful. Be concise but thorough.'
        },
        ...apiMessages
      ],
      max_tokens: 1024,
      temperature: 0.7,
      stream: false
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errMsg = err?.error?.message || `API Error ${res.status}`;
    throw new Error(errMsg);
  }

  const data = await res.json();
  return data.choices[0]?.message?.content || 'No response received.';
}

function setThinking(thinking) {
  isThinking = thinking;
  updateSendBtn();

  if (thinking) {
    document.querySelector('.app').classList.add('thinking');
    statusSub.textContent = 'Thinking…';
    const typingDiv = document.createElement('div');
    typingDiv.className = 'msg ai';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = `
      <div class="msg-avatar">✦</div>
      <div class="msg-bubble">
        <div class="typing">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    messagesEl.appendChild(typingDiv);
    scrollToBottom();
  } else {
    document.querySelector('.app').classList.remove('thinking');
    statusSub.textContent = 'Ready to assist';
    const indicator = $('typing-indicator');
    if (indicator) indicator.remove();
  }
}

function appendMessage(role, content) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const avatar = role === 'user' ? '👤' : '✦';

  let innerHtml = `<div class="msg-avatar">${avatar}</div>`;
  innerHtml += `<div style="max-width:78%">`;
  innerHtml += `<div class="msg-bubble">`;

  if (content.image) {
    innerHtml += `<div class="image-label">📸 Captured screen</div>`;
    innerHtml += `<img class="msg-image" src="${content.image}" alt="Captured region" />`;
    if (content.text) innerHtml += `<div style="margin-top:6px">${escapeHtml(content.text)}</div>`;
  } else {
    innerHtml += formatText(content.text || '');
  }

  innerHtml += `</div>`;
  innerHtml += `<div class="msg-time">${time}</div>`;
  innerHtml += `</div>`;

  div.innerHTML = innerHtml;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function appendError(msg) {
  const div = document.createElement('div');
  div.className = 'error-msg';
  div.innerHTML = `⚠ ${escapeHtml(msg)}`;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function renderHistory() {
  if (welcome) welcome.style.display = 'none';

  for (const m of messages) {
    if (m.role === 'system') continue;

    if (m.role === 'user') {
      if (Array.isArray(m.content)) {
        const textPart = m.content.find(c => c.type === 'text');
        const imgPart = m.content.find(c => c.type === 'image_url');
        appendMessage('user', {
          text: textPart?.text || '',
          image: imgPart?.image_url?.url || null
        });
      } else {
        appendMessage('user', { text: m.content });
      }
    } else {
      appendMessage('ai', { text: m.content });
    }
  }
}

function formatText(text) {
  // Simple markdown-ish formatting
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
    .replace(/\n/g, '<br>');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scrollToBottom() {
  setTimeout(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }, 50);
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2500);
}
