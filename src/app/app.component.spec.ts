import {TestBed} from '@angular/core/testing';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {provideHttpClient} from '@angular/common/http';
import {of} from 'rxjs';
import {AppComponent, parseUrlParams, tabNameToIndex, tabIndexToName} from './app.component';
import {PrintService} from '../common/print';
import {WCIF, Competition} from '../common/types';
import {EventWithPodium, filterPodiumResults, PodiumResult} from '../common/podium-data';
import {
  buildCompetitionCertificateData,
  CompetitionApiSources,
} from '../common/competition-certificate-data';
import type {Result as WcaApiResult} from '../wca-api/openapiClient';
import {Result} from '@wca/helpers/lib/models/result';
import {Event} from '@wca/helpers/lib/models/event';
import {Person} from '@wca/helpers';
import {podiumByRanking} from '../common/podium';

// Mock pdfMake global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).pdfMake = {
  fonts: {},
  createPdf: () => ({download: () => { /* noop */ }, open: () => { /* noop */ }, getBlob: () => { /* noop */ }})
};

function makeResult(ranking: number, best: number, average = 0, personId = 1): Result {
  return {ranking, best, average, personId, attempts: []} as Result;
}

function makeRound(results: Result[], format = 'a'): {results: Result[]; format: string; id: string} {
  return {results, format, id: 'r1'};
}

function makeEvent(id: string, rounds: ReturnType<typeof makeRound>[]): Event {
  return {id, rounds} as unknown as Event;
}

function makePerson(name: string, registrantId: number, countryIso2 = 'IE'): Person {
  return {name, registrantId, countryIso2, roles: [], registration: {status: 'accepted'}} as unknown as Person;
}

function makeEventWithPodium(id: string, rounds: ReturnType<typeof makeRound>[]): EventWithPodium {
  return {
    ...makeEvent(id, rounds),
    hasPodiumResults: false,
    podiumFormat: null,
    podiumSourceResults: [],
  };
}

function makeWcif(events: EventWithPodium[] = [], persons: Person[] = []): WCIF {
  return {
    id: 'Test2024',
    name: 'Test Competition 2024',
    shortName: 'Test 2024',
    persons,
    events,
    schedule: {},
    competitorLimit: null,
    extensions: []
  };
}

function okApiData<T>(data: T) {
  return {data, outcome: 'ok' as const};
}

function makeApiSources(wcif: WCIF, competitionResults: WcaApiResult[] = []): CompetitionApiSources {
  return {
    wcif,
    livePodiums: okApiData([]),
    publishedPodiums: okApiData([]),
    competitionResults: okApiData(competitionResults),
  };
}

function setCertificateData(component: AppComponent, wcif: WCIF, countries = '') {
  component.certificateData = buildCompetitionCertificateData(makeApiSources(wcif), countries);
  component.wcif = component.certificateData.wcif;
  component.events = component.certificateData.wcif.events;
}

describe('AppComponent', () => {
  let component: AppComponent;
  let httpMock: HttpTestingController;
  let mockPrintService: Partial<PrintService>;

  beforeEach(() => {
    localStorage.clear();

    mockPrintService = {
      podiumCertificateJson: '[]',
      podiumCertificateStyleJson: '{}',
      pageOrientation: 'landscape' as const,
      backgroundForPreviewOnly: true,
      countries: '',
      xOffset: 0,
      yOffset: 0,
      showLocalNames: false,
      background: null,
      defaultPodiumCertificateJson: '[]',
      defaultPodiumCertificateStyleJson: '{}',
      resetPodiumCertificateJson: () => { /* noop */ },
      resetPodiumCertificateStyleJson: () => { /* noop */ },
      printCertificatesAsPdf: jasmine.createSpy('printCertificatesAsPdf'),
      printCertificatesAsPreview: jasmine.createSpy('printCertificatesAsPreview'),
    };

    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {provide: PrintService, useValue: mockPrintService},
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    component = TestBed.createComponent(AppComponent).componentInstance;

    // Flush the initial getIrishCompetitions requests triggered by the constructor
    const apiBase = 'https://raw.githubusercontent.com/speedcubing-ireland/wca-analysis/api';
    httpMock.match(`${apiBase}/competitions/IE.json`).forEach(req => req.flush({items: []}));
    httpMock.match(`${apiBase}/competitions/GB.json`).forEach(req => req.flush({items: []}));
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });


  describe('printing actions', () => {
    beforeEach(() => {
      const event = makeEventWithPodium('333', [makeRound([])]);
      event.printCertificate = true;
      setCertificateData(component, makeWcif([event], [makePerson('Alice', 1)]));
    });

    it('should print certificates for selected events', () => {
      component.printCertificatesAsPdf();

      expect(mockPrintService.printCertificatesAsPdf).toHaveBeenCalled();
    });

    it('should preview certificates for selected events', () => {
      component.printCertificatesAsPreview();

      expect(mockPrintService.printCertificatesAsPreview).toHaveBeenCalled();
    });
  });

  describe('shouldShowBlankCertificatesNotice', () => {
    it('should return true when a selected event has no podium results', () => {
      const noResultsEvent = makeEventWithPodium('333', [makeRound([])]);
      noResultsEvent.hasPodiumResults = false;
      noResultsEvent.printCertificate = true;
      component.events = [noResultsEvent];

      expect(component.shouldShowBlankCertificatesNotice()).toBeTrue();
    });

    it('should return false when selected event has podium results', () => {
      const withResultsEvent = makeEventWithPodium('333', [makeRound([])]);
      withResultsEvent.hasPodiumResults = true;
      withResultsEvent.podiumSourceResults = [makeResult(1, 800)];
      withResultsEvent.printCertificate = true;
      component.events = [withResultsEvent];

      expect(component.shouldShowBlankCertificatesNotice()).toBeFalse();
    });
  });

  describe('podiumByRanking', () => {
    it('should return top 3 results in reverse order (3rd, 2nd, 1st)', () => {
      const results = [
        makeResult(1, 800, 900),
        makeResult(2, 900, 1000),
        makeResult(3, 1000, 1100)
      ];

      const podium = podiumByRanking(results);

      expect(podium.length).toBe(3);
      expect(podium[0].ranking).toBe(3);
      expect(podium[1].ranking).toBe(2);
      expect(podium[2].ranking).toBe(1);
    });

    it('should include tied results beyond 3rd place', () => {
      const results = [
        makeResult(1, 800),
        makeResult(2, 900),
        makeResult(3, 1000),
        makeResult(3, 1000), // Tied for 3rd
      ];

      const podium = podiumByRanking(results);

      expect(podium.length).toBe(4);
    });

    it('should include multiple ties for 3rd place', () => {
      const results = [
        makeResult(1, 800),
        makeResult(2, 900),
        makeResult(3, 1000),
        makeResult(3, 1000),
        makeResult(3, 1000), // Three-way tie for 3rd
      ];

      const podium = podiumByRanking(results);

      expect(podium.length).toBe(5);
    });

    it('should not include beyond tied results', () => {
      const results = [
        makeResult(1, 800),
        makeResult(2, 900),
        makeResult(3, 1000),
        makeResult(3, 1000),
        makeResult(5, 1200), // Not tied with 3rd
      ];

      const podium = podiumByRanking(results);

      expect(podium.length).toBe(4);
    });

    it('should handle fewer than 3 results without expanding ties', () => {
      const results = [
        makeResult(1, 800),
        makeResult(2, 900)
      ];

      const podium = podiumByRanking(results);

      expect(podium.length).toBe(2);
    });

    it('should handle single result', () => {
      const results = [makeResult(1, 800)];
      const podium = podiumByRanking(results);
      expect(podium.length).toBe(1);
    });

    it('should handle empty results', () => {
      const podium = podiumByRanking([]);
      expect(podium.length).toBe(0);
    });

    it('should sort results by ranking before slicing', () => {
      // Pass results in wrong order to test sorting
      const results = [
        makeResult(3, 1000),
        makeResult(1, 800),
        makeResult(2, 900)
      ];

      const podium = podiumByRanking(results);

      expect(podium.length).toBe(3);
      // Reversed: 3rd, 2nd, 1st
      expect(podium[0].ranking).toBe(3);
      expect(podium[1].ranking).toBe(2);
      expect(podium[2].ranking).toBe(1);
    });

    it('should handle tie for 1st place', () => {
      const results = [
        makeResult(1, 800),
        makeResult(1, 800),
        makeResult(3, 1000)
      ];

      const podium = podiumByRanking(results);

      expect(podium.length).toBe(3);
    });
  });

  describe('filterPodiumResults', () => {
    function toPodiumResult(ranking: number, best: number, countryIso2 = 'IE'): PodiumResult {
      return {ranking, best, average: 0, personId: 1, attempts: [], countryIso2};
    }

    it('should remove results with best of -1 (DNF)', () => {
      const filtered = filterPodiumResults([
        toPodiumResult(1, 800),
        toPodiumResult(2, -1),
        toPodiumResult(3, 1000),
      ], '');

      expect(filtered.length).toBe(2);
      expect(filtered[0].best).toBe(800);
      expect(filtered[1].best).toBe(1000);
    });

    it('should remove results with best of 0', () => {
      const filtered = filterPodiumResults([
        toPodiumResult(1, 800),
        toPodiumResult(2, 0),
      ], '');

      expect(filtered.length).toBe(1);
    });

    it('should keep all results when none are DNF', () => {
      const filtered = filterPodiumResults([
        toPodiumResult(1, 800),
        toPodiumResult(2, 900),
      ], '');

      expect(filtered.length).toBe(2);
    });

    it('should return empty array when all are DNF', () => {
      const filtered = filterPodiumResults([
        toPodiumResult(1, -1),
        toPodiumResult(2, -1),
      ], '');

      expect(filtered.length).toBe(0);
    });

    it('should return all results when no country filter is set', () => {
      mockPrintService.countries = '';
      const filtered = filterPodiumResults([
        toPodiumResult(1, 800, 'IE'),
        toPodiumResult(2, 900, 'GB'),
      ], '');

      expect(filtered.length).toBe(2);
    });

    it('should filter by single country', () => {
      const filtered = filterPodiumResults([
        toPodiumResult(1, 800, 'IE'),
        toPodiumResult(2, 900, 'GB'),
      ], 'IE');

      expect(filtered.length).toBe(1);
      expect(filtered[0].countryIso2).toBe('IE');
    });

    it('should filter by multiple countries separated by semicolon', () => {
      const filtered = filterPodiumResults([
        toPodiumResult(1, 800, 'IE'),
        toPodiumResult(2, 900, 'GB'),
        toPodiumResult(3, 1000, 'US'),
      ], 'IE;GB');

      expect(filtered.length).toBe(2);
    });
  });

  describe('podium ranking metadata', () => {
    it('should assign sequential rankings', () => {
      const podium = podiumByRanking([
        makeResult(1, 800),
        makeResult(2, 900),
        makeResult(3, 1000)
      ]);

      expect(podium[0]['rankingAfterFiltering']).toBe(3);
      expect(podium[1]['rankingAfterFiltering']).toBe(2);
      expect(podium[2]['rankingAfterFiltering']).toBe(1);
    });

    it('should handle tied rankings', () => {
      const podium = podiumByRanking([
        makeResult(1, 800),
        makeResult(1, 800),
        makeResult(3, 1000)
      ]);

      expect(podium[0]['rankingAfterFiltering']).toBe(3);
      expect(podium[1]['rankingAfterFiltering']).toBe(1);
      expect(podium[2]['rankingAfterFiltering']).toBe(1);
    });
  });

  describe('getWarningIfAny', () => {
    function setupEventWithPodium(eventId: string, results: Result[]) {
      const event = makeEventWithPodium(eventId, [makeRound([])]);
      event.hasPodiumResults = results.some(result => result.best > 0);
      event.podiumFormat = 'a';
      event.podiumSourceResults = results.map(result => ({
        ...result,
        countryIso2: 'IE',
      }));
      setCertificateData(component, makeWcif([event], []), mockPrintService.countries ?? '');
      component['recomputeWarnings']();
    }

    it('should return "Not available yet" when no results', () => {
      setupEventWithPodium('333', []);
      expect(component.getWarningIfAny('333')).toBe('Not available yet');
    });

    it('should return empty string for exactly 3 podium places', () => {
      setupEventWithPodium('333', [
        makeResult(1, 800),
        makeResult(2, 900),
        makeResult(3, 1000)
      ]);
      expect(component.getWarningIfAny('333')).toBe('');
    });

    it('should warn about only 1 person on podium', () => {
      setupEventWithPodium('333', [makeResult(1, 800)]);
      expect(component.getWarningIfAny('333')).toBe('Only 1 person on the podium!');
    });

    it('should warn about only 2 persons on podium', () => {
      setupEventWithPodium('333', [
        makeResult(1, 800),
        makeResult(2, 900)
      ]);
      expect(component.getWarningIfAny('333')).toBe('Only 2 persons on the podium!');
    });

    it('should warn about more than 3 persons when ties exist', () => {
      setupEventWithPodium('333', [
        makeResult(1, 800),
        makeResult(2, 900),
        makeResult(3, 1000),
        makeResult(3, 1000) // Tie
      ]);
      expect(component.getWarningIfAny('333')).toBe('More than 3 persons on the podium!');
    });

    it('should filter out DNF results before counting podium', () => {
      setupEventWithPodium('333', [
        makeResult(1, 800),
        makeResult(2, 900),
        makeResult(3, -1) // DNF
      ]);
      expect(component.getWarningIfAny('333')).toBe('Only 2 persons on the podium!');
    });

    it('should expose precomputed warnings without mutating events', () => {
      setupEventWithPodium('333', [
        makeResult(1, 800),
        makeResult(2, 900),
        makeResult(3, 1000)
      ]);
      expect(component.getWarningIfAny('333')).toBe('');
      expect(component.eventWarnings['333']).toBe('');
    });
  });

  describe('categorizeCompetitions', () => {
    function makeCompetition(id: string, startDate: string, endDate: string): Competition {
      return {id, name: id, start_date: startDate, end_date: endDate, city: 'Dublin', country: 'Ireland'};
    }

    it('should categorize past, in-progress, and future competitions', () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      component.competitionsToChooseFrom = [
        makeCompetition('Past', yesterday.toISOString().split('T')[0], yesterday.toISOString().split('T')[0]),
        makeCompetition('Current', today.toISOString().split('T')[0], today.toISOString().split('T')[0]),
        makeCompetition('Future', tomorrow.toISOString().split('T')[0], tomorrow.toISOString().split('T')[0])
      ];

      component.categorizeCompetitions();

      expect(component.pastCompetitions.length).toBe(1);
      expect(component.pastCompetitions[0].id).toBe('Past');
      expect(component.inProgressCompetitions.length).toBe(1);
      expect(component.inProgressCompetitions[0].id).toBe('Current');
      expect(component.futureCompetitions.length).toBe(1);
      expect(component.futureCompetitions[0].id).toBe('Future');
    });

    it('should treat multi-day competitions spanning today as in-progress', () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      component.competitionsToChooseFrom = [
        makeCompetition('MultiDay', yesterday.toISOString().split('T')[0], tomorrow.toISOString().split('T')[0])
      ];

      component.categorizeCompetitions();

      expect(component.inProgressCompetitions.length).toBe(1);
      expect(component.pastCompetitions.length).toBe(0);
      expect(component.futureCompetitions.length).toBe(0);
    });

    it('should sort past competitions with most recent first', () => {
      const today = new Date();
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(today.getDate() - 2);
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(today.getDate() - 3);

      component.competitionsToChooseFrom = [
        makeCompetition('Older', threeDaysAgo.toISOString().split('T')[0], threeDaysAgo.toISOString().split('T')[0]),
        makeCompetition('Recent', twoDaysAgo.toISOString().split('T')[0], twoDaysAgo.toISOString().split('T')[0])
      ];

      component.categorizeCompetitions();

      expect(component.pastCompetitions[0].id).toBe('Recent');
      expect(component.pastCompetitions[1].id).toBe('Older');
    });

    it('should sort future competitions with soonest first', () => {
      const today = new Date();
      const twoDays = new Date(today);
      twoDays.setDate(today.getDate() + 2);
      const threeDays = new Date(today);
      threeDays.setDate(today.getDate() + 3);

      component.competitionsToChooseFrom = [
        makeCompetition('Later', threeDays.toISOString().split('T')[0], threeDays.toISOString().split('T')[0]),
        makeCompetition('Sooner', twoDays.toISOString().split('T')[0], twoDays.toISOString().split('T')[0])
      ];

      component.categorizeCompetitions();

      expect(component.futureCompetitions[0].id).toBe('Sooner');
      expect(component.futureCompetitions[1].id).toBe('Later');
    });

    it('should handle null competitionsToChooseFrom', () => {
      component.competitionsToChooseFrom = null;
      component.categorizeCompetitions();
      // Should not throw
      expect(component.inProgressCompetitions).toEqual([]);
    });
  });

  describe('logout', () => {
    it('should reset competition state when confirmed', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      component.competitionId = 'Test2024';
      component.wcif = makeWcif();
      component.events = [makeEventWithPodium('333', [makeRound([])])];
      component.error = 'some error';
      component.loading = true;

      component.logout();

      expect(window.confirm).toHaveBeenCalled();
      expect(component.competitionId).toBe('');
      expect(component.wcif).toBeNull();
      expect(component.events).toEqual([]);
      expect(component.error).toBe('');
      expect(component.loading).toBe(false);
    });

    it('should not reset state when confirm is cancelled', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      component.competitionId = 'Test2024';
      component.wcif = makeWcif();
      component.events = [makeEventWithPodium('333', [makeRound([])])];

      component.logout();

      expect(component.competitionId).toBe('Test2024');
      expect(component.wcif).not.toBeNull();
      expect(component.events.length).toBe(1);
    });

    it('should clear auth token when confirmed', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      localStorage.setItem('wca_access_token', 'fake-token');

      component.logout();

      expect(localStorage.getItem('wca_access_token')).toBeNull();
    });
  });

  describe('formatCompetitionDate', () => {
    it('should format single-day competition', () => {
      const comp: Competition = {
        id: 'test', name: 'Test', start_date: '2024-03-15', end_date: '2024-03-15', city: 'Dublin', country: 'Ireland'
      };
      const result = component.formatCompetitionDate(comp);
      expect(result).toContain('Mar');
      expect(result).toContain('15');
      expect(result).not.toContain('-');
    });

    it('should format multi-day competition with date range', () => {
      const comp: Competition = {
        id: 'test', name: 'Test', start_date: '2024-03-15', end_date: '2024-03-17', city: 'Dublin', country: 'Ireland'
      };
      const result = component.formatCompetitionDate(comp);
      expect(result).toContain('-');
      expect(result).toContain('15');
      expect(result).toContain('17');
    });
  });

  describe('URL bookmarking', () => {
    let replaceStateSpy: jasmine.Spy;

    beforeEach(() => {
      replaceStateSpy = spyOn(history, 'replaceState');
    });

    describe('readUrlParams', () => {
      it('should set pending competition from URL search params', () => {
        component.readUrlParams('?competition=MyComp2024');
        expect(component.pendingNavigation?.competitionId).toBe('MyComp2024');
        expect(component.pendingNavigation?.tabIndex).toBe(0);
      });

      it('should set pending competition and tab from URL', () => {
        component.readUrlParams('?competition=MyComp2024&tab=customize');
        expect(component.pendingNavigation?.competitionId).toBe('MyComp2024');
        expect(component.pendingNavigation?.tabIndex).toBe(1);
      });

      it('should not set pending when no competition param', () => {
        component.readUrlParams('');
        expect(component.pendingNavigation).toBeNull();
      });

      it('should default to podium tab for unknown tab value', () => {
        component.readUrlParams('?competition=MyComp2024&tab=bogus');
        expect(component.pendingNavigation?.tabIndex).toBe(0);
      });
    });

    describe('applyPendingNavigation', () => {
      it('should load competition from pending params', () => {
        const wcif = makeWcif([makeEventWithPodium('333', [makeRound([])])], [makePerson('Alice', 1)]);
        spyOn(component.apiService, 'loadCompetitionApiSources').and.returnValue(of(makeApiSources(wcif)));
        component.pendingNavigation = { competitionId: 'PendingComp', tabIndex: 1 };

        component.applyPendingNavigation();

        expect(component.competitionId).toBe('PendingComp');
        expect(component.selectedTabIndex).toBe(1);
        expect(component.pendingNavigation).toBeNull();
        expect(component.apiService.loadCompetitionApiSources).toHaveBeenCalledWith('PendingComp');
      });

      it('should not navigate when no pending competition', () => {
        component.pendingNavigation = null;
        component.applyPendingNavigation();
        expect(component.competitionId).toBeFalsy();
      });

      it('should not navigate when competition is already loaded', () => {
        component.competitionId = 'AlreadyLoaded';
        component.pendingNavigation = { competitionId: 'PendingComp', tabIndex: 0 };

        component.applyPendingNavigation();

        expect(component.competitionId).toBe('AlreadyLoaded');
        expect(component.pendingNavigation).not.toBeNull();
      });
    });

    describe('updateUrl', () => {
      it('should set competition param in URL', () => {
        component.updateUrl('MyComp2024');
        expect(replaceStateSpy).toHaveBeenCalledWith(
          null, '',
          jasmine.stringContaining('competition=MyComp2024')
        );
      });

      it('should include tab param when tab is customize', () => {
        component.updateUrl('MyComp2024', 1);
        const url = replaceStateSpy.calls.mostRecent().args[2] as string;
        expect(url).toContain('competition=MyComp2024');
        expect(url).toContain('tab=customize');
      });

      it('should omit tab param for default podium tab', () => {
        component.updateUrl('MyComp2024', 0);
        const url = replaceStateSpy.calls.mostRecent().args[2] as string;
        expect(url).toContain('competition=MyComp2024');
        expect(url).not.toContain('tab=');
      });
    });

    describe('onTabChange', () => {
      it('should update selectedTabIndex and URL when competition is loaded', () => {
        component.competitionId = 'TestComp';
        component.onTabChange(1);
        expect(component.selectedTabIndex).toBe(1);
        expect(replaceStateSpy).toHaveBeenCalledWith(
          null, '',
          jasmine.stringContaining('tab=customize')
        );
      });

      it('should not update URL when no competition is loaded', () => {
        component.competitionId = '';
        component.onTabChange(1);
        expect(component.selectedTabIndex).toBe(1);
        expect(replaceStateSpy).not.toHaveBeenCalled();
      });
    });

    describe('handleCompetitionSelected', () => {
      beforeEach(() => {
        spyOn(component.apiService, 'loadCompetitionApiSources').and.returnValue(of(makeApiSources(makeWcif())));
      });

      it('should update URL when competition is selected', () => {
        component.handleCompetitionSelected('TestComp');
        expect(replaceStateSpy).toHaveBeenCalledWith(
          null, '',
          jasmine.stringContaining('competition=TestComp')
        );
      });

      it('should include current tab in URL', () => {
        component.selectedTabIndex = 1;
        component.handleCompetitionSelected('TestComp');
        const url = replaceStateSpy.calls.mostRecent().args[2] as string;
        expect(url).toContain('tab=customize');
      });
    });

    describe('clearUrlParams on logout', () => {
      it('should clear URL params and reset tab on logout', () => {
        spyOn(window, 'confirm').and.returnValue(true);
        component.competitionId = 'TestComp';
        component.selectedTabIndex = 1;

        component.logout();

        expect(component.selectedTabIndex).toBe(0);
        expect(replaceStateSpy).toHaveBeenCalled();
        const url = replaceStateSpy.calls.mostRecent().args[2] as string;
        expect(url).not.toContain('competition');
        expect(url).not.toContain('tab');
      });
    });
  });
});

describe('parseUrlParams', () => {
  it('should extract competition from URL search string', () => {
    const result = parseUrlParams('?competition=TestComp2024');
    expect(result.competitionId).toBe('TestComp2024');
    expect(result.tab).toBeNull();
  });

  it('should extract competition and tab', () => {
    const result = parseUrlParams('?competition=TestComp2024&tab=customize');
    expect(result.competitionId).toBe('TestComp2024');
    expect(result.tab).toBe('customize');
  });

  it('should return nulls when no params present', () => {
    const result = parseUrlParams('');
    expect(result.competitionId).toBeNull();
    expect(result.tab).toBeNull();
  });

  it('should return nulls for unrelated params', () => {
    const result = parseUrlParams('?foo=bar');
    expect(result.competitionId).toBeNull();
    expect(result.tab).toBeNull();
  });
});

describe('tabNameToIndex', () => {
  it('should return 0 for null', () => {
    expect(tabNameToIndex(null)).toBe(0);
  });

  it('should return 0 for "podium"', () => {
    expect(tabNameToIndex('podium')).toBe(0);
  });

  it('should return 1 for "customize"', () => {
    expect(tabNameToIndex('customize')).toBe(1);
  });

  it('should return 0 for unknown value', () => {
    expect(tabNameToIndex('unknown')).toBe(0);
  });
});

describe('tabIndexToName', () => {
  it('should return null for index 0 (podium is default, omit from URL)', () => {
    expect(tabIndexToName(0)).toBeNull();
  });

  it('should return "customize" for index 1', () => {
    expect(tabIndexToName(1)).toBe('customize');
  });

  it('should return null for out-of-range index', () => {
    expect(tabIndexToName(99)).toBeNull();
  });
});
