import {Result} from '@wca/helpers/lib/models/result';
import {Helpers} from './helpers';

export function primaryTime(result: Pick<Result, 'best' | 'average'>): number {
  return result.average > 0 ? result.average : result.best;
}

export function compareByPrimaryTime(
  a: Pick<Result, 'best' | 'average'>,
  b: Pick<Result, 'best' | 'average'>
): number {
  const aTime = primaryTime(a);
  const bTime = primaryTime(b);
  if (aTime !== bTime) {
    return aTime - bTime;
  }
  return a.best - b.best;
}

export function getPodiumWarning(podiumLength: number, includeOverflowWarning = false): string {
  switch (podiumLength) {
    case 0:
      return 'Not available yet';
    case 1:
      return 'Only 1 person on the podium!';
    case 2:
      return 'Only 2 persons on the podium!';
    default:
      return includeOverflowWarning && podiumLength > 3
        ? 'More than 3 persons on the podium!'
        : '';
  }
}

export function podiumByRanking(results: Result[]): Result[] {
  if (results.length === 0) {
    return [];
  }

  const sorted = [...results];
  Helpers.sortResultsByRanking(sorted);

  const podium = sorted.slice(0, 3);
  if (podium.length === 3) {
    let index = 3;
    const thirdRanking = podium[2].ranking;
    while (index < sorted.length && sorted[index].ranking === thirdRanking) {
      podium.push(sorted[index]);
      index++;
    }
  }

  podium.forEach(result => {
    result['rankingAfterFiltering'] = podium.filter(other => other.ranking < result.ranking).length + 1;
  });

  return podium.reverse();
}

export function podiumByFastestTime(results: Result[]): Result[] {
  if (results.length === 0) {
    return [];
  }

  const sorted = [...results].sort(compareByPrimaryTime);
  const podium = sorted.slice(0, 3);
  if (podium.length === 3) {
    let index = 3;
    const thirdTime = primaryTime(podium[2]);
    while (index < sorted.length && primaryTime(sorted[index]) === thirdTime) {
      podium.push(sorted[index]);
      index++;
    }
  }

  for (let index = 0; index < podium.length; index++) {
    if (index > 0 && primaryTime(podium[index]) === primaryTime(podium[index - 1])) {
      podium[index]['rankingAfterFiltering'] = podium[index - 1]['rankingAfterFiltering'];
    } else {
      podium[index]['rankingAfterFiltering'] = index + 1;
    }
  }

  return podium.reverse();
}
