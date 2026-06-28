import {Event} from '@wca/helpers/lib/models/event';
import {Person} from '@wca/helpers';
import type {LiveRound, Result as WcaApiResult} from '../wca-api/openapiClient';
import {WCIF} from './types';
import {
  applyPodiumDataToEvents,
  buildEventPodiumData,
  buildPersonIndex,
  derivePodiumPlaces,
  filterPodiumResults,
  getEventPodiumWarning,
  parseEventIdFromRoundId,
  PodiumResult,
} from './podium-data';

function makeWcif(events: Event[], persons: Person[]): WCIF {
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

function makePerson(name: string, registrantId: number, wcaId: string | null = '2010OLD01'): Person {
  return {name, registrantId, wcaId, countryIso2: 'IE', roles: [], registration: {status: 'accepted'}} as Person;
}

function makePodiumResult(
  ranking: number,
  best: number,
  average = 0,
  personId = 1,
  countryIso2 = 'IE'
): PodiumResult {
  return {ranking, best, average, personId, attempts: [], countryIso2};
}

describe('podium-data', () => {
  it('should parse event ids from round ids', () => {
    expect(parseEventIdFromRoundId('333-r1')).toBe('333');
    expect(parseEventIdFromRoundId('clock-r3')).toBe('clock');
  });

  it('should map live podium results using global_pos and competitors', () => {
    const liveRound: LiveRound = {
      id: '333-r3',
      format: 'a',
      results: [
        {
          registration_id: 10,
          best: 800,
          average: 900,
          global_pos: 1,
          local_pos: 1,
          round_wcif_id: '333-r3',
          single_record_tag: '',
          average_record_tag: '',
          advancing: true,
          advancing_questionable: false,
          attempts: [{value: 900, attempt_number: 1}],
          last_attempt_entered_at: '2026-01-01T00:00:00Z'
        }
      ],
      competitors: [{
        id: 10,
        registrant_id: 1,
        user_id: 1,
        name: 'Alice',
        country_iso2: 'IE'
      }],
      round_id: 1,
      state_hash: 'abc',
      scrambleSetCount: 1,
      scrambleSets: [],
      extensions: []
    };

    const wcif = makeWcif([{id: '333', rounds: []} as Event], [makePerson('Alice', 1)]);
    const podiumData = buildEventPodiumData(
      {id: '333', rounds: []} as Event,
      [liveRound],
      [],
      buildPersonIndex(wcif)
    );

    expect(podiumData.hasPodiumResults).toBeTrue();
    expect(podiumData.podiumFormat).toBe('a');
    expect(podiumData.podiumSourceResults[0].personId).toBe(1);
    expect(podiumData.podiumSourceResults[0].ranking).toBe(1);
  });

  it('should fall back to published podiums when live podiums are unavailable', () => {
    const published: WcaApiResult[] = [{
      id: 1,
      pos: 1,
      best: 700,
      average: 800,
      name: 'Bob',
      country_iso2: 'IE',
      competition_id: 'Test2024',
      event_id: '222',
      round_type_id: 'f',
      format_id: 'a',
      wca_id: '2010BOB01',
      attempts: [800],
      best_index: 0,
      worst_index: 0,
      regional_single_record: null,
      regional_average_record: null
    }];

    const wcif = makeWcif(
      [{id: '222', rounds: [{id: '222-r1', format: 'a', results: []}]} as Event],
      [makePerson('Bob', 2, '2010BOB01')]
    );
    const podiumData = buildEventPodiumData(
      wcif.events[0],
      [],
      published,
      buildPersonIndex(wcif)
    );

    expect(podiumData.hasPodiumResults).toBeTrue();
    expect(podiumData.podiumSourceResults[0].personId).toBe(2);
  });

  it('should attach podium data to wcif events immutably', () => {
    const wcif = makeWcif([{id: '333', rounds: []} as Event], []);
    const originalEvent = wcif.events[0];
    const events = applyPodiumDataToEvents(wcif, [], []);
    expect(events[0].hasPodiumResults).toBeFalse();
    expect(events[0].id).toBe(originalEvent.id);
  });

  describe('filterPodiumResults', () => {
    it('should remove DNF results', () => {
      const filtered = filterPodiumResults([
        makePodiumResult(1, 800),
        makePodiumResult(2, -1),
        makePodiumResult(3, 0),
      ], '');
      expect(filtered.length).toBe(1);
    });

    it('should filter by country codes', () => {
      const filtered = filterPodiumResults([
        makePodiumResult(1, 800, 0, 1, 'IE'),
        makePodiumResult(2, 900, 0, 2, 'GB'),
        makePodiumResult(3, 1000, 0, 3, 'US'),
      ], 'IE;GB');
      expect(filtered.map(result => result.countryIso2)).toEqual(['IE', 'GB']);
    });
  });

  describe('derivePodiumPlaces', () => {
    it('should compute podium warnings from source results', () => {
      const warning = getEventPodiumWarning({
        hasPodiumResults: true,
        podiumSourceResults: [
          makePodiumResult(1, 800),
          makePodiumResult(2, 900),
        ],
      }, '');
      expect(warning).toBe('Only 2 persons on the podium!');
    });

    it('should derive podium places with country filtering', () => {
      const places = derivePodiumPlaces([
        makePodiumResult(1, 800, 0, 1, 'IE'),
        makePodiumResult(2, 900, 0, 2, 'GB'),
      ], 'IE');
      expect(places.length).toBe(1);
      expect(places[0].countryIso2).toBe('IE');
    });
  });
});
