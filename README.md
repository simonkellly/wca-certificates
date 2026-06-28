# WCA Certificates

A web application for generating podium certificates for World Cube Association (WCA) speedcubing competitions. Built primarily for competitions in Ireland and Northern Ireland.

Originally forked from https://github.com/Goosly/wca-certificates

**Live App:** https://speedcubing-ireland.github.io/wca-certificates/

## Features

### Podium Certificates
- Generate certificates for 1st, 2nd, and 3rd place winners
- Automatically generate blank certificates for selected events without final-round results
- Select specific events or generate for all events
- Filter results by country (ISO 2-letter codes)
- Handles ties in podium placement

### Customization
- Custom JSON-based certificate templates
- Upload custom background images
- Configurable page orientation (landscape/portrait)
- X-offset adjustment for precise positioning

### Authentication
- WCA login is required to select and load competitions
- Users are prompted to log in before accessing the competition list
- Logging out returns the user to the competition selection screen with a login prompt
- Logout requires confirmation to prevent accidental logouts

### Template Save/Load
- Save certificate template settings to a WCA competition (requires WCA login with competition management permissions)
- Load saved templates from any competition
- Uses the WCIF Extension mechanism for persistence

### Export Options
- Download as single PDF
- Preview in browser before printing

## Technologies

- **Angular** 19.2.18
- **Angular Material** for UI components
- **PDFMake** for client-side PDF generation
- **@wca/helpers** for WCA data models
- **@hey-api/openapi-ts** for WCA API client generation
- **Bun** for package management and scripts

## Development

### Prerequisites
- [Bun](https://bun.sh/) (recommended) or Node.js 20.x+
- Angular CLI 19.x (via `bunx ng` or global install)

### Installation

```bash
bun install
```

Regenerate the WCA API client after updating `openapi/wca.yaml` (trimmed to the three endpoints this app uses):

```bash
bun run generate-api
```

CI verifies that committed generated client output matches the spec.

### Running Locally

```bash
bun run start
```

Navigate to http://localhost:4200/

### Linting

```bash
bun run lint
```

### Unit Testing (Karma/Jasmine)

```bash
bun run test
```

Runs unit tests in headless Chrome. Spec files live alongside their source files (`*.spec.ts`).


### End-to-End Testing (Cypress)

The project uses [Cypress](https://www.cypress.io/) for end-to-end testing.

```bash
# Run E2E tests (starts server automatically and runs tests headlessly)
bun run e2e

# Run E2E tests with Cypress UI (interactive mode)
bun run e2e:open

# Run Cypress tests only (requires server running on localhost:4200)
bun run cy:run

# Open Cypress UI only (requires server running on localhost:4200)
bun run cy:open
```

The E2E test suite covers:
- Competition selection and login gate
- Competition loading
- Podium certificate generation
- Certificate customization options
- Template save/load via WCIF extensions
- Tab navigation and error handling
- WCA API integration when WCIF has no embedded results

## Build & Deploy

To build for production:

```bash
bun run build-prod
```

### Testing the Production Build Locally

The production build can behave differently from `ng serve` due to optimizations and base-href settings. To test the bundled output locally before deploying:

```bash
# Build without the GitHub Pages base-href
bun run ng build -c=production

# Serve locally
bunx serve dist/wca-certificates -s
```

Then open http://localhost:3000 to test the production bundle.

### Deploying to GitHub Pages

**Automatic (preferred):** Pushing to `master` triggers the CI & Deploy workflow. It runs Cypress E2E tests first, and if they pass, automatically builds and deploys to GitHub Pages using the official GitHub Pages actions. Deployments are tracked in the repo's Environments tab.

**Manual fallback:** For quick rollbacks or emergency fixes, you can still deploy manually:

```bash
bun run build-prod
bun run deploy
```

This pushes the `dist/wca-certificates` directory to the `gh-pages` branch.

## Template Save/Load (OAuth)

The app requires WCA login to access competitions. Once logged in, users can save and load podium certificate templates to/from WCA competitions using the WCIF Extension mechanism. Saving requires a WCA account with competition management permissions.

### Testing OAuth locally

The OAuth popup redirects to the URL configured in `environment.ts` (`appUrl`) followed by callback.html e.g `http://localhost:4200/callback.html`.

If the WCA OAuth app only has the production GitHub Pages URL registered, the popup redirect will fail on localhost. As such also add `http://localhost:4200/callback.html` as a registered redirect URI whilst you test.

## Data Sources

- **Competition list:** [speedcubing-ireland/wca-analysis](https://github.com/speedcubing-ireland/wca-analysis)
- **WCIF:** `GET /api/v0/competitions/{id}/wcif/` (event list, persons, templates)
- **Podium results:** `GET /api/v1/competitions/{id}/live/podiums` (primary), with fallback to `GET /api/v0/competitions/{id}/podiums`
- **Newcomer certificates:** `GET /api/v0/competitions/{id}/results` (first-round 3x3x3 results)
