import {Result} from '@wca/helpers/lib/models/result';
import type {Result as WcaApiResult} from '../wca-api/openapiClient';
import {LoadedWCIF, WCIF} from './types';
import {compareByPrimaryTime, getPodiumWarning, podiumByFastestTime} from './podium';
import {
  buildPersonIndex,
  filterPodiumResults,
  mapApiResultsToPodiumResults,
  PodiumResult,
} from './podium-data';

/** Internal id passed to PrintService with official event ids */
export const UNOFFICIAL_FASTEST_NEWCOMER_333_R1 = 'unofficial:fastest-newcomer-333-r1';

export interface UnofficialPodiumState {
  hasSource: boolean;
  format: string | null;
  podium: Result[];
}

export interface UnofficialCertificateDefinition {
  id: string;
  label: string;
  eventIdForFormat: string;
  certificateEventName: string;
  buildState: (
    wcif: LoadedWCIF,
    apiResults: WcaApiResult[],
    countriesFilter: string
  ) => UnofficialPodiumState;
}

export function isUnofficialCertificateId(id: string): boolean {
  return id.startsWith('unofficial:');
}

interface Newcomer333RoundResults {
  firstRound: WcaApiResult[];
  secondRound: WcaApiResult[];
  anyRound: WcaApiResult[];
}

function selectNewcomer333RoundResults(apiResults: WcaApiResult[]): Newcomer333RoundResults {
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

function computeFastestNewcomer333Podium(
  wcif: WCIF,
  apiResults: WcaApiResult[],
  countriesFilter: string
): PodiumResult[] {
  const personIndex = buildPersonIndex(wcif);
  const {firstRound, secondRound} = selectNewcomer333RoundResults(apiResults);

  const mergedApiResults = secondRound.length
    ? mergeBestApiResultsPerPerson(firstRound.concat(secondRound))
    : firstRound;

  const newcomers = mapApiResultsToPodiumResults(mergedApiResults, personIndex)
    .filter(result => personIndex.isNewcomer(result.personId));

  return podiumByFastestTime(filterPodiumResults(newcomers, countriesFilter)) as PodiumResult[];
}

function buildFastestNewcomer333State(
  wcif: LoadedWCIF,
  apiResults: WcaApiResult[],
  countriesFilter: string
): UnofficialPodiumState {
  const {anyRound} = selectNewcomer333RoundResults(apiResults);
  const hasSource = anyRound.length > 0;
  const format = anyRound[0]?.format_id ?? null;

  if (!hasSource) {
    return {hasSource: false, format: null, podium: []};
  }

  return {
    hasSource: true,
    format,
    podium: computeFastestNewcomer333Podium(wcif, apiResults, countriesFilter),
  };
}

export const UNOFFICIAL_CERTIFICATE_DEFINITIONS: readonly UnofficialCertificateDefinition[] = [
  {
    id: UNOFFICIAL_FASTEST_NEWCOMER_333_R1,
    label: 'Fastest Newcomer (First Round)',
    eventIdForFormat: '333',
    certificateEventName: '3x3x3 Newcomer',
    buildState: buildFastestNewcomer333State,
  },
] as const;

export function getUnofficialCertificateDefinition(id: string): UnofficialCertificateDefinition | undefined {
  return UNOFFICIAL_CERTIFICATE_DEFINITIONS.find(definition => definition.id === id);
}

export function createUnofficialCertificateSelection(): Record<string, boolean> {
  return UNOFFICIAL_CERTIFICATE_DEFINITIONS.reduce<Record<string, boolean>>((selection, definition) => {
    selection[definition.id] = false;
    return selection;
  }, {});
}

export function buildUnofficialPodiumStates(
  wcif: LoadedWCIF,
  apiResults: WcaApiResult[],
  countriesFilter: string
): Record<string, UnofficialPodiumState> {
  return Object.fromEntries(
    UNOFFICIAL_CERTIFICATE_DEFINITIONS.map(definition => [
      definition.id,
      definition.buildState(wcif, apiResults, countriesFilter),
    ])
  );
}

export function getUnofficialWarningFromState(state: UnofficialPodiumState): string {
  return getPodiumWarning(state.podium.length);
}

export function shouldGenerateBlankUnofficialCertificatesFromState(
  state: UnofficialPodiumState
): boolean {
  return !state.hasSource || state.podium.length === 0;
}
