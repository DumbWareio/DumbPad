# DumbPad

A stupid simple, no auth (unless you want it!), modern notepad application with auto-save functionality and dark mode support.

<p align="center">
  <img src="https://img.shields.io/github/package-json/v/dumbwareio/dumbpad" alt="GitHub package.json version" />
  <a href="https://hub.docker.com/r/dumbwareio/dumbpad" target="_blank"><img src="https://img.shields.io/docker/v/dumbwareio/dumbpad?logo=docker&label=Docker" alt="Docker Image Version" /></a>
  <img src="https://img.shields.io/docker/pulls/dumbwareio/dumbpad" alt="Docker Pulls" />
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="License" />
  <img src="https://img.shields.io/github/actions/workflow/status/dumbwareio/dumbpad/docker-publish.yml" alt="GitHub Actions Workflow Status" />
  <!-- <a href="https://dumbpad.dumbware.io/" target="_blank">
    <img alt="Static Badge" src="https://img.shields.io/badge/demo-site?label=dumbpad" />
  </a> -->
</p>

![image](https://github.com/user-attachments/assets/baf945a8-327b-472a-abf9-bf03af6e7079)

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [Option 1: Docker](#option-1-docker-for-dummies)
  - [Option 2: Docker Compose](#option-2-docker-compose-for-dummies-who-like-customizing)
  - [Option 3: Running Locally](#option-3-running-locally-for-developers)
- [Configuration](#configuration)
- [Security](#security)
- [Technical Details](#technical-details)
- [Links](#links)
- [Contributing](#contributing)
- [Future Features](#future-features)

## Features

- Simple, clean interface
- Auto-saving
- Dark mode support
- Responsive design
- Docker support
- Optional PIN protection (4-10 digits)
- File-based storage
- Data persistence across updates
- Markdown Formatting with enhanced support
  - GitHub-style alert blocks (Note, Tip, Important, Warning, Caution)
  - Extended table formatting
  - Auto-expand collapsible details in print (configurable)
  - Code syntax highlighting in `fenced codeblocks`
- Direct notepad linking with URL parameters
- Copy shareable notepad links
- Browser navigation support (back/forward buttons)
- Fuzzy Search (by filename and file contents)
- PWA Support with automatic cache updates

## Quick Start

### Prerequisites

- Docker (recommended)
- Node.js >=20.0.0 (for local development)

### Option 1: Docker (For Dummies)

```bash
# Pull and run with one command
docker run -p 3000:3000 \
  -v ./data:/app/data \
  dumbwareio/dumbpad:latest
```

1. Go to http://localhost:3000
2. Start typing - Your notes auto-save
3. Marvel at how dumb easy this was

### Option 2: Docker Compose (For Dummies who like customizing)

Create a `docker-compose.yml` file:

```yaml
services:
  dumbpad:
    image: dumbwareio/dumbpad:latest
    container_name: dumbpad
    restart: unless-stopped
    ports:
      - ${DUMBPAD_PORT:-3000}:3000
    volumes:
      - ${DUMBPAD_DATA_PATH:-./data}:/app/data
    environment:
      # The title shown in the web interface
      SITE_TITLE: ${DUMBPAD_SITE_TITLE:-DumbPad}
      # Optional PIN protection (leave empty to disable)
      DUMBPAD_PIN: ${DUMBPAD_PIN:-}
      # The base URL for the application
      BASE_URL: ${DUMBPAD_BASE_URL:-http://localhost:3000} # Use ALLOWED_ORIGINS below to restrict cors to specific origins
      # (OPTIONAL)
      # Usage: Comma-separated list of urls: http://localhost:port,http://internalip:port,https://base.proxy.tld,https://authprovider.domain.tld
      # ALLOWED_ORIGINS: ${DUMBPAD_ALLOWED_ORIGINS:-http://localhost:3000} # Comment out to allow all origins (*)
      # LOCKOUT_TIME: ${DUMBPAD_LOCK_TIME:-15} # Customize pin lockout time (if empty, defaults to 15 in minutes)
      # MAX_ATTEMPTS: ${DUMBPAD_MAX_ATTEMPTS:-5} # Customize pin max attempts (if empty, defaults to 5)
      # COOKIE_MAX_AGE: ${DUMBPAD_COOKIE_MAX_AGE:-24} # Customize maximum age of cookies primarily used for pin verification (default 24) in hours
      # PAGE_HISTORY_COOKIE_AGE: ${DUMBPAD_PAGE_HISTORY_COOKIE_AGE:-365} # Customize age of cookie to show the last notepad opened (default 365 | max 400) in days - shows default notepad on load if expired
```

Then run:

```bash
docker compose up -d
```

1. Go to http://localhost:3000
2. Start typing - Your notes auto-save
3. Rejoice in the glory of your dumb notes

### Option 3: Running Locally (For Developers)

1. Install dependencies:

```bash
npm install
```

2. Set environment variables in `.env` or `cp .env.example .env`:

```bash
PORT=3000                  # Port to run the server on
DUMBPAD_PIN=1234          # Optional PIN protection
SITE_TITLE=DumbPad        # Custom site title
BASE_URL=http://localhost:3000  # Base URL for the application
```

3. Start the server:

```bash
npm start
```

#### Windows Users

If you're using Windows PowerShell with Docker, use this format for paths:

```powershell
docker run -p 3000:3000 -v "${PWD}\data:/app/data" dumbwareio/dumbpad:latest
```

## Features

- 📝 Auto-saving notes
- 🌓 Dark/Light mode support
- 🔒 Optional PIN protection
- 📱 Mobile-friendly interface / PWA Support
- 🗂️ Multiple notepads
- 📄 Enhanced Markdown Formatting with GitHub-style alerts and extended tables
- 🔗 Direct notepad linking with shareable URLs
- 🧭 Browser navigation support (back/forward buttons)
- ⬇️ Download notes as text or markdown files
- �️ Print functionality with auto-expanded collapsible sections
- �🔍 Fuzzy Search by name or contents
- 🔄 Real-time saving
- 💽 Add .txt files into data folder to import (requires page refresh)
- ⚡ Zero dependencies on client-side
- 🛡️ Built-in security features
- 🎨 Clean, modern interface
- 📦 Docker support with easy configuration
- 🌐 Optional CORS support
- ⚙️ Customizable settings
- 🔄 Automatic cache updates and version management

## Configuration

### Environment Variables

| Variable                | Description                                                  | Default               | Required |
| ----------------------- | ------------------------------------------------------------ | --------------------- | -------- |
| PORT                    | Server port                                                  | 3000                  | No       |
| BASE_URL                | Base URL for the application                                 | http://localhost:PORT | Yes      |
| DUMBPAD_PIN             | PIN protection (4-10 digits)                                 | None                  | No       |
| SITE_TITLE              | Site title displayed in header                               | DumbPad               | No       |
| NODE_ENV                | Node environment mode (development or production)            | production            | No       |
| ALLOWED_ORIGINS         | Allowed CORS origins (`*` for all or comma-separated list)   | \*                    | No       |
| LOCKOUT_TIME            | Lockout time after max PIN attempts (in minutes)             | 15                    | No       |
| MAX_ATTEMPTS            | Maximum PIN entry attempts before lockout                    | 5                     | No       |
| COOKIE_MAX_AGE          | Maximum age of authentication cookies (in hours)             | 24                    | No       |
| PAGE_HISTORY_COOKIE_AGE | Age of cookie storing last opened notepad (in days, max 400) | 365                   | No       |

## Security

### Features

- Variable-length PIN support (4-10 digits)
- Constant-time PIN comparison
- Brute force protection:
  - 5 attempts maximum
  - 15-minute lockout after failed attempts
  - IP-based tracking
- Secure cookie handling
- No client-side PIN storage
- Rate limiting
- Collaborative editing
- CORS support for origin restrictions (optional)

## User Settings

Access settings via the gear icon (⚙️) in the header or use keyboard shortcut:

- **Windows/Linux**: `Ctrl+Alt+,`
- **macOS**: `Cmd+Ctrl+,`

### Available Settings

| Setting                        | Description                                              | Default  | Options                   |
| ------------------------------ | -------------------------------------------------------- | -------- | ------------------------- |
| **Auto-save Status Interval**  | Time interval for auto-save notifications (0 = disabled) | 1000ms   | Any number (milliseconds) |
| **Remote Connection Messages** | Show notifications when users connect/disconnect         | Enabled  | Enabled/Disabled          |
| **Disable Print Expansion**    | Prevent auto-expanding collapsed sections when printing  | Disabled | Enabled/Disabled          |
| **Default Markdown Preview**   | Start in markdown preview mode by default                | Disabled | Enabled/Disabled          |

### Notepad Management

- **Unique Names**: Notepad names are automatically made unique by the server. If you try to create or rename a notepad with an existing name, the server will append a suffix (e.g., "Note-1", "Note-2")
- **Name Validation**: The server handles all name validation and uniqueness checks. The frontend will display a notification if your requested name was modified
- **Auto-save**: Changes are automatically saved every 300ms after you stop typing, with periodic saves every 2 seconds
- **Persistence**: All settings are stored in your browser's local storage and persist across sessions

## Technical Details

### Stack

- **Backend**: Node.js (>=20.0.0) with Express
- **Frontend**: Vanilla JavaScript (ES6+) with enhanced markdown support
- **Container**: Docker with multi-stage builds
- **Security**: Express security middleware
- **Storage**: File-based with auto-save
- **Theme**: Dynamic dark/light mode with system preference support
- **PWA**: Service Worker with automatic cache updates and version management
- **Markdown**: Enhanced with alert blocks, extended tables, and collapsible content
- **Real-time**: WebSocket-based collaboration and live updates
- **Navigation**: SPA-style routing with shareable URLs and browser history support
- **Print**: Advanced print preview with auto-expanding collapsible content and theme preservation

### Dependencies

- express: Web framework
- cors: Cross-origin resource sharing
- dotenv: Environment configuration
- cookie-parser: Cookie handling
- express-rate-limit: Rate limiting
- marked: Markdown formatting
- marked-alert: GitHub-style alert blocks for markdown
- marked-extended-tables: Enhanced table support for markdown
- marked-highlight: Syntax highlighting for code blocks in markdown
- @highlightjs/cdn-assets: Highlight.js assets for code syntax highlighting
- fuse.js: Fuzzy searching
- ws: WebSocket support for real-time collaboration

The `data` directory contains:

- `notepads.json`: List of all notepads
- Individual `.txt` files for each notepad's content
- Drop in .txt files to import notes (requires page refresh)

⚠️ Important: Never delete the `data` directory when updating! This is where all your notes are stored.

## Usage

### Basic Operations

- **Start typing**: Notes auto-save as you type (every 300ms after stopping, with periodic saves every 2 seconds)
- **Theme toggle**: Switch between light/dark mode with the toggle button
- **Force save**: `Ctrl+S` (or `Cmd+S` on Mac)
- **Search**: `Ctrl+K` (or `Cmd+K`) to open fuzzy search across all notepads
- **Copy link**: Click the link button (🔗) to copy the current notepad's shareable URL
- **Settings**: Click the gear icon (⚙️) or use `Ctrl+Alt+,` (or `Cmd+Ctrl+,`)

### Notepad Management

- **Create**: Click the + button or `Ctrl+Alt+N` (or `Cmd+Ctrl+N`)
- **Rename**: Click rename button or `Ctrl+Alt+R` (or `Cmd+Ctrl+R`)
- **Delete**: Click delete button or `Ctrl+Alt+X` (or `Cmd+Ctrl+X`)
- **Navigate**: Use dropdown, arrow keys (`Ctrl+Alt+↑/↓`), or browser back/forward buttons
- **Download**: Click download button or `Ctrl+Alt+A` (or `Cmd+Ctrl+A`) for .txt/.md export
- **Print**: `Ctrl+P` (or `Cmd+P`) with enhanced formatting and auto-expanded collapsible sections

### Markdown Enhancements

DumbPad now supports enhanced markdown features:

#### GitHub-Style Alert Blocks

```markdown
> [!NOTE]
> This is a note alert block

> [!TIP]
> This is a tip alert block

> [!IMPORTANT]
> This is an important alert block

> [!WARNING]
> This is a warning alert block

> [!CAUTION]
> This is a caution alert block
```

#### Extended Table Support

- Advanced table formatting with alignment
- Enhanced styling for better readability

#### Collapsible Details

```markdown
<details>
<summary>Click to expand</summary>
Content that will be automatically expanded when printing
</details>
```

#### Code Syntax Highlighting

````markdown
```javascript
console.log("Hello, world!");
```
````

### URL Parameters

- **Direct notepad linking**: `?id=notepadname` - Opens a specific notepad by name (case-insensitive)
- **Browser navigation**: Use back/forward buttons to navigate between notepads
- **Shareable URLs**: Copy links to share specific notepads with others

## Technical Details

- Backend: Node.js with Express
- Frontend: Vanilla JavaScript
- Storage: File-based storage in `data` directory
- Styling: Modern CSS with CSS variables for theming
- Security: Constant-time PIN comparison, brute force protection

## Links

- GitHub: [github.com/dumbwareio/dumbpad](https://github.com/dumbwareio/dumbpad)
- Docker Hub: [hub.docker.com/r/dumbwareio/dumbpad](https://hub.docker.com/r/dumbwareio/dumbpad)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using conventional commits
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See Development Guide for local setup and guidelines.

---

Made with ❤️ by DumbWare.io

## 🌐 Check Us Out

- **Website:** [dumbware.io](https://www.dumbware.io/)
- **Join the Chaos:** [Discord](https://discord.gg/zJutzxWyq2) 💬

## Support the Project

<a href="https://www.buymeacoffee.com/dumbware" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60">
</a>

## Future Features

- File attachments
- Markdown code syntax highlighting

> Got an idea? Open an issue or submit a PR

```

```
