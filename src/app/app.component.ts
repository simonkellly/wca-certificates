import {Component, ViewEncapsulation} from '@angular/core';
import {ApiService} from '../common/api';
import {PrintService} from '../common/print';
import {Event} from '@wca/helpers/lib/models/event';
import {Result} from '@wca/helpers/lib/models/result';
import {Person} from '@wca/helpers';
import {Helpers} from '../common/helpers';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: [ './app.component.css' ],
  encapsulation: ViewEncapsulation.None
})
export class AppComponent {
  state: 'PRINT' | 'REFRESHING' = 'PRINT';

  // Info about competitions managed by user
  competitionsToChooseFrom: Array<any> = null;
  inProgressCompetitions: Array<any> = [];
  pastCompetitions: Array<any> = [];
  futureCompetitions: Array<any> = [];
  competitionId: string;
  customCompetitionId: string;
  events: Event[];
  wcif: any;
  personsWithAResult: Person[];
  acceptedPersons: number;
  error: string;
  loading: boolean;

  constructor (
          public apiService: ApiService,
          public printService: PrintService) {
      if (this.apiService.oauthToken) {
        this.handleGetCompetitions();
      }
  }

  handleLoginToWca() {
    this.apiService.logIn();
  }

  handleGetCompetitions() {
    this.apiService.getRecentCompetitions().subscribe(comps => {
      this.competitionsToChooseFrom = comps;
      this.categorizeCompetitions();
    });
  }

  categorizeCompetitions() {
    if (!this.competitionsToChooseFrom) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to start of day for accurate comparison

    this.inProgressCompetitions = [];
    this.pastCompetitions = [];
    this.futureCompetitions = [];

    this.competitionsToChooseFrom.forEach(comp => {
      const startDate = new Date(comp.start_date);
      const endDate = new Date(comp.end_date);
      
      // Reset time part for accurate comparison
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      if (today >= startDate && today <= endDate) {
        this.inProgressCompetitions.push(comp);
      } else if (today > endDate) {
        this.pastCompetitions.push(comp);
      } else {
        this.futureCompetitions.push(comp);
      }
    });

    // Sort each category by date
    this.inProgressCompetitions.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    this.futureCompetitions.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    this.pastCompetitions.sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime()); // Most recent first
  }

  handleCompetitionSelected(competitionId: string) {
    this.competitionId = competitionId;
    this.loadWcif(this.competitionId);
  }

  handleRefreshCompetition() {
    this.state = 'REFRESHING';
    this.loadWcif(this.competitionId);
  }

  private loadWcif(competitionId: string) {
    this.loading = true;
    this.apiService.getWcif(this.competitionId).subscribe(wcif => {
      this.loading = false;
      this.wcif = wcif;
      try {
        this.acceptedPersons = wcif.persons.filter(p => !!p.registration && p.registration.status === 'accepted').length;
        this.events = this.wcif.events;
        this.events.forEach(function(e) {
          e.rounds.forEach(function(r) {
            const resultsOfEvent = r.results;
            resultsOfEvent.forEach(function(result) {
              const personOfResult: Person = wcif.persons.filter(p => p.registrantId === result.personId)[0];
              result['countryIso2'] = personOfResult.countryIso2;
              personOfResult['hasAResult'] = true;
            });
          });
        });

        this.personsWithAResult = wcif.persons.filter(p => !!p['hasAResult']);
        this.state = 'PRINT';
      } catch (error) {
        this.loading = false;
        console.error(error);
        this.wcif = null;
        this.competitionId = null;
      }
    }, (error: any) => {
      return this.error = error?.error?.error || error?.message;
    });
  }

  printCertificatesAsPdf() {
    this.printService.printCertificatesAsPdf(this.wcif, this.getSelectedEvents());
    this.apiService.logUserClicksDownloadCertificatesAsPdf(this.wcif.id);
  }

  printCertificatesAsZip() {
    this.printService.printCertificatesAsZip(this.wcif, this.getSelectedEvents());
    this.apiService.logUserClicksDownloadCertificatesAsZip(this.wcif.id);
  }

  printCertificatesAsPreview() {
    this.printService.printCertificatesAsPreview(this.wcif, this.getSelectedEvents());
    this.apiService.logUserClicksDownloadCertificatesAsZip(this.wcif.id);
  }

  private getSelectedEvents() {
    return Array.from(this.events.filter(e => e['printCertificate']).map(e => e.id));
  }

  printEmptyCertificate() {
    this.printService.printEmptyCertificate(this.wcif);
  }

  getWarningIfAny(eventId: string): string {
    const event: Event = this.events.filter(e => e.id === eventId)[0];
    let results: Result[] = event.rounds[event.rounds.length - 1].results;
    results = this.filterResultsWithOnlyDNF(results);
    results = this.filterResultsByCountry(results);

    const podiumPlaces = this.getPodiumPlaces(results);
    this.calculateRankingAfterFiltering(podiumPlaces);
    event['podiumPlaces'] = podiumPlaces;

    switch (podiumPlaces.length) {
      case 0:
        return 'Not available yet';
      case 1:
        return 'Only 1 person on the podium!';
      case 2:
        return 'Only 2 persons on the podium!';
      case 3:
        return ''; // No warning
      default:
        return 'More than 3 persons on the podium!';
    }
  }

  private filterResultsWithOnlyDNF(results: Result[]): Result[] {
    return results.filter(r => r['best'] > 0);
  }

  private filterResultsByCountry(results: Result[]): Result[] {
    if (!! this.printService.countries && this.printService.countries.length > 0) {
      return results.filter(r => this.printService.countries.split(';').includes(r['countryIso2']));
    }
    return results;
  }

  private getPodiumPlaces(results: Result[]): Result[] {
    // TODO This needs a test
    Helpers.sortResultsByRanking(results);
    const podiumPlaces = results.slice(0, 3);
    if (podiumPlaces.length === 3) {
      let i = 3;
      while (i < results.length) {
        if (podiumPlaces[i - 1].ranking === results[i].ranking) {
          podiumPlaces.push(results[i]);
        } else {
          break;
        }
        i++;
      }
    }
    return podiumPlaces.reverse();
  }

  private calculateRankingAfterFiltering(podiumPlaces: Result[]): void {
    podiumPlaces.forEach(function(p) {
      p['rankingAfterFiltering'] = podiumPlaces.filter(o => o.ranking < p.ranking).length + 1;
    });
  }

  printDisabled(): boolean {
    return this.events.filter(e => e['printCertificate']).length === 0;
  }

  toggleEventSelection(event: any, clickEvent: Event): void {
    // Toggle the checkbox state
    event.printCertificate = !event.printCertificate;
  }

  printParticipationCertificatesAsPdf() {
    this.printService.printParticipationCertificatesAsPdf(this.wcif, this.personsWithAResult);
    this.apiService.logUserClicksDownloadParticipationCertificatesAsPdf(this.wcif.id);
  }

  printParticipationCertificatesAsZip() {
    this.printService.printParticipationCertificatesAsZip(this.wcif, this.personsWithAResult);
    this.apiService.logUserClicksDownloadParticipationCertificatesAsZip(this.wcif.id);
  }

  version() {
    return environment.version;
  }

  // Helper method to format competition date for display
  formatCompetitionDate(comp: any): string {
    const startDate = new Date(comp.start_date);
    const endDate = new Date(comp.end_date);
    
    const options: Intl.DateTimeFormatOptions = { 
      month: 'short', 
      day: 'numeric' 
    };
    
    if (comp.start_date === comp.end_date) {
      return startDate.toLocaleDateString('en-US', options);
    } else {
      return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
    }
  }

  clearBackground(fileInput: HTMLInputElement) {
    this.printService.clearBackground();
    fileInput.value = '';
  }

  clearParticipationBackground(fileInput: HTMLInputElement) {
    this.printService.clearParticipationBackground();
    fileInput.value = '';
  }

}
