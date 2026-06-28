import {TestBed} from '@angular/core/testing';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {provideHttpClient} from '@angular/common/http';
import {ApiService} from './api';
import {AuthService} from './auth';
import {signal} from '@angular/core';
import {environment} from '../environments/environment';
import {WCIF} from './types';
import * as wcaOpenApi from '../wca-api/openapiClient';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;
  let mockAccessToken: ReturnType<typeof signal<string | null>>;

  const API_BASE = 'https://raw.githubusercontent.com/speedcubing-ireland/wca-analysis/api';
  const WCA_BASE = environment.wcaUrl;

  beforeEach(() => {
    mockAccessToken = signal<string | null>('test-token');

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ApiService,
        {provide: AuthService, useValue: {getValidAccessToken: () => mockAccessToken()}}
      ]
    });

    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('isNorthernIreland (via getIrishCompetitions)', () => {
    function flushWithUkComps(cities: string[]) {
      const ieReq = httpMock.expectOne(`${API_BASE}/competitions/IE.json`);
      ieReq.flush({items: []});

      const ukReq = httpMock.expectOne(`${API_BASE}/competitions/GB.json`);
      const today = new Date();
      const items = cities.map((city, i) => ({
        id: `UKComp${i}`,
        name: `UK Comp ${i}`,
        date: {
          from: today.toISOString().split('T')[0],
          till: today.toISOString().split('T')[0]
        },
        city,
        country: 'United Kingdom'
      }));
      ukReq.flush({items});
    }

    it('should include competitions from Northern Ireland counties', (done) => {
      service.getIrishCompetitions().subscribe(comps => {
        expect(comps.length).toBe(6);
        expect(comps.map(c => c.city)).toContain('Belfast, County Antrim');
        expect(comps.map(c => c.city)).toContain('Newry, County Down');
        expect(comps.map(c => c.city)).toContain('Enniskillen, County Fermanagh');
        expect(comps.map(c => c.city)).toContain('Derry, County Londonderry');
        expect(comps.map(c => c.city)).toContain('Omagh, County Tyrone');
        expect(comps.map(c => c.city)).toContain('Armagh, County Armagh');
        done();
      });

      flushWithUkComps([
        'Belfast, County Antrim',
        'Newry, County Down',
        'Enniskillen, County Fermanagh',
        'Derry, County Londonderry',
        'Omagh, County Tyrone',
        'Armagh, County Armagh'
      ]);
    });

    it('should exclude competitions from non-NI UK cities', (done) => {
      service.getIrishCompetitions().subscribe(comps => {
        expect(comps.length).toBe(0);
        done();
      });

      flushWithUkComps([
        'London, England',
        'Edinburgh, Scotland',
        'Cardiff, Wales',
        'Manchester, Greater Manchester'
      ]);
    });

    it('should include NI and exclude non-NI in the same response', (done) => {
      service.getIrishCompetitions().subscribe(comps => {
        expect(comps.length).toBe(1);
        expect(comps[0].city).toBe('Belfast, County Antrim');
        done();
      });

      flushWithUkComps([
        'Belfast, County Antrim',
        'London, England'
      ]);
    });
  });

  describe('getIrishCompetitions', () => {
    function flushWithDates(competitions: {id: string; from: string; till: string}[]) {
      const ieReq = httpMock.expectOne(`${API_BASE}/competitions/IE.json`);
      const items = competitions.map(c => ({
        id: c.id,
        name: c.id,
        date: {from: c.from, till: c.till},
        city: 'Dublin',
        country: 'Ireland'
      }));
      ieReq.flush({items});

      const ukReq = httpMock.expectOne(`${API_BASE}/competitions/GB.json`);
      ukReq.flush({items: []});
    }

    it('should combine Irish and NI competitions', (done) => {
      const today = new Date().toISOString().split('T')[0];

      service.getIrishCompetitions().subscribe(comps => {
        expect(comps.length).toBe(2);
        const ids = comps.map(c => c.id);
        expect(ids).toContain('IrishComp');
        expect(ids).toContain('NIComp');
        done();
      });

      const ieReq = httpMock.expectOne(`${API_BASE}/competitions/IE.json`);
      ieReq.flush({items: [{
        id: 'IrishComp', name: 'Irish Comp',
        date: {from: today, till: today},
        city: 'Dublin', country: 'Ireland'
      }]});

      const ukReq = httpMock.expectOne(`${API_BASE}/competitions/GB.json`);
      ukReq.flush({items: [{
        id: 'NIComp', name: 'NI Comp',
        date: {from: today, till: today},
        city: 'Belfast, County Antrim', country: 'United Kingdom'
      }]});
    });

    it('should filter out competitions outside the date range', (done) => {
      // testMode is true, so range is 1 year
      const today = new Date();
      const twoYearsAgo = new Date(today);
      twoYearsAgo.setDate(today.getDate() - 800);
      const twoYearsFromNow = new Date(today);
      twoYearsFromNow.setDate(today.getDate() + 800);

      service.getIrishCompetitions().subscribe(comps => {
        expect(comps.length).toBe(1);
        expect(comps[0].id).toBe('Current');
        done();
      });

      flushWithDates([
        {id: 'TooOld', from: twoYearsAgo.toISOString().split('T')[0], till: twoYearsAgo.toISOString().split('T')[0]},
        {id: 'Current', from: today.toISOString().split('T')[0], till: today.toISOString().split('T')[0]},
        {id: 'TooFar', from: twoYearsFromNow.toISOString().split('T')[0], till: twoYearsFromNow.toISOString().split('T')[0]}
      ]);
    });

    it('should sort competitions by end_date descending (most recent first)', (done) => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      service.getIrishCompetitions().subscribe(comps => {
        expect(comps.length).toBe(3);
        expect(comps[0].id).toBe('Tomorrow');
        expect(comps[1].id).toBe('Today');
        expect(comps[2].id).toBe('Yesterday');
        done();
      });

      flushWithDates([
        {id: 'Yesterday', from: yesterday.toISOString().split('T')[0], till: yesterday.toISOString().split('T')[0]},
        {id: 'Today', from: today.toISOString().split('T')[0], till: today.toISOString().split('T')[0]},
        {id: 'Tomorrow', from: tomorrow.toISOString().split('T')[0], till: tomorrow.toISOString().split('T')[0]}
      ]);
    });

    it('should map raw competition format to Competition interface', (done) => {
      const today = new Date().toISOString().split('T')[0];

      service.getIrishCompetitions().subscribe(comps => {
        expect(comps.length).toBe(1);
        expect(comps[0]).toEqual({
          id: 'TestComp2024',
          name: 'Test Competition 2024',
          start_date: today,
          end_date: today,
          city: 'Dublin',
          country: 'Ireland'
        });
        done();
      });

      // Flush directly with a proper name instead of using flushWithDates helper
      const ieReq = httpMock.expectOne(`${API_BASE}/competitions/IE.json`);
      ieReq.flush({items: [{
        id: 'TestComp2024',
        name: 'Test Competition 2024',
        date: {from: today, till: today},
        city: 'Dublin',
        country: 'Ireland'
      }]});
      const ukReq = httpMock.expectOne(`${API_BASE}/competitions/GB.json`);
      ukReq.flush({items: []});
    });

    it('should handle API errors gracefully', (done) => {
      service.getIrishCompetitions().subscribe(comps => {
        // Should return empty array when both APIs fail
        expect(comps).toEqual([]);
        done();
      });

      const ieReq = httpMock.expectOne(`${API_BASE}/competitions/IE.json`);
      ieReq.error(new ProgressEvent('error'));

      const ukReq = httpMock.expectOne(`${API_BASE}/competitions/GB.json`);
      ukReq.error(new ProgressEvent('error'));
    });

    it('should handle empty items array', (done) => {
      service.getIrishCompetitions().subscribe(comps => {
        expect(comps).toEqual([]);
        done();
      });

      const ieReq = httpMock.expectOne(`${API_BASE}/competitions/IE.json`);
      ieReq.flush({items: []});

      const ukReq = httpMock.expectOne(`${API_BASE}/competitions/GB.json`);
      ukReq.flush({items: []});
    });
  });

  describe('getWcif', () => {
    const mockWcif: WCIF = {
      id: 'TestComp2024',
      name: 'Test Competition 2024',
      shortName: 'Test 2024',
      events: [],
      persons: [],
      schedule: {},
      competitorLimit: null,
      extensions: []
    };

    it('should fetch WCIF with Authorization header', (done) => {
      service.getWcif('TestComp2024').subscribe(wcif => {
        expect(wcif).toEqual(mockWcif);
        done();
      });

      const req = httpMock.expectOne(`${WCA_BASE}/api/v0/competitions/TestComp2024/wcif/`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
      expect(req.request.headers.get('Content-Type')).toBe('application/json');
      req.flush(mockWcif);
    });

    it('should throw error when not authenticated', () => {
      mockAccessToken.set(null);
      expect(() => service.getWcif('TestComp2024')).toThrowError('Not authenticated');
    });
  });

  describe('WCA OpenAPI endpoints', () => {
    it('should map live podiums response data', (done) => {
      spyOn(wcaOpenApi, 'livePodiums').and.returnValue(
        Promise.resolve({data: [{id: '333-r1'}]}) as ReturnType<typeof wcaOpenApi.livePodiums>
      );

      service.getLivePodiums('TestComp2024').subscribe(result => {
        expect(result.length).toBe(1);
      expect(result[0].id).toBe('333-r1');
        done();
      });
    });

    it('should return empty array when live podiums request fails', (done) => {
      spyOn(console, 'error');
      spyOn(wcaOpenApi, 'livePodiums').and.returnValue(
        Promise.reject({status: 500}) as ReturnType<typeof wcaOpenApi.livePodiums>
      );

      service.getLivePodiums('TestComp2024').subscribe(result => {
        expect(result).toEqual([]);
        expect(console.error).toHaveBeenCalled();
        done();
      });
    });

    it('should return empty array for 404 without logging an error', (done) => {
      spyOn(console, 'error');
      spyOn(wcaOpenApi, 'competitionPodiums').and.returnValue(
        Promise.reject({status: 404}) as ReturnType<typeof wcaOpenApi.competitionPodiums>
      );

      service.getCompetitionPodiums('TestComp2024').subscribe(result => {
        expect(result).toEqual([]);
        expect(console.error).not.toHaveBeenCalled();
        done();
      });
    });
  });
});
