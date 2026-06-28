/// <reference types="cypress" />

/**
 * Tests for WCA API integration when WCIF has no embedded results.
 *
 * Podium data comes from live/podiums (or v0/podiums fallback); newcomer
 * certificates use v0/results.
 */
describe('WCA API integration', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/speedcubing-ireland/wca-analysis/api/competitions/IE.json', {
      fixture: 'competitions.json'
    }).as('getIrishCompetitions');

    cy.intercept('GET', '**/speedcubing-ireland/wca-analysis/api/competitions/GB.json', {
      fixture: 'competitions-gb.json'
    }).as('getUKCompetitions');

    cy.intercept('POST', '**/inputs/*', { statusCode: 200 }).as('logEvent');
  });

  describe('when WCIF has no results but WCA APIs have data', () => {
    beforeEach(() => {
      cy.intercept('GET', '**/api/v0/competitions/*/wcif/', {
        fixture: 'wcif-no-results.json'
      }).as('getWcif');

      cy.intercept('GET', '**/api/v1/competitions/*/live/podiums', {
        body: []
      }).as('getLivePodiums');

      cy.intercept('GET', '**/api/v0/competitions/*/podiums', {
        fixture: 'api-results.json'
      }).as('getPublishedPodiums');

      cy.intercept('GET', '**/api/v0/competitions/*/results', {
        fixture: 'api-results.json'
      }).as('getResults');

      cy.visit('/');
      cy.wait(['@getIrishCompetitions', '@getUKCompetitions']);

      cy.get('.competition').first().click();
      cy.wait('@getWcif');
    });

    it('should fetch podium and results APIs after loading WCIF', () => {
      cy.wait('@getLivePodiums');
      cy.wait('@getPublishedPodiums');
      cy.wait('@getResults');
    });

    it('should display events with results after API load', () => {
      cy.wait('@getPublishedPodiums');
      cy.get('.comp-interface', { timeout: 10000 }).should('be.visible');
      cy.get('.events-table').should('be.visible');
      cy.get('.event-row').should('have.length.at.least', 1);
    });

    it('should show podium status instead of "Not available yet"', () => {
      cy.wait('@getPublishedPodiums');
      cy.get('.comp-interface', { timeout: 10000 }).should('be.visible');
      cy.get('.event-row').first().find('.event-warning').should('not.contain', 'Not available yet');
    });

    it('should show correct podium count for events with 3 competitors', () => {
      cy.wait('@getPublishedPodiums');
      cy.get('.comp-interface', { timeout: 10000 }).should('be.visible');
      cy.get('.event-row').first().find('.event-warning').should('be.empty');
    });

    it('should show warning for events with only 2 on podium', () => {
      cy.wait('@getPublishedPodiums');
      cy.get('.comp-interface', { timeout: 10000 }).should('be.visible');
      cy.get('.event-row').eq(1).find('.event-warning')
        .should('contain', 'Only 2 persons on the podium');
    });

    it('should allow selecting events for certificate generation', () => {
      cy.wait('@getPublishedPodiums');
      cy.get('.comp-interface', { timeout: 10000 }).should('be.visible');
      cy.get('.event-checkbox').first().click();
      cy.get('.event-checkbox').first().should('be.checked');
    });
  });
});
