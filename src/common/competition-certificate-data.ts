import type {LiveRound, Result as WcaApiResult} from '../wca-api/openapiClient';
import {LoadedWCIF, WCIF, WcaApiLoadOutcome} from './types';
import {
  applyPodiumDataToEvents,
  EventWithPodium,
  getEventPodiumWarning,
} from './podium-data';
import {
  buildUnofficialPodiumStates,
  getUnofficialWarningFromState,
  shouldGenerateBlankUnofficialCertificatesFromState,
  UNOFFICIAL_CERTIFICATE_DEFINITIONS,
  UnofficialPodiumState,
} from './unofficial-certificates';

export interface CompetitionCertificateData {
  wcif: LoadedWCIF;
  competitionResults: WcaApiResult[];
  unofficialPodiums: Record<string, UnofficialPodiumState>;
  apiLoadErrors: string[];
}

export interface CompetitionApiSources {
  wcif: WCIF;
  livePodiums: WcaApiLoadOutcome<LiveRound[]>;
  publishedPodiums: WcaApiLoadOutcome<WcaApiResult[]>;
  competitionResults: WcaApiLoadOutcome<WcaApiResult[]>;
}

function collectApiLoadErrors(sources: Omit<CompetitionApiSources, 'wcif'>): string[] {
  const errors: string[] = [];
  if (sources.livePodiums.outcome === 'error') {
    errors.push('Failed to load live podiums');
  }
  if (sources.publishedPodiums.outcome === 'error') {
    errors.push('Failed to load published podiums');
  }
  if (sources.competitionResults.outcome === 'error') {
    errors.push('Failed to load competition results');
  }
  return errors;
}

export function buildCompetitionCertificateData(
  sources: CompetitionApiSources,
  countriesFilter: string
): CompetitionCertificateData {
  const livePodiums = sources.livePodiums.data;
  const publishedPodiums = sources.publishedPodiums.data;
  const competitionResults = sources.competitionResults.data;
  const events = applyPodiumDataToEvents(sources.wcif, livePodiums, publishedPodiums);

  return {
    wcif: {...sources.wcif, events},
    competitionResults,
    unofficialPodiums: buildUnofficialPodiumStates(
      {...sources.wcif, events},
      competitionResults,
      countriesFilter
    ),
    apiLoadErrors: collectApiLoadErrors(sources),
  };
}

export function applyCountriesFilter(
  data: CompetitionCertificateData,
  countriesFilter: string
): CompetitionCertificateData {
  return {
    ...data,
    unofficialPodiums: buildUnofficialPodiumStates(
      data.wcif,
      data.competitionResults,
      countriesFilter
    ),
  };
}

export function computeEventWarnings(
  events: EventWithPodium[],
  countriesFilter: string
): Record<string, string> {
  return Object.fromEntries(
    events.map(event => [
      event.id,
      getEventPodiumWarning(event, countriesFilter, true),
    ])
  );
}

export function computeUnofficialWarnings(
  unofficialPodiums: Record<string, UnofficialPodiumState>
): Record<string, string> {
  return Object.fromEntries(
    UNOFFICIAL_CERTIFICATE_DEFINITIONS.map(definition => [
      definition.id,
      getUnofficialWarningFromState(
        unofficialPodiums[definition.id] ?? emptyUnofficialPodiumState()
      ),
    ])
  );
}

export function shouldGenerateBlankUnofficialCertificates(
  unofficialId: string,
  unofficialPodiums: Record<string, UnofficialPodiumState>
): boolean {
  return shouldGenerateBlankUnofficialCertificatesFromState(
    unofficialPodiums[unofficialId] ?? emptyUnofficialPodiumState()
  );
}

function emptyUnofficialPodiumState(): UnofficialPodiumState {
  return {hasSource: false, format: null, podium: []};
}
