import {Result} from '@wca/helpers/lib/models/result';
import type {Result as WcaApiResult} from '../wca-api/openapiClient';
import {WCIF} from './types';
import {getPodiumWarning} from './podium';
import {
  computeFastestNewcomer333Podium,
  getFastestNewcomer333Format,
  hasFastestNewcomer333SourceResults,
} from './podium-data';

/** Internal id passed to PrintService with official event ids */
export const UNOFFICIAL_FASTEST_NEWCOMER_333_R1 = 'unofficial:fastest-newcomer-333-r1';

export interface UnofficialCertificateDefinition {
  id: string;
  label: string;
  eventIdForFormat: string;
  certificateEventName: string;
  computePodium: (wcif: WCIF, apiResults: WcaApiResult[], countriesFilter: string) => Result[];
  hasSourceResults: (apiResults: WcaApiResult[]) => boolean;
  getSourceFormat: (apiResults: WcaApiResult[]) => string | null;
}

export function isUnofficialCertificateId(id: string): boolean {
  return id.startsWith('unofficial:');
}

export const UNOFFICIAL_CERTIFICATE_DEFINITIONS: readonly UnofficialCertificateDefinition[] = [
  {
    id: UNOFFICIAL_FASTEST_NEWCOMER_333_R1,
    label: 'Fastest Newcomer (First Round)',
    eventIdForFormat: '333',
    certificateEventName: '3x3x3 Newcomer',
    computePodium: computeFastestNewcomer333Podium,
    hasSourceResults: hasFastestNewcomer333SourceResults,
    getSourceFormat: getFastestNewcomer333Format,
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

interface UnofficialPodiumState {
  hasSource: boolean;
  podium: Result[];
}

function getUnofficialPodiumState(
  id: string,
  wcif: WCIF | null,
  apiResults: WcaApiResult[],
  countriesFilter: string
): UnofficialPodiumState {
  const definition = getUnofficialCertificateDefinition(id);
  if (!definition || !wcif) {
    return {hasSource: false, podium: []};
  }

  const hasSource = definition.hasSourceResults(apiResults);
  const podium = hasSource
    ? definition.computePodium(wcif, apiResults, countriesFilter)
    : [];

  return {hasSource, podium};
}

export function getUnofficialPodium(
  id: string,
  wcif: WCIF,
  apiResults: WcaApiResult[],
  countriesFilter: string
): Result[] {
  return getUnofficialPodiumState(id, wcif, apiResults, countriesFilter).podium;
}

export function getUnofficialWarning(
  id: string,
  wcif: WCIF | null,
  apiResults: WcaApiResult[],
  countriesFilter: string
): string {
  if (!wcif) {
    return getPodiumWarning(0);
  }
  const {podium} = getUnofficialPodiumState(id, wcif, apiResults, countriesFilter);
  return getPodiumWarning(podium.length);
}

export function shouldGenerateBlankUnofficialCertificates(
  id: string,
  wcif: WCIF | null,
  apiResults: WcaApiResult[],
  countriesFilter: string
): boolean {
  const {hasSource, podium} = getUnofficialPodiumState(id, wcif, apiResults, countriesFilter);
  if (!wcif) {
    return false;
  }
  return !hasSource || podium.length === 0;
}
