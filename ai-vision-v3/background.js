// background.js v2 — AI Vision

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'ask-ai', title: 'Ask AI Vision about "%s"', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'summarize-page', title: 'Summarize this page with AI Vision', contexts: ['page'] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ask-ai' && info.selectionText) {
    chrome.storage.session.set({ contextText: info.selectionText });
    openPopup();
  }
  if (info.menuItemId === 'summarize-page') {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageText })
      .then(results => {
        const text = results?.[0]?.result || '';
        chrome.storage.session.set({ summarizePage: { text: text.slice(0, 6000), title: tab.title, url: tab.url } });
        openPopup();
      });
  }
});

function extractPageText() {
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('script,style,nav,footer,header,aside').forEach(el => el.remove());
  return (clone.innerText || '').replace(/\s+/g, ' ').trim();
}

function openPopup() {
  chrome.action.openPopup?.().catch(() => {
    chrome.windows.create({ url: chrome.runtime.getURL('popup.html'), type: 'popup', width: 420, height: 620 });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_CAPTURE') {
    handleCapture();
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === 'DO_CAPTURE') {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ error: 'No tab' }); return true; }
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, dataUrl => {
      if (chrome.runtime.lastError) { sendResponse({ error: chrome.runtime.lastError.message }); return; }
      cropImage(dataUrl, msg.rect, sender.tab)
        .then(cropped => sendResponse({ dataUrl: cropped }))
        .catch(e => sendResponse({ error: e.message }));
    });
    return true;
  }
  if (msg.type === 'CAPTURE_RESULT') {
    chrome.storage.session.set({ pendingCapture: msg.dataUrl });
    openPopup();
    return false;
  }
  if (msg.type === 'TOGGLE_FLOATING') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: toggleFloatingBtn });
    });
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === 'OPEN_POPUP') {
    openPopup();
    return false;
  }
  return false;
});

async function handleCapture() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: startSelectionOverlay });
}

function startSelectionOverlay() {
  if (document.getElementById('groq-capture-overlay')) document.getElementById('groq-capture-overlay').remove();
  const overlay = document.createElement('div');
  overlay.id = 'groq-capture-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,.25);backdrop-filter:blur(1px);';
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(15,15,30,.92);border:1px solid rgba(167,139,250,.4);border-radius:12px;color:#f1f5f9;font-family:-apple-system,sans-serif;font-size:13px;font-weight:500;padding:10px 20px;backdrop-filter:blur(20px);z-index:2147483647;pointer-events:none;white-space:nowrap;box-shadow:0 4px 24px rgba(0,0,0,.4);';
  banner.innerHTML = '✦ Drag to select a region &nbsp;•&nbsp; <span style="color:#a78bfa">ESC</span> to cancel';
  const sel = document.createElement('div');
  sel.style.cssText = 'position:fixed;border:2px solid #a78bfa;background:rgba(167,139,250,.1);display:none;pointer-events:none;z-index:2147483647;border-radius:4px;';
  document.body.append(overlay, banner, sel);
  let sx=0,sy=0,drag=false;
  overlay.addEventListener('mousedown', e => { e.preventDefault(); drag=true; sx=e.clientX; sy=e.clientY; sel.style.display='block'; });
  overlay.addEventListener('mousemove', e => {
    if (!drag) return;
    const x=Math.min(e.clientX,sx),y=Math.min(e.clientY,sy),w=Math.abs(e.clientX-sx),h=Math.abs(e.clientY-sy);
    sel.style.left=x+'px'; sel.style.top=y+'px'; sel.style.width=w+'px'; sel.style.height=h+'px';
  });
  overlay.addEventListener('mouseup', e => {
    if (!drag) return; drag=false;
    const rect={x:Math.min(e.clientX,sx),y:Math.min(e.clientY,sy),w:Math.abs(e.clientX-sx),h:Math.abs(e.clientY-sy)};
    cleanup();
    if (rect.w<10||rect.h<10) return;
    chrome.runtime.sendMessage({type:'DO_CAPTURE',rect}, r => { if (r?.dataUrl) chrome.runtime.sendMessage({type:'CAPTURE_RESULT',dataUrl:r.dataUrl}); });
  });
  document.addEventListener('keydown', e => { if (e.key==='Escape') cleanup(); }, {once:true});
  function cleanup() { overlay.remove(); banner.remove(); sel.remove(); }
}

function toggleFloatingBtn() {
  const ex = document.getElementById('ai-vision-float-wrap');
  if (ex) { ex.remove(); return; }

  // Inject keyframe styles once
  if (!document.getElementById('ai-vision-float-style')) {
    const style = document.createElement('style');
    style.id = 'ai-vision-float-style';
    style.textContent = `
      @keyframes aiv-pulse {
        0%   { transform: scale(1);    box-shadow: 0 0 0 0   rgba(167,139,250,.7); }
        50%  { transform: scale(1.06); box-shadow: 0 0 0 10px rgba(167,139,250,.0); }
        100% { transform: scale(1);    box-shadow: 0 0 0 0   rgba(167,139,250,.0); }
      }
      @keyframes aiv-ring {
        0%   { transform: scale(1);   opacity: .6; }
        100% { transform: scale(2.2); opacity: 0;  }
      }
      @keyframes aiv-shimmer {
        0%   { background-position: -200% center; }
        100% { background-position:  200% center; }
      }
      #ai-vision-float-wrap {
        position: fixed; bottom: 24px; right: 24px;
        width: 48px; height: 48px;
        z-index: 2147483646;
        cursor: pointer;
      }
      #ai-vision-float-ring {
        position: absolute; inset: 0;
        border-radius: 50%;
        background: rgba(167,139,250,.4);
        animation: aiv-ring 2s ease-out infinite;
        pointer-events: none;
      }
      #ai-vision-float-btn {
        position: relative;
        width: 48px; height: 48px;
        border-radius: 15px;
        background: linear-gradient(135deg, #a78bfa, #60a5fa);
        background-size: 200% auto;
        color: #fff; font-size: 21px;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 20px rgba(167,139,250,.55);
        animation: aiv-pulse 2.5s ease-in-out infinite, aiv-shimmer 3s linear infinite;
        transition: transform .2s, border-radius .2s;
        user-select: none;
      }
      #ai-vision-float-btn:hover {
        transform: scale(1.12) !important;
        border-radius: 12px;
        animation-play-state: paused;
      }
      #ai-vision-float-tooltip {
        position: absolute; bottom: 56px; right: 0;
        background: rgba(14,14,30,.97); color: #f1f5f9;
        font-family: -apple-system, sans-serif; font-size: 11px; line-height: 1.45;
        padding: 7px 11px; border-radius: 9px;
        border: 1px solid rgba(167,139,250,.25);
        box-shadow: 0 4px 16px rgba(0,0,0,.5);
        width: 180px; pointer-events: none;
        opacity: 0; transform: translateY(4px);
        transition: opacity .2s, transform .2s;
        white-space: normal;
      }
      #ai-vision-float-wrap:hover #ai-vision-float-tooltip {
        opacity: 1; transform: translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  const wrap = document.createElement('div');
  wrap.id = 'ai-vision-float-wrap';

  const ring = document.createElement('div');
  ring.id = 'ai-vision-float-ring';

  const btn = document.createElement('div');
  btn.id = 'ai-vision-float-btn';
  btn.innerHTML = '✦';

  const tip = document.createElement('div');
  tip.id = 'ai-vision-float-tooltip';
  tip.innerHTML = '<strong style="display:block;margin-bottom:2px">AI Vision</strong>Click to open the AI assistant popup';

  wrap.append(ring, btn, tip);
  document.body.appendChild(wrap);

  wrap.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }));
}

async function cropImage(dataUrl, rect, tab) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (url, r) => new Promise(res => {
        const img = new Image();
        img.onload = () => {
          const s = window.devicePixelRatio||1, c = document.createElement('canvas');
          c.width=r.w*s; c.height=r.h*s;
          c.getContext('2d').drawImage(img,r.x*s,r.y*s,r.w*s,r.h*s,0,0,r.w*s,r.h*s);
          res(c.toDataURL('image/jpeg',.92));
        };
        img.onerror = () => res(url);
        img.src = url;
      }),
      args: [dataUrl, rect]
    }).then(results => resolve(results[0].result)).catch(reject);
  });
}
