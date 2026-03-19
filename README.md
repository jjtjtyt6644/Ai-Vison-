# Groq Vision AI — Chrome Extension

A sleek AI chat assistant with screen capture capabilities, powered by Groq's ultra-fast inference API. Features a refined glassmorphism UI.

## Features
- 💬 **AI Chat** — Talk with Llama 4, Mixtral, and other Groq-hosted models
- 📸 **Screen Capture** — Draw a selection on any webpage and send it to AI for analysis
- 🎨 **Glassmorphism UI** — Beautiful frosted-glass design
- ⚡ **Blazing Fast** — Groq's LPU delivers near-instant responses
- 💾 **Chat History** — Conversations persist across sessions

## Installation

### 1. Get a Groq API Key
1. Visit [console.groq.com](https://console.groq.com)
2. Sign up / log in
3. Go to **API Keys** → **Create API Key**
4. Copy your key (starts with `gsk_`)

### 2. Load the Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select this `groq-vision-ext` folder
5. The extension icon will appear in your toolbar

### 3. Configure
1. Click the extension icon to open the popup
2. Click the ⚙ settings button
3. Paste your Groq API key
4. Click **Save**

## Usage

### Text Chat
- Type a message and press **Enter** or click the send button
- Shift+Enter for newlines

### Screen Capture
1. Click the **camera icon** in the input area
2. The popup closes — drag to select a region on the page
3. The popup reopens with your capture attached
4. Add an optional message (or use the auto-filled prompt)
5. Send — the AI will analyze and explain what it sees

### Vision-Capable Models
For screen capture analysis, use:
- **Llama 4 Scout** (default) — Best vision model
- **Llama 4 Maverick** — Alternative vision model

For text-only (faster):
- Llama 3.3 70B, Llama 3.1 8B, Mixtral 8x7B

## File Structure
```
groq-vision-ext/
├── manifest.json     # Extension config
├── popup.html        # Main UI
├── popup.js          # Chat logic & Groq API
├── background.js     # Screen capture orchestration
├── content.js        # Page-level script
└── icons/            # Extension icons
```
