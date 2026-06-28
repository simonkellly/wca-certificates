import {Injectable, inject} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable, forkJoin, from, of} from 'rxjs';
import {map, catchError} from 'rxjs/operators';
import {environment} from '../environments/environment';
import {AuthService} from './auth';
import {Competition, RawCompetition, CompetitionsApiResponse, WCIF} from './types';
import {configureWcaClient, client, getWcaAuthHeaders} from './wca-client';
import {
  competitionPodiums,
  livePodiums,
  resultsByCompetition,
  type LiveRound,
  type Result as WcaApiResult,
} from '../wca-api/openapiClient';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  private httpClient = inject(HttpClient);
  private authService = inject(AuthService);

  private ONE_YEAR = 365;
  private EIGHT_WEEKS = 56;
  private UNOFFICIAL_API_BASE = 'https://raw.githubusercontent.com/speedcubing-ireland/wca-analysis/api';
  private NORTHERN_IRELAND_COUNTIES = [
    'County Antrim',
    'County Armagh',
    'County Down',
    'County Fermanagh',
    'County Londonderry',
    'County Tyrone'
  ];

  constructor() {
    configureWcaClient(() => this.authService.getValidAccessToken());
  }

  private isNorthernIreland(city: string): boolean {
    return this.NORTHERN_IRELAND_COUNTIES.some(county => city.includes(county));
  }

  private mapToCompetitionFormat(data: RawCompetition): Competition {
    return {
      id: data.id,
      name: data.name,
      start_date: data.date.from,
      end_date: data.date.till,
      city: data.city,
      country: data.country
    };
  }

  private callWcaApi<T>(
    call: () => Promise<{data?: T}>,
    endpointName: string,
    emptyValue: T
  ): Observable<T> {
    return from(call()).pipe(
      map(response => response.data ?? emptyValue),
      catchError((error: {status?: number}) => {
        if (error?.status !== 404) {
          console.error(`WCA API ${endpointName} failed`, error);
        }
        return of(emptyValue);
      })
    );
  }

  getIrishCompetitions(): Observable<Competition[]> {
    const irishUrl = `${this.UNOFFICIAL_API_BASE}/competitions/IE.json`;
    const ukUrl = `${this.UNOFFICIAL_API_BASE}/competitions/GB.json`;

    return forkJoin({
      irish: this.httpClient.get<CompetitionsApiResponse>(irishUrl).pipe(
        catchError(() => of<CompetitionsApiResponse>({items: []}))
      ),
      uk: this.httpClient.get<CompetitionsApiResponse>(ukUrl).pipe(
        catchError(() => of<CompetitionsApiResponse>({items: []}))
      )
    }).pipe(
      map(({irish, uk}) => {
        const irishComps = (irish.items || []).map((comp) => this.mapToCompetitionFormat(comp));
        const niComps = (uk.items || [])
          .filter((comp) => this.isNorthernIreland(comp.city))
          .map((comp) => this.mapToCompetitionFormat(comp));

        const allComps = [...irishComps, ...niComps];

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (environment.testMode ? this.ONE_YEAR : this.EIGHT_WEEKS));
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + (environment.testMode ? this.ONE_YEAR : this.EIGHT_WEEKS));

        return allComps.filter((comp) => {
          const compEndDate = new Date(comp.end_date);
          return compEndDate >= startDate && new Date(comp.start_date) <= endDate;
        }).sort((a, b) => {
          return new Date(b.end_date).getTime() - new Date(a.end_date).getTime();
        });
      })
    );
  }

  getWcif(competitionId: string): Observable<WCIF> {
    const token = this.authService.getValidAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    return this.httpClient.get<WCIF>(
      `${environment.wcaUrl}/api/v0/competitions/${competitionId}/wcif/`,
      {headers: getWcaAuthHeaders(token)}
    );
  }

  getLivePodiums(competitionId: string): Observable<LiveRound[]> {
    return this.callWcaApi(
      () => livePodiums({client, path: {competitionId}}),
      `live/podiums for ${competitionId}`,
      []
    );
  }

  getCompetitionPodiums(competitionId: string): Observable<WcaApiResult[]> {
    return this.callWcaApi(
      () => competitionPodiums({client, path: {competitionId}}),
      `podiums for ${competitionId}`,
      []
    );
  }

  getResults(competitionId: string): Observable<WcaApiResult[]> {
    return this.callWcaApi(
      () => resultsByCompetition({client, path: {competitionId}}),
      `results for ${competitionId}`,
      []
    );
  }

}
