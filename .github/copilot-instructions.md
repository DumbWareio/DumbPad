# Project Principles

# Code Philosophy

- Keep code simple, smart, and follow best practices
- Don't over-engineer for the sake of engineering
- Use standard conventions and patterns
- Write human-readable code
- Keep it simple so the app just works
- Follow the principle: "Make it work, make it right, make it fast"
- Comments should explain "why" behind the code in more complex functions
- Overcommented code is better than undercommented code

# Commit Conventions

- Use Conventional Commits format:
  - feat: new features
  - fix: bug fixes
  - docs: documentation changes
  - style: formatting, missing semi colons, etc.
  - refactor: code changes that neither fix bugs nor add features
  - test: adding or modifying tests
  - chore: updating build tasks, package manager configs, etc.
- Each commit should be atomic and focused
- Write clear, descriptive commit messages

# Project Structure

# Root Directory

- Keep root directory clean with only essential files.
- Contains configuration files (`docker-compose.yml`, `Dockerfile`, `.env.example`, `package.json`, `README.md`, etc.).
- The main server entry point is `server.js`.

# Backend

- The core backend logic is contained in `server.js`, which handles routing, WebSocket connections, and file operations.
- The `data/` directory is used for storing text file data.

# Frontend (`public/`)

- All frontend code is located in the `public/` directory.
  - `index.html`: The main application page for the text editor.
  - `login.html`: The PIN-based login page.
  - `app.js`: The main client-side script that initializes the application and orchestrates the different managers.
  - `service-worker.js`: Provides Progressive Web App (PWA) capabilities for offline use.
  - **`Assets/`**: Holds all static assets.
    - `styles.css`: Main stylesheet for the application's layout and UI.
    - `markdown-styles.css`: Specific styles for rendering Markdown content.
    - `dumbpad.svg` & `dumbpad.png`: Application logos.
  - **`managers/`**: Contains modules responsible for specific frontend features.
    - `collaboration.js`: Manages real-time collaboration, sending and receiving changes via WebSockets.
    - `confirmation.js`: Handles confirmation dialogs for actions like deleting files.
    - `cursor-manager.js`: Manages and displays cursors of other users during collaborative sessions.
    - `operations.js`: Handles file and editor operations like creating, deleting, and renaming files.
    - `search.js`: Implements the client-side search functionality.
    - `settings.js`: Manages the settings panel, including theme switching and other user preferences.
    - `storage.js`: A utility for interacting with the browser's `localStorage` and `sessionStorage`.
    - `toaster.js`: Manages the display of toast notifications for user feedback.

# Scripts (`scripts/`)

- This directory contains helper scripts for development and build-related tasks.
  - `cors.js`: A simple script to enable CORS, likely for development purposes.
  - `generate-png.js`: A script to generate PNG images from the SVG logo.
  - `pwa-manifest-generator.js`: A script that generates the `manifest.json` file required for PWA functionality.

# Documentation

- Main `README.md` in the root is the primary source of documentation.
- Code must be self-documenting with clear naming.
- Complex logic must include comments explaining "why" not "what".
- JSDoc comments for public functions and APIs.

# Docker Configuration

- `Dockerfile` and `docker-compose.yml` in the root define the containerization setup.
- `.dockerignore` is configured to exclude unnecessary files from the Docker image.
- Multi-stage builds are used to keep the final image size small.
- Use specific version tags for base images.

# Code Style

- Follow ESLint and Prettier configurations
- Use meaningful variable and function names
- Keep functions small and focused
- Maximum line length: 100 characters
- Use modern JavaScript features appropriately
- Prefer clarity over cleverness
- Add logging when appropriate and environment variable DEBUG is set to true

# Code Organization and Modularity

- Break complex functionality into separate modules
- Each module should have a single responsibility
- Modules should be self-contained with clear interfaces
- Avoid circular dependencies between modules
- Keep module files under 300 lines when possible
- Export only what is necessary from each module
- Group related functionality in the same directory

# Theme and Styling

- Maintain consistent theme colors across the application:
  - Light theme colors:
    - Background: #ffffff
    - Text: #1a1a1a
    - Primary: #2563eb
    - Secondary: #64748b
  - Dark theme colors:
    - Background: #1a1a1a
    - Text: #ffffff
    - Primary: #3b82f6
    - Secondary: #94a3b8
- Theme toggle must be present on all pages
- Theme preference must persist in localStorage
- System theme preference should be respected by default

# Security and Authentication

- PIN authentication logic in login.html must not be modified without verification and override from the owner
- PIN input fields must:
  - Use type="password"
  - Have numeric validation
  - Support paste functionality
  - Auto-advance on input
  - Support backspace navigation
- Maintain brute force protection with:
  - Maximum attempt limits
  - Lockout periods
  - Constant-time PIN comparison
- Session management must use secure cookies
