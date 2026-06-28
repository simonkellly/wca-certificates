import {TestBed} from '@angular/core/testing';
import {PrintService, DEFAULT_CERTIFICATE_JSON} from './print';
import {Certificate} from './certificate';
import {WCIF} from './types';
import {getUnofficialCertificateDefinition, UNOFFICIAL_FASTEST_NEWCOMER_333_R1} from './unofficial-certificates';
import {EventWithPodium} from './podium-data';
import type {Result as WcaApiResult} from '../wca-api/openapiClient';
import {Person} from '@wca/helpers';
import {Event} from '@wca/helpers/lib/models/event';
import {Result} from '@wca/helpers/lib/models/result';

// Mock the global pdfMake before PrintService constructor runs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).pdfMake = {
  fonts: {},
  createPdf: () => ({
    download: () => { /* noop */ },
    open: () => { /* noop */ },
    getBlob: () => { /* noop */ },
    getBuffer: (cb: (buf: ArrayBuffer) => void) => cb(new ArrayBuffer(0))
  })
};

function makeResult(overrides: Partial<Result> & {best?: number; average?: number} = {}): Result {
  return {
    personId: 1,
    ranking: 1,
    attempts: [],
    best: 0,
    average: 0,
    ...overrides
  } as Result;
}

function makePerson(name: string, registrantId: number, roles: string[] = []): Person {
  return {name, registrantId, roles} as Person;
}

function makeWcif(persons: Person[] = []): WCIF {
  return {
    id: 'Test2024',
    name: 'Test Competition 2024',
    shortName: 'Test 2024',
    persons,
    events: [],
    schedule: {},
    competitorLimit: null,
    extensions: []
  };
}

function makeEvent(id: string): Event {
  return {
    id,
    rounds: [{id: `${id}-f`, format: 'a', results: []}]
  } as unknown as Event;
}

describe('PrintService', () => {
  let service: PrintService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PrintService);
  });

  describe('formatResultForEvent', () => {
    // Access private method via bracket notation
    function formatResult(result: Result, eventId: string): string {
      return service['formatResultForEvent'](result, eventId);
    }

    it('should format FMC with mean when average is available', () => {
      const result = makeResult({average: 2867, best: 27});
      const formatted = formatResult(result, '333fm');
      expect(formatted).toBe('28.67');
    });

    it('should format FMC with best when no average', () => {
      const result = makeResult({average: 0, best: 31});
      const formatted = formatResult(result, '333fm');
      expect(formatted).toBe('31');
    });

    it('should format FMC as DNF when best is DNF', () => {
      const result = makeResult({average: 0, best: -1});
      const formatted = formatResult(result, '333fm');
      expect(formatted).toBe('DNF');
    });

    it('should format 3x3 blindfolded with best time', () => {
      const result = makeResult({best: 6543, average: 7200});
      const formatted = formatResult(result, '333bf');
      // formatCentiseconds(6543) = "1:05.43"
      expect(formatted).toBe('1:05.43');
    });

    it('should format 4x4 blindfolded with best time', () => {
      const result = makeResult({best: 30000});
      const formatted = formatResult(result, '444bf');
      expect(formatted).toBe('5:00.00');
    });

    it('should format 5x5 blindfolded with best time', () => {
      const result = makeResult({best: 60000});
      const formatted = formatResult(result, '555bf');
      expect(formatted).toBe('10:00.00');
    });

    it('should format 3x3 multi-blind result', () => {
      // Multi-blind encoding: 99-points followed by time and missed
      const result = makeResult({best: 580345602});
      const formatted = formatResult(result, '333mbf');
      // This encodes to a multi-blind result string
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe('string');
    });

    it('should format default events with average when available', () => {
      const result = makeResult({average: 1234, best: 1100});
      const formatted = formatResult(result, '333');
      // formatCentiseconds(1234) = "12.34"
      expect(formatted).toBe('12.34');
    });

    it('should format default events with best when no average', () => {
      const result = makeResult({average: 0, best: 1100});
      const formatted = formatResult(result, '333');
      expect(formatted).toBe('11.00');
    });

    it('should format default events with negative average using best', () => {
      const result = makeResult({average: -1, best: 987});
      const formatted = formatResult(result, '333');
      expect(formatted).toBe('9.87');
    });
  });

  describe('formatFmcMean', () => {
    function formatFmcMean(mean: number): string | null {
      return service['formatFmcMean'](mean);
    }

    it('should format a normal FMC mean', () => {
      expect(formatFmcMean(2867)).toBe('28.67');
    });

    it('should format a short FMC mean', () => {
      expect(formatFmcMean(2500)).toBe('25.00');
    });

    it('should return DNF for -1', () => {
      expect(formatFmcMean(-1)).toBe('DNF');
    });

    it('should return null for null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(formatFmcMean(null as any)).toBeNull();
    });

    it('should return null for undefined', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(formatFmcMean(undefined as any)).toBeNull();
    });
  });

  describe('getPersonsWithRole', () => {
    function getPersonsWithRole(wcif: WCIF, role: string): string {
      return service['getPersonsWithRole'](wcif, role);
    }

    it('should return single delegate name', () => {
      const wcif = makeWcif([makePerson('John Doe', 1, ['delegate'])]);
      expect(getPersonsWithRole(wcif, 'delegate')).toBe('John Doe');
    });

    it('should join two persons with "and"', () => {
      const wcif = makeWcif([
        makePerson('Alice Smith', 1, ['organizer']),
        makePerson('Bob Jones', 2, ['organizer'])
      ]);
      expect(getPersonsWithRole(wcif, 'organizer')).toBe('Alice Smith and Bob Jones');
    });

    it('should join three persons with commas and "and"', () => {
      const wcif = makeWcif([
        makePerson('Charlie Brown', 3, ['organizer']),
        makePerson('Alice Smith', 1, ['organizer']),
        makePerson('Bob Jones', 2, ['organizer'])
      ]);
      // Sorted alphabetically: Alice, Bob, Charlie -> "Alice Smith, Bob Jones and Charlie Brown"
      expect(getPersonsWithRole(wcif, 'organizer')).toBe('Alice Smith, Bob Jones and Charlie Brown');
    });

    it('should only include persons with the specified role', () => {
      const wcif = makeWcif([
        makePerson('Alice Smith', 1, ['delegate']),
        makePerson('Bob Jones', 2, ['organizer']),
        makePerson('Charlie Brown', 3, ['delegate'])
      ]);
      expect(getPersonsWithRole(wcif, 'delegate')).toBe('Alice Smith and Charlie Brown');
    });

    it('should strip local names in parentheses by default', () => {
      service.showLocalNames = false;
      const wcif = makeWcif([makePerson('John Doe (ジョン)', 1, ['delegate'])]);
      expect(getPersonsWithRole(wcif, 'delegate')).toBe('John Doe');
    });

    it('should keep local names when showLocalNames is true', () => {
      service.showLocalNames = true;
      const wcif = makeWcif([makePerson('John Doe (ジョン)', 1, ['delegate'])]);
      expect(getPersonsWithRole(wcif, 'delegate')).toBe('John Doe (ジョン)');
    });
  });

  describe('getPlace', () => {
    function getPlace(place: number): string {
      return service['getPlace'](place);
    }

    it('should return "first" for place 1', () => {
      expect(getPlace(1)).toBe('first');
    });

    it('should return "second" for place 2', () => {
      expect(getPlace(2)).toBe('second');
    });

    it('should return "third" for place 3', () => {
      expect(getPlace(3)).toBe('third');
    });

    it('should return empty string for non-podium places', () => {
      expect(getPlace(4)).toBe('');
      expect(getPlace(0)).toBe('');
    });
  });

  describe('JSON fallbacks', () => {
    it('should fall back to the default certificate template when the current JSON is invalid', () => {
      service.podiumCertificateJson = '{"broken":';
      const certificate = new Certificate();
      certificate.delegate = 'Jane Delegate';
      certificate.organizers = 'Org One and Org Two';
      certificate.competitionName = 'Irish Open 2024';
      certificate.name = 'Max Solver';
      certificate.place = 'first';
      certificate.event = '3x3x3';
      certificate.resultType = 'an average';
      certificate.result = '8.45';
      certificate.resultUnit = '';
      certificate.locationAndDate = 'Dublin, 2024';

      const content = service['getOneCertificateContent'](certificate);

      expect(content.text).toBeTruthy();
    });

    it('should ignore invalid style JSON instead of crashing document generation', () => {
      service.podiumCertificateStyleJson = '{"font":';

      const document = service['getDocument']('landscape', null, false);

      expect(document.defaultStyle.fontSize).toBe(22);
    });
  });

  describe('replaceStringsIn', () => {
    function replaceStringsIn(template: string, certificate: Certificate): string {
      return service['replaceStringsIn'](template, certificate);
    }

    function makeCertificate(): Certificate {
      const cert = new Certificate();
      cert.delegate = 'Jane Delegate';
      cert.organizers = 'Org One and Org Two';
      cert.competitionName = 'Irish Open 2024';
      cert.name = 'Max Solver';
      cert.place = 'first';
      cert.event = '3x3x3';
      cert.resultType = 'an average';
      cert.result = '8.45';
      cert.resultUnit = '';
      cert.locationAndDate = 'Dublin, 2024';
      return cert;
    }

    it('should replace all certificate placeholders', () => {
      const cert = makeCertificate();
      const template = 'certificate.name won certificate.capitalisedPlace at certificate.competitionName in certificate.event with certificate.resultType of certificate.result certificate.resultUnit';
      const result = replaceStringsIn(template, cert);
      expect(result).toBe('Max Solver won First at Irish Open 2024 in 3x3x3 with an average of 8.45 ');
    });

    it('should replace certificate.delegate and certificate.organizers', () => {
      const cert = makeCertificate();
      const template = 'Delegate: certificate.delegate, Organizers: certificate.organizers';
      const result = replaceStringsIn(template, cert);
      expect(result).toBe('Delegate: Jane Delegate, Organizers: Org One and Org Two');
    });

    it('should replace certificate.place (lowercase) and certificate.capitalisedPlace separately', () => {
      const cert = makeCertificate();
      cert.place = 'second';
      const template = 'certificate.capitalisedPlace Place - certificate.place';
      const result = replaceStringsIn(template, cert);
      expect(result).toBe('Second Place - second');
    });

    it('should replace certificate.locationAndDate', () => {
      const cert = makeCertificate();
      const template = 'certificate.locationAndDate';
      const result = replaceStringsIn(template, cert);
      expect(result).toBe('Dublin, 2024');
    });
  });

  describe('getResultType', () => {
    function getResultType(format: string, result: Result): string {
      return service['getResultType'](format, result);
    }

    it('should return "an average" for format "a" with positive average', () => {
      expect(getResultType('a', makeResult({average: 1234}))).toBe('an average');
    });

    it('should return "a best result" for format "a" with no average', () => {
      expect(getResultType('a', makeResult({average: 0}))).toBe('a best result');
    });

    it('should return "a mean" for format "m" with positive average', () => {
      expect(getResultType('m', makeResult({average: 1234}))).toBe('a mean');
    });

    it('should return "a best result" for format "m" with no average', () => {
      expect(getResultType('m', makeResult({average: 0}))).toBe('a best result');
    });

    it('should return "a best result" for best-of formats', () => {
      expect(getResultType('1', makeResult())).toBe('a best result');
      expect(getResultType('2', makeResult())).toBe('a best result');
      expect(getResultType('3', makeResult())).toBe('a best result');
    });

    it('should return "a result" for unknown format', () => {
      expect(getResultType('x', makeResult())).toBe('a result');
    });
  });

  describe('getResultUnit', () => {
    function getResultUnit(eventId: string): string {
      return service['getResultUnit'](eventId);
    }

    it('should return "moves" for FMC', () => {
      expect(getResultUnit('333fm')).toBe('moves');
    });

    it('should return empty string for other events', () => {
      expect(getResultUnit('333')).toBe('');
      expect(getResultUnit('222')).toBe('');
      expect(getResultUnit('pyram')).toBe('');
    });
  });

  describe('getEventName', () => {
    it('should strip " Cube" from event names', () => {
      expect(service.getEventName('333')).toBe('3x3x3');
      expect(service.getEventName('222')).toBe('2x2x2');
    });

    it('should return full name for non-cube events', () => {
      expect(service.getEventName('pyram')).toBe('Pyraminx');
      expect(service.getEventName('clock')).toBe('Clock');
    });
  });

  describe('resetPodiumCertificateJson', () => {
    it('should reset to DEFAULT_CERTIFICATE_JSON', () => {
      service.podiumCertificateJson = '[]';
      service.resetPodiumCertificateJson();
      expect(service.podiumCertificateJson).toBe(DEFAULT_CERTIFICATE_JSON);
    });
  });

  describe('getCertificates', () => {
    function getCertificates(
      events: string[],
      wcif: WCIF,
      apiResults: WcaApiResult[] = []
    ): Certificate[] {
      return service['getCertificates'](events, wcif, apiResults);
    }

    function makeApiResult(overrides: Partial<WcaApiResult>): WcaApiResult {
      return {
        id: 1,
        pos: 1,
        best: 800,
        average: 900,
        name: 'New Person',
        country_iso2: 'IE',
        competition_id: 'Test2024',
        event_id: '333',
        round_type_id: '1',
        format_id: 'a',
        wca_id: '',
        attempts: [900],
        best_index: 0,
        worst_index: 0,
        regional_single_record: null,
        regional_average_record: null,
        ...overrides
      };
    }

    it('should generate blank certificates when final round has no results', () => {
      const wcif = makeWcif([
        makePerson('Delegate One', 1, ['delegate']),
        makePerson('Organizer One', 2, ['organizer'])
      ]);
      wcif.events = [makeEvent('333')];

      const certificates = getCertificates(['333'], wcif);

      expect(certificates.length).toBe(3);
    });

    it('should include placeholder space for name and result', () => {
      const wcif = makeWcif([
        makePerson('Delegate One', 1, ['delegate']),
        makePerson('Organizer One', 2, ['organizer'])
      ]);
      wcif.events = [makeEvent('333')];

      const certificates = getCertificates(['333'], wcif);
      const cert = certificates[0];

      expect(cert.place).toBe('third');
      expect(cert.name).toMatch(/^\s+$/);
      expect(cert.name.length).toBeGreaterThan(1);
      expect(cert.result).toMatch(/^\s+$/);
      expect(cert.result.length).toBeGreaterThan(1);
      expect(cert.resultType).toBe('a result');
    });

    it('should not generate blank certificates when final round has results', () => {
      spyOn(window, 'alert');
      const wcif = makeWcif([
        makePerson('Delegate One', 1, ['delegate']),
        makePerson('Organizer One', 2, ['organizer'])
      ]);
      const event = makeEvent('333') as EventWithPodium;
      event.hasPodiumResults = true;
      event.podiumFormat = 'a';
      event.podiumSourceResults = [makeResult({personId: 1, ranking: 1, best: 800})];
      wcif.events = [event];

      const certificates = getCertificates(['333'], wcif);

      expect(certificates.length).toBe(0);
      expect(window.alert).toHaveBeenCalled();
    });

    it('should generate fastest newcomer certs with certificate event title', () => {
      const wcif = makeWcif([
        makePerson('Delegate One', 2, ['delegate']),
        makePerson('Organizer One', 3, ['organizer'])
      ]);
      wcif.events = [makeEvent('333')];

      const apiResults = [
        makeApiResult({name: 'New Person', best: 1100, average: 1200, wca_id: ''})
      ];
      const certificates = getCertificates([UNOFFICIAL_FASTEST_NEWCOMER_333_R1], wcif, apiResults);
      const definition = getUnofficialCertificateDefinition(UNOFFICIAL_FASTEST_NEWCOMER_333_R1);

      expect(certificates.length).toBe(1);
      expect(certificates[0].event).toBe(definition?.certificateEventName);
      expect(certificates[0].name).toBe('New Person');
    });
  });
});
