// ***********************************************************
// This support file is processed and loaded automatically
// before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
// ***********************************************************

import './commands';

// Prevent uncaught exceptions from failing tests
Cypress.on('uncaught:exception', (err, runnable) => {
  // Return false to prevent Cypress from failing the test
  return false;
});

// Set a fake auth token before each test so getWcif (which requires auth) works
beforeEach(() => {
  window.localStorage.setItem('wca_access_token', 'fake-token');

  // Default WCA API stubs (tests may override for specific scenarios)
  cy.intercept('GET', '**/api/v1/competitions/*/live/podiums', { body: [] });
  cy.intercept('GET', '**/api/v0/competitions/*/podiums', { fixture: 'api-results.json' });
  cy.intercept('GET', '**/api/v0/competitions/*/results', { fixture: 'api-results.json' });
});
