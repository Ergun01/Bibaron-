# Neon Pong

A lightweight, browser-based arcade game built with HTML, CSS, and vanilla JavaScript.

## Features
- Player-vs-computer Pong gameplay
- Mouse, keyboard, and touch controls
- Easy, Normal, and Hard AI difficulty settings
- Pause, restart, and new-match controls
- Local best-score persistence with `localStorage`
- Web Audio API sound effects that gracefully disable when unsupported
- Responsive layout for desktop, tablet, and mobile screens
- GitHub Pages compatible static deployment without a build system

## Local run instructions

### Windows (PowerShell)
1. Open PowerShell in the project folder.
2. Run:
   ```powershell
   python -m http.server 8000
   ```
3. Open this URL in your browser:
   ```text
   http://localhost:8000/
   ```

### Windows (Command Prompt)
1. Open Command Prompt in the project folder.
2. Run:
   ```cmd
   py -m http.server 8000
   ```
3. Open:
   ```text
   http://localhost:8000/
   ```

### Alternative local file method
You can also open `index.html` directly in a browser, but a local web server is recommended because some browser features (such as audio initialization) behave more reliably when served over HTTP.

## GitHub Pages setup
1. Push this repository to GitHub.
2. Open the repository in GitHub.
3. Go to `Settings` > `Pages`.
4. Under `Source`, choose `Deploy from a branch`.
5. Set branch to `main` and folder to `/` (root).
6. Save the settings.
7. GitHub will publish the site at:
   ```text
   https://<your-username>.github.io/<repository-name>/
   ```

Repository site vs user/organization site:
- Repository site: `https://<username>.github.io/<repository-name>/`
- User/organization site: `https://<username>.github.io/` (requires a repository named exactly `<username>.github.io`)

## Notes
- The project uses relative asset paths and does not require a backend or build step.
- The game is intentionally static and GitHub Pages friendly.
- Audio is initialized after user interaction when browser autoplay restrictions apply.
- If `localStorage` is blocked, the best-score feature is ignored gracefully without breaking gameplay.

## Publishing status
This repository has not been published to GitHub Pages from this environment, so no live site claim is made here. The GitHub Pages configuration above is the required setup when deployment is enabled in GitHub.
