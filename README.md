# DumbPad

A stupid simple, no auth (unless you want it!), modern notepad application with auto-save functionality and dark mode support.

![image](https://github.com/user-attachments/assets/c7138bc4-3a9f-456a-a049-67a03a2f45a5)

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
- Markdown Formatting
- Fuzzy Search (by filename and file contents)
- PWA Support

## Quick Start

### Prerequisites

* Docker (recommended)
* Node.js >=20.0.0 (for local development)

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

* 📝 Auto-saving notes
* 🌓 Dark/Light mode support
* 🔒 Optional PIN protection
* 📱 Mobile-friendly interface / PWA Support
* 🗂️ Multiple notepads
* 📄 Markdown Formatting
* ⬇️ Download notes as text or markdown files
* 🔍 Fuzzy Search by name or contents
* 🖨️ Print functionality
* 🔄 Real-time saving
* 💽 Add .txt files into data folder to import (requires page refresh) 
* ⚡ Zero dependencies on client-side
* 🛡️ Built-in security features
* 🎨 Clean, modern interface
* 📦 Docker support with easy configuration
* 🌐 Optional CORS support

## Configuration

### Environment Variables

| Variable                  | Description                                                                        | Default                     | Required |
|---------------------------|------------------------------------------------------------------------------------|-----------------------------|----------|
| PORT                      | Server port                                                                       | 3000                        | No       |
| BASE_URL                  | Base URL for the application                                                      | http://localhost:PORT       | Yes      |
| DUMBPAD_PIN               | PIN protection (4-10 digits)                                                      | None                        | No       |
| SITE_TITLE                | Site title displayed in header                                                    | DumbPad                     | No       |
| NODE_ENV                  | Node environment mode (development or production)                                 | production                  | No       |
| ALLOWED_ORIGINS           | Allowed CORS origins (`*` for all or comma-separated list)                        | *                           | No       |
| LOCKOUT_TIME              | Lockout time after max PIN attempts (in minutes)                                  | 15                          | No       |
| MAX_ATTEMPTS              | Maximum PIN entry attempts before lockout                                         | 5                           | No       |
| COOKIE_MAX_AGE            | Maximum age of authentication cookies (in hours)                                  | 24                          | No       |
| PAGE_HISTORY_COOKIE_AGE   | Age of cookie storing last opened notepad (in days, max 400)                      | 365                         | No       |

## Security

### Features

* Variable-length PIN support (4-10 digits)
* Constant-time PIN comparison
* Brute force protection:
  * 5 attempts maximum
  * 15-minute lockout after failed attempts
  * IP-based tracking
* Secure cookie handling
* No client-side PIN storage
* Rate limiting
* Collaborative editing
* CORS support for origin restrictions (optional)

## Technical Details

### Stack

* **Backend**: Node.js (>=20.0.0) with Express
* **Frontend**: Vanilla JavaScript (ES6+)
* **Container**: Docker with multi-stage builds
* **Security**: Express security middleware
* **Storage**: File-based with auto-save
* **Theme**: Dynamic dark/light mode with system preference support

### Dependencies

* express: Web framework
* cors: Cross-origin resource sharing
* dotenv: Environment configuration
* cookie-parser: Cookie handling
* express-rate-limit: Rate limiting
* marked: Markdown formatting
* fuse.js: Fuzzy searching

The `data` directory contains:
- `notepads.json`: List of all notepads
- Individual `.txt` files for each notepad's content
- Drop in .txt files to import notes (requires page refresh)

⚠️ Important: Never delete the `data` directory when updating! This is where all your notes are stored.

## Usage

- Just start typing! Your notes will be automatically saved.
- Use the theme toggle in the top-right corner to switch between light and dark mode.
- Press `Ctrl+S` (or `Cmd+S` on Mac) to force save.
- Auto-saves every 10 seconds while typing.
- Create multiple notepads with the + button.
- Download notepads as .txt or .md files.
- Hover over notepad controls to view tooltips of keyboard shortcuts
- Press `Ctrl+K` (or `Cmd+K`) to open fuzzy search
- If PIN protection is enabled, you'll need to enter the PIN to access the app.

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
- **Buy Us a Coffee:** [buymeacoffee.com/dumbware](https://buymeacoffee.com/dumbware) ☕
- **Join the Chaos:** [Discord](https://discord.gg/zJutzxWyq2) 💬

## Future Features

* File attachments

> Got an idea? Open an issue or submit a PR
