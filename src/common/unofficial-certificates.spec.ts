import {Person} from '@wca/helpers';
import {LoadedWCIF} from './types';
import type {Result as WcaApiResult} from '../wca-api/openapiClient';
import {
  UNOFFICIAL_CERTIFICATE_DEFINITIONS,
  buildUnofficialPodiumStates,
  createUnofficialCertificateSelection,
} from './unofficial-certificates';
import {getPodiumWarning, podiumByFastestTime} from './podium';
import {Result} from '@wca/helpers/lib/models/result';
import {Event} from '@wca/helpers/lib/models/event';
import {EventWithPodium} from './podium-data';

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

function makePerson(
  name: string,
  registrantId: number,
  wcaId: string | null | undefined,
  countryIso2 = 'IE'
): Person {
  return {name, registrantId, wcaId, countryIso2, roles: [], registration: {status: 'accepted'}} as Person;
}

function makeLoadedWcif(events: Event[], persons: Person[]): LoadedWCIF {
  const eventWithPodium = events.map(event => ({
    ...event,
    hasPodiumResults: false,
    podiumFormat: null,
    podiumSourceResults: [],
  })) as EventWithPodium[];

  return {
    id: 'Test2024',
    name: 'Test Competition 2024',
    shortName: 'Test 2024',
    persons,
    events: eventWithPodium,
    schedule: {},
    competitorLimit: null,
    extensions: []
  };
}

describe('unofficial-certificates', () => {
  describe('podiumByFastestTime', () => {
    it('should order by primary time (average when set)', () => {
      const a = makeResult({personId: 1, best: 900, average: 1000});
      const b = makeResult({personId: 2, best: 800, average: 1100});
      const c = makeResult({personId: 3, best: 950, average: 950});
      const podium = podiumByFastestTime([a, b, c]);
      expect(podium.length).toBe(3);
      expect(podium[2].personId).toBe(3);
      expect(podium[1].personId).toBe(1);
      expect(podium[0].personId).toBe(2);
    });
  });

  describe('buildUnofficialPodiumStates', () => {
    it('should only include registrants without a WCA ID', () => {
      const persons = [
        makePerson('Old', 1, '2010OLD01'),
        makePerson('New', 2, null)
      ];
      const wcif = makeLoadedWcif([{id: '333', rounds: []} as Event], persons);
      const apiResults = [
        makeApiResult({name: 'Old', wca_id: '2010OLD01', best: 700, average: 800, pos: 1}),
        makeApiResult({name: 'New', wca_id: '', best: 600, average: 700, pos: 2})
      ];

      const states = buildUnofficialPodiumStates(wcif, apiResults, '');
      const state = states[UNOFFICIAL_CERTIFICATE_DEFINITIONS[0].id];
      expect(state.podium.length).toBe(1);
      expect(state.podium[0].best).toBe(600);
      expect(state.format).toBe('a');
    });

    it('should respect countries filter', () => {
      const persons = [
        makePerson('IE', 1, null, 'IE'),
        makePerson('US', 2, null, 'US')
      ];
      const wcif = makeLoadedWcif([{id: '333', rounds: []} as Event], persons);
      const apiResults = [
        makeApiResult({name: 'IE', country_iso2: 'IE', best: 800, average: 900, pos: 1}),
        makeApiResult({name: 'US', country_iso2: 'US', best: 900, average: 1000, pos: 2})
      ];

      const states = buildUnofficialPodiumStates(wcif, apiResults, 'IE');
      const state = states[UNOFFICIAL_CERTIFICATE_DEFINITIONS[0].id];
      expect(state.podium.length).toBe(1);
      expect((state.podium[0] as {countryIso2?: string}).countryIso2).toBe('IE');
    });

    it('should merge best results across first and second rounds', () => {
      const wcif = makeLoadedWcif([{id: '333', rounds: []} as Event], [
        makePerson('Old', 1, '2010OLD01'),
        makePerson('New', 2, null)
      ]);

      const apiResults = [
        makeApiResult({name: 'Old', wca_id: '2010OLD01', best: 700, average: 800, pos: 1}),
        makeApiResult({name: 'New', wca_id: '', best: 900, average: 1000, pos: 2, round_type_id: '1'}),
        makeApiResult({name: 'New', wca_id: '', best: 850, average: 950, pos: 1, round_type_id: '2'})
      ];

      const states = buildUnofficialPodiumStates(wcif, apiResults, '');
      expect(states[UNOFFICIAL_CERTIFICATE_DEFINITIONS[0].id].podium[0].average).toBe(950);
    });
  });

  describe('definitions', () => {
    it('should expose unofficial certificate definitions for the UI', () => {
      expect(UNOFFICIAL_CERTIFICATE_DEFINITIONS.length).toBeGreaterThan(0);
      expect(UNOFFICIAL_CERTIFICATE_DEFINITIONS[0].label).toContain('Fastest Newcomer');
    });

    it('should create a disabled selection state for every unofficial certificate', () => {
      const selection = createUnofficialCertificateSelection();
      expect(Object.keys(selection)).toEqual(
        UNOFFICIAL_CERTIFICATE_DEFINITIONS.map(definition => definition.id)
      );
      expect(Object.values(selection)).toEqual(jasmine.arrayWithExactContents([false]));
    });

    it('should mirror official podium messages', () => {
      expect(getPodiumWarning(0)).toBe('Not available yet');
      expect(getPodiumWarning(1)).toBe('Only 1 person on the podium!');
      expect(getPodiumWarning(2)).toBe('Only 2 persons on the podium!');
      expect(getPodiumWarning(3)).toBe('');
    });
  });
});
