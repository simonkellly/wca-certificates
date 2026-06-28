import {Event} from '@wca/helpers/lib/models/event';
import {Result} from '@wca/helpers/lib/models/result';
import {Person} from '@wca/helpers';
import type {LiveRound, Result as WcaApiResult} from '../wca-api/openapiClient';
import {compareByPrimaryTime, getPodiumWarning, podiumByFastestTime, podiumByRanking} from './podium';
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

/** @deprecated Use EventWithPodium */
export type EventPodiumData = EventPodiumFields;

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

function mapAttempts(values: ({value: number} | number)[]): Result['attempts'] {
  return values.map(attempt => ({
    result: typeof attempt === 'number' ? attempt : attempt.value,
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
        attempts: mapAttempts(result.attempts),
        countryIso2: competitor?.country_iso2,
      });
    });
}

function mapWcaApiResults(
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

  return mapWcaApiResults(eventResults, personIndex);
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

export function computePodiumPlaces(sourceResults: PodiumResult[]): PodiumResult[] {
  return podiumByRanking(sourceResults) as PodiumResult[];
}

export function derivePodiumPlaces(
  podiumSourceResults: PodiumResult[],
  countriesFilter: string
): PodiumResult[] {
  return computePodiumPlaces(filterPodiumResults(podiumSourceResults, countriesFilter));
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

function mergeBestApiResultsPerPerson(results: WcaApiResult[]): WcaApiResult[] {
  const sorted = [...results].sort(compareByPrimaryTime);
  const seenKeys = new Set<string>();
  const merged: WcaApiResult[] = [];

  for (const result of sorted) {
    const key = result.wca_id || result.name;
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    merged.push(result);
  }

  return merged;
}

export interface Newcomer333RoundResults {
  firstRound: WcaApiResult[];
  secondRound: WcaApiResult[];
  anyRound: WcaApiResult[];
}

export function selectNewcomer333RoundResults(apiResults: WcaApiResult[]): Newcomer333RoundResults {
  const firstRound: WcaApiResult[] = [];
  const secondRound: WcaApiResult[] = [];

  for (const result of apiResults) {
    if (result.event_id !== '333' || result.best <= 0) {
      continue;
    }
    if (result.round_type_id === '1') {
      firstRound.push(result);
    } else if (result.round_type_id === '2') {
      secondRound.push(result);
    }
  }

  return {
    firstRound,
    secondRound,
    anyRound: firstRound.concat(secondRound),
  };
}

export function computeFastestNewcomer333Podium(
  wcif: WCIF,
  apiResults: WcaApiResult[],
  countriesFilter: string
): PodiumResult[] {
  const personIndex = buildPersonIndex(wcif);
  const {firstRound, secondRound} = selectNewcomer333RoundResults(apiResults);

  const mergedApiResults = secondRound.length
    ? mergeBestApiResultsPerPerson(firstRound.concat(secondRound))
    : firstRound;

  const newcomers = mapWcaApiResults(mergedApiResults, personIndex)
    .filter(result => personIndex.isNewcomer(result.personId));

  return podiumByFastestTime(filterPodiumResults(newcomers, countriesFilter)) as PodiumResult[];
}

export function hasFastestNewcomer333SourceResults(apiResults: WcaApiResult[]): boolean {
  return selectNewcomer333RoundResults(apiResults).anyRound.length > 0;
}

export function getFastestNewcomer333Format(apiResults: WcaApiResult[]): string | null {
  const {anyRound} = selectNewcomer333RoundResults(apiResults);
  return anyRound[0]?.format_id ?? null;
}
