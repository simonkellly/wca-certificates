import {Event} from '@wca/helpers/lib/models/event';
import {Result} from '@wca/helpers/lib/models/result';
import {Person} from '@wca/helpers';
import type {LiveRound, Result as WcaApiResult} from '../wca-api/openapiClient';
import {getPodiumWarning, podiumByRanking} from './podium';
import {WCIF} from './types';

export interface PodiumResult extends Result {
  countryIso2?: string;
  rankingAfterFiltering?: number;
}

export interface EventPodiumFields {
  hasPodiumResults: boolean;
  podiumFormat: string | null;
  podiumSourceResults: PodiumResult[];
}

export type EventWithPodium = Event & EventPodiumFields & {
  printCertificate?: boolean;
};

export interface PersonIndex {
  resolveRegistrantId(wcaId: string, name: string): number;
  resolvePerson(registrantId: number): Person | undefined;
  isNewcomer(registrantId: number): boolean;
}

export function parseEventIdFromRoundId(roundId: string): string {
  return roundId.replace(/-r\d+$/, '');
}

export function buildPersonIndex(wcif: WCIF): PersonIndex {
  const byName = new Map(wcif.persons.map(person => [person.name, person]));
  const byWcaId = new Map(
    wcif.persons.filter(person => person.wcaId).map(person => [person.wcaId!, person])
  );
  const byRegistrantId = new Map(wcif.persons.map(person => [person.registrantId, person]));

  return {
    resolveRegistrantId(wcaId: string, name: string): number {
      return byWcaId.get(wcaId)?.registrantId ?? byName.get(name)?.registrantId ?? 0;
    },
    resolvePerson(registrantId: number): Person | undefined {
      return byRegistrantId.get(registrantId);
    },
    isNewcomer(registrantId: number): boolean {
      const person = byRegistrantId.get(registrantId);
      return !!person && !person.wcaId;
    },
  };
}

function mapAttempts(values: number[]): Result['attempts'] {
  return values.map(attempt => ({
    result: attempt,
    reconstruction: null,
  }));
}

function toPodiumResult(fields: {
  personId: number;
  ranking: number;
  best: number;
  average: number;
  attempts: Result['attempts'];
  countryIso2?: string;
}): PodiumResult {
  return {
    personId: fields.personId,
    ranking: fields.ranking,
    best: fields.best,
    average: fields.average,
    attempts: fields.attempts,
    countryIso2: fields.countryIso2,
  };
}

function mapLiveRoundResults(liveRound: LiveRound): PodiumResult[] {
  const competitorsByRegistrationId = new Map(
    liveRound.competitors.map(competitor => [competitor.id, competitor])
  );

  return liveRound.results
    .filter(result => result.best > 0 && result.global_pos > 0)
    .sort((a, b) => a.global_pos - b.global_pos)
    .map(result => {
      const competitor = competitorsByRegistrationId.get(result.registration_id);
      return toPodiumResult({
        personId: competitor?.registrant_id ?? 0,
        ranking: result.global_pos,
        best: result.best,
        average: result.average,
        attempts: mapAttempts(result.attempts.map(attempt => attempt.value)),
        countryIso2: competitor?.country_iso2,
      });
    });
}

export function mapApiResultsToPodiumResults(
  apiResults: WcaApiResult[],
  personIndex: PersonIndex
): PodiumResult[] {
  return apiResults.map(result => toPodiumResult({
    personId: personIndex.resolveRegistrantId(result.wca_id, result.name),
    ranking: result.pos,
    best: result.best,
    average: result.average,
    attempts: mapAttempts(result.attempts),
    countryIso2: result.country_iso2,
  }));
}

function mapPublishedPodiumResults(
  publishedPodiums: WcaApiResult[],
  eventId: string,
  personIndex: PersonIndex
): PodiumResult[] {
  const eventResults = publishedPodiums
    .filter(result => result.event_id === eventId && result.best > 0 && result.pos > 0)
    .sort((a, b) => a.pos - b.pos);

  return mapApiResultsToPodiumResults(eventResults, personIndex);
}

export function buildEventPodiumData(
  event: Event,
  liveRounds: LiveRound[],
  publishedPodiums: WcaApiResult[],
  personIndex: PersonIndex
): EventPodiumFields {
  const liveRound = liveRounds.find(round => parseEventIdFromRoundId(round.id) === event.id);
  if (liveRound?.results?.length) {
    return {
      hasPodiumResults: true,
      podiumFormat: liveRound.format,
      podiumSourceResults: mapLiveRoundResults(liveRound),
    };
  }

  const publishedResults = mapPublishedPodiumResults(publishedPodiums, event.id, personIndex);
  if (publishedResults.length) {
    const format = publishedPodiums.find(result => result.event_id === event.id)?.format_id
      ?? event.rounds?.[event.rounds.length - 1]?.format
      ?? null;

    return {
      hasPodiumResults: true,
      podiumFormat: format,
      podiumSourceResults: publishedResults,
    };
  }

  return {
    hasPodiumResults: false,
    podiumFormat: null,
    podiumSourceResults: [],
  };
}

export function applyPodiumDataToEvents(
  wcif: WCIF,
  liveRounds: LiveRound[],
  publishedPodiums: WcaApiResult[]
): EventWithPodium[] {
  const personIndex = buildPersonIndex(wcif);
  return wcif.events.map(event => ({
    ...event,
    ...buildEventPodiumData(event, liveRounds, publishedPodiums, personIndex),
  }));
}

export function filterPodiumResults(
  sourceResults: PodiumResult[],
  countriesFilter: string
): PodiumResult[] {
  let results = sourceResults.filter(result => result.best > 0);
  if (countriesFilter?.trim()) {
    const codes = countriesFilter.split(';').map(code => code.trim()).filter(Boolean);
    results = results.filter(result => result.countryIso2 && codes.includes(result.countryIso2));
  }
  return results;
}

export function derivePodiumPlaces(
  podiumSourceResults: PodiumResult[],
  countriesFilter: string
): PodiumResult[] {
  return podiumByRanking(filterPodiumResults(podiumSourceResults, countriesFilter)) as PodiumResult[];
}

export function getEventPodiumWarning(
  event: Pick<EventPodiumFields, 'hasPodiumResults' | 'podiumSourceResults'>,
  countriesFilter: string,
  includeOverflowWarning = true
): string {
  if (!event.hasPodiumResults) {
    return getPodiumWarning(0);
  }
  return getPodiumWarning(
    derivePodiumPlaces(event.podiumSourceResults, countriesFilter).length,
    includeOverflowWarning
  );
}
