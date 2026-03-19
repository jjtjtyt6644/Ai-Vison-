// background.js — Service Worker

// Handle capture initiation from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_CAPTURE') {
    handleCapture();
    sendResponse({ ok: true });
  }
  return true;
});

async function handleCapture() {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Inject content script and trigger selection UI
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: startSelectionOverlay
    });
  } catch (err) {
    console.error('Capture error:', err);
  }
}

// This function runs in the page context
function startSelectionOverlay() {
  // Avoid duplicate overlays
  if (document.getElementById('groq-capture-overlay')) {
    document.getElementById('groq-capture-overlay').remove();
  }

  const overlay = document.createElement('div');
  overlay.id = 'groq-capture-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    cursor: crosshair;
    background: rgba(0,0,0,0.25);
    backdrop-filter: blur(1px);
  `;

  // Instruction banner
  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15,15,30,0.9);
    border: 1px solid rgba(167,139,250,0.4);
    border-radius: 12px;
    color: #f1f5f9;
    font-family: -apple-system, sans-serif;
    font-size: 13px;
    font-weight: 500;
    padding: 10px 20px;
    backdrop-filter: blur(20px);
    box-shadow: 0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
    letter-spacing: 0.01em;
    z-index: 2147483647;
    pointer-events: none;
    white-space: nowrap;
  `;
  banner.innerHTML = '✦ Drag to select a region &nbsp;•&nbsp; <span style="color:#a78bfa">ESC</span> to cancel';

  // Selection rectangle
  const selection = document.createElement('div');
  selection.style.cssText = `
    position: fixed;
    border: 2px solid #a78bfa;
    background: rgba(167,139,250,0.1);
    box-shadow: 0 0 0 1px rgba(167,139,250,0.3), inset 0 0 20px rgba(167,139,250,0.05);
    display: none;
    pointer-events: none;
    z-index: 2147483647;
    border-radius: 4px;
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(banner);
  document.body.appendChild(selection);

  let startX = 0, startY = 0;
  let isDragging = false;

  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    selection.style.display = 'block';
    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';
    selection.style.width = '0';
    selection.style.height = '0';
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    selection.style.left = x + 'px';
    selection.style.top = y + 'px';
    selection.style.width = w + 'px';
    selection.style.height = h + 'px';
  });

  overlay.addEventListener('mouseup', async (e) => {
    if (!isDragging) return;
    isDragging = false;

    const rect = {
      x: Math.min(e.clientX, startX),
      y: Math.min(e.clientY, startY),
      w: Math.abs(e.clientX - startX),
      h: Math.abs(e.clientY - startY)
    };

    cleanup();

    if (rect.w < 10 || rect.h < 10) return; // Too small

    // Capture via html2canvas or canvas approach
    await captureRegion(rect);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cleanup();
  }, { once: true });

  async function captureRegion(rect) {
    try {
      // Use chrome.tabs.captureVisibleTab via messaging to background
      chrome.runtime.sendMessage({ type: 'DO_CAPTURE', rect }, (response) => {
        if (response && response.dataUrl) {
          chrome.runtime.sendMessage({ type: 'CAPTURE_RESULT', dataUrl: response.dataUrl });
        }
      });
    } catch (err) {
      console.error('Capture region error:', err);
    }
  }

  function cleanup() {
    overlay.remove();
    banner.remove();
    selection.remove();
  }
}

// Handle actual screen capture from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'DO_CAPTURE') {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ error: 'No tab' }); return true; }

    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }

      // Crop the image to the selected rect
      cropImage(dataUrl, msg.rect, sender.tab).then(croppedUrl => {
        sendResponse({ dataUrl: croppedUrl });
      }).catch(err => {
        sendResponse({ error: err.message });
      });
    });

    return true; // async
  }

  return false;
});

async function cropImage(dataUrl, rect, tab) {
  // Use offscreen canvas via a content script eval
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (url, r, dpr) => {
        return new Promise((res) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = dpr || window.devicePixelRatio || 1;
            canvas.width = r.w * scale;
            canvas.height = r.h * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, r.x * scale, r.y * scale, r.w * scale, r.h * scale, 0, 0, r.w * scale, r.h * scale);
            res(canvas.toDataURL('image/jpeg', 0.92));
          };
          img.onerror = () => res(url);
          img.src = url;
        });
      },
      args: [dataUrl, rect, null]
    }).then(results => {
      resolve(results[0].result);
    }).catch(reject);
  });
}

// Forward CAPTURE_RESULT from content to the extension popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CAPTURE_RESULT') {
    // Store temporarily so popup can retrieve on re-open
    chrome.storage.session.set({ pendingCapture: msg.dataUrl });

    // Open popup
    chrome.action.openPopup?.().catch(() => {
      // Fallback: create popup window
      chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: 420,
        height: 620
      });
    });
  }
});
