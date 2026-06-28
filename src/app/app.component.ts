import {Component, ViewEncapsulation, inject, effect, EffectRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatTabsModule} from '@angular/material/tabs';
import {ApiService} from '../common/api';
import {PrintService} from '../common/print';
import {AuthService} from '../common/auth';
import {TemplateExtensionService} from '../common/template-extension';
import { environment } from '../environments/environment';
import { Competition, WCIF } from '../common/types';
import { CertificateEditorComponent } from './certificate-editor/certificate-editor.component';
import {
  UNOFFICIAL_CERTIFICATE_DEFINITIONS,
  createUnofficialCertificateSelection,
} from '../common/unofficial-certificates';
import {
  EventWithPodium,
} from '../common/podium-data';
import {
  applyCountriesFilter,
  buildCompetitionCertificateData,
  CompetitionApiSources,
  CompetitionCertificateData,
  computeEventWarnings,
  computeUnofficialWarnings,
  shouldGenerateBlankUnofficialCertificates,
} from '../common/competition-certificate-data';

/** Parse competition and tab from URL search params */
export function parseUrlParams(search: string): { competitionId: string | null; tab: string | null } {
  const params = new URLSearchParams(search);
  return {
    competitionId: params.get('competition'),
    tab: params.get('tab'),
  };
}

/** Convert a tab name from URL to mat-tab index */
export function tabNameToIndex(name: string | null): number {
  return name === 'customize' ? 1 : 0;
}

/** Convert a mat-tab index to URL tab name (null means default/podium, omit from URL) */
export function tabIndexToName(index: number): string | null {
  return index === 1 ? 'customize' : null;
}

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    encapsulation: ViewEncapsulation.None,
    standalone: true,
    imports: [CommonModule, FormsModule, MatTabsModule, CertificateEditorComponent]
})
export class AppComponent {
  state: 'PRINT' | 'REFRESHING' = 'PRINT';

  // Info about competitions managed by user
  competitionsToChooseFrom: Competition[] | null = null;
  inProgressCompetitions: Competition[] = [];
  pastCompetitions: Competition[] = [];
  futureCompetitions: Competition[] = [];
  competitionId: string;
  customCompetitionId: string;
  events: EventWithPodium[] = [];
  wcif: WCIF | null = null;
  certificateData: CompetitionCertificateData | null = null;
  eventWarnings: Record<string, string> = {};
  unofficialWarnings: Record<string, string> = {};
  error: string;
  loading: boolean;

  apiService = inject(ApiService);
  printService = inject(PrintService);
  authService = inject(AuthService);
  templateExtensionService = inject(TemplateExtensionService);

  savingTemplate = false;
  reloadingTemplate = false;
  templateMessage: { text: string; type: 'success' | 'info' | 'error' } | null = null;
  private messageTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly unofficialCertificateRows = UNOFFICIAL_CERTIFICATE_DEFINITIONS;
  unofficialCertificatePrint = createUnofficialCertificateSelection();

  // URL bookmarking support
  selectedTabIndex = 0;
  pendingNavigation: { competitionId: string; tabIndex: number } | null = null;

  constructor() {
      this.readUrlParams();
      this.handleGetCompetitions();

      // Watch for login state changes to handle URL-based deep linking
      if (this.pendingNavigation) {
        const ref: EffectRef = effect(() => {
          if (this.authService.isLoggedIn()) {
            this.applyPendingNavigation();
            ref.destroy();
          }
        });
      }
  }

  handleGetCompetitions() {
    this.apiService.getIrishCompetitions().subscribe(comps => {
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

  readUrlParams(search = window.location.search): void {
    const parsed = parseUrlParams(search);
    if (parsed.competitionId) {
      this.pendingNavigation = {
        competitionId: parsed.competitionId,
        tabIndex: tabNameToIndex(parsed.tab),
      };
    }
  }

  applyPendingNavigation(): void {
    if (this.pendingNavigation && !this.competitionId) {
      this.selectedTabIndex = this.pendingNavigation.tabIndex;
      this.handleCompetitionSelected(this.pendingNavigation.competitionId);
      this.pendingNavigation = null;
    }
  }

  onTabChange(index: number): void {
    this.selectedTabIndex = index;
    if (this.competitionId) {
      this.updateUrl(this.competitionId, index);
    }
  }

  updateUrl(competitionId: string, tabIndex = 0): void {
    const params = new URLSearchParams();
    params.set('competition', competitionId);
    const tabName = tabIndexToName(tabIndex);
    if (tabName) {
      params.set('tab', tabName);
    }
    history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }

  clearUrlParams(): void {
    history.replaceState(null, '', window.location.pathname);
  }

  handleCompetitionSelected(competitionId: string) {
    this.competitionId = competitionId;
    this.updateUrl(competitionId, this.selectedTabIndex);
    this.loadWcif();
  }

  handleRefreshCompetition() {
    this.state = 'REFRESHING';
    this.loadWcif();
  }

  private loadWcif() {
    this.loading = true;
    this.apiService.loadCompetitionApiSources(this.competitionId).subscribe({
      next: (sources) => {
        this.processCompetitionSources(sources);
      },
      error: (error: { error?: { error?: string }; message?: string }) => {
        this.loading = false;
        this.error = error?.error?.error || error?.message || 'Failed to load competition data';
      },
    });
  }

  private processCompetitionSources(sources: CompetitionApiSources) {
    this.loading = false;
    try {
      this.certificateData = buildCompetitionCertificateData(
        sources,
        this.printService.countries
      );
      this.wcif = this.certificateData.wcif;
      this.events = this.certificateData.wcif.events;

      if (this.certificateData.apiLoadErrors.length) {
        console.warn('Some competition data failed to load:', this.certificateData.apiLoadErrors);
      }

      this.state = 'PRINT';
      this.autoLoadTemplate();
      this.recomputeWarnings();
    } catch (error) {
      this.loading = false;
      console.error(error);
      this.wcif = null;
      this.certificateData = null;
      this.competitionId = null;
    }
  }

  printCertificatesAsPdf() {
    if (!this.certificateData) return;
    this.printService.printCertificatesAsPdf(this.certificateData, this.getSelectedCertificateIds());
  }

  printCertificatesAsPreview() {
    if (!this.certificateData) return;
    this.printService.printCertificatesAsPreview(this.certificateData, this.getSelectedCertificateIds());
  }

  private getSelectedCertificateIds(): string[] {
    const eventIds = this.events.filter(e => e.printCertificate).map(e => e.id);
    const unofficialIds = this.unofficialCertificateRows
      .filter(row => this.unofficialCertificatePrint[row.id])
      .map(row => row.id);
    return [...eventIds, ...unofficialIds];
  }

  onCountriesFilterChange(): void {
    if (!this.certificateData) return;
    this.certificateData = applyCountriesFilter(this.certificateData, this.printService.countries);
    this.recomputeWarnings();
  }

  private recomputeWarnings(): void {
    if (!this.certificateData) {
      this.eventWarnings = {};
      this.unofficialWarnings = {};
      return;
    }

    const countriesFilter = this.printService.countries;
    this.eventWarnings = computeEventWarnings(this.certificateData.wcif.events, countriesFilter);
    this.unofficialWarnings = computeUnofficialWarnings(this.certificateData.unofficialPodiums);
  }

  getWarningIfAny(eventId: string): string {
    return this.eventWarnings[eventId] ?? 'Not available yet';
  }

  getUnofficialWarning(unofficialId: string): string {
    return this.unofficialWarnings[unofficialId] ?? 'Not available yet';
  }

  toggleUnofficialCertificate(rowId: string, _clickEvent: globalThis.Event): void {
    this.unofficialCertificatePrint[rowId] = !this.unofficialCertificatePrint[rowId];
  }

  printDisabled(): boolean {
    const anyOfficial = this.events.some(e => e.printCertificate);
    const anyUnofficial = this.unofficialCertificateRows.some(
      row => this.unofficialCertificatePrint[row.id]
    );
    return !anyOfficial && !anyUnofficial;
  }

  shouldShowBlankCertificatesNotice(): boolean {
    if (this.events.some(event =>
      event.printCertificate && !event.hasPodiumResults
    )) {
      return true;
    }
    if (!this.certificateData) {
      return false;
    }
    return this.unofficialCertificateRows.some(row =>
      this.unofficialCertificatePrint[row.id] &&
      shouldGenerateBlankUnofficialCertificates(row.id, this.certificateData.unofficialPodiums)
    );
  }

  toggleEventSelection(wcaEvent: EventWithPodium, _clickEvent: globalThis.Event): void {
    // Toggle the checkbox state
    wcaEvent.printCertificate = !wcaEvent.printCertificate;
  }

  version() {
    return environment.version;
  }

  // Helper method to format competition date for display
  formatCompetitionDate(comp: Competition): string {
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

  get acceptedPersons(): number {
    if (!this.wcif) return 0;
    return this.wcif.persons.filter(p => p.registration?.status === 'accepted').length;
  }

  login(): void {
    this.authService.login();
  }

  logout(): void {
    if (!confirm('Are you sure you want to log out?')) return;
    this.authService.logout();
    this.competitionId = '';
    this.wcif = null;
    this.certificateData = null;
    this.events = [];
    this.eventWarnings = {};
    this.unofficialWarnings = {};
    this.error = '';
    this.loading = false;
    this.selectedTabIndex = 0;
    this.unofficialCertificatePrint = createUnofficialCertificateSelection();
    this.clearUrlParams();
  }

  private showTemplateMessage(text: string, type: 'success' | 'info' | 'error', ms = 3000): void {
    if (this.messageTimeout) clearTimeout(this.messageTimeout);
    this.templateMessage = { text, type };
    this.messageTimeout = setTimeout(() => this.templateMessage = null, ms);
  }

  private autoLoadTemplate(): void {
    if (!this.wcif) return;
    const result = this.templateExtensionService.loadTemplate(this.wcif);
    if (result === 'migrated') {
      this.showTemplateMessage('Saved template was from an older version — layout has been reset to default.', 'info', 5000);
    } else if (result === 'loaded') {
      this.showTemplateMessage('Saved template applied.', 'success');
    }
  }

  loadTemplateFromServer(): void {
    if (!this.wcif || !this.competitionId) return;
    this.reloadingTemplate = true;
    this.templateMessage = null;
    this.apiService.getWcif(this.competitionId).subscribe({
      next: (wcif) => {
        this.reloadingTemplate = false;
        if (this.wcif) {
          this.wcif.extensions = wcif.extensions;
          const result = this.templateExtensionService.loadTemplate(this.wcif);
          if (result === 'migrated') {
            this.showTemplateMessage('Saved template was from an older version — layout has been reset to default.', 'info', 5000);
          } else if (result === 'loaded') {
            this.showTemplateMessage('Template loaded successfully.', 'success');
          } else {
            this.showTemplateMessage('No saved template found for this competition.', 'info');
          }
          if (this.certificateData) {
            this.certificateData = applyCountriesFilter(
              this.certificateData,
              this.printService.countries
            );
          }
          this.recomputeWarnings();
        }
      },
      error: (err) => {
        this.reloadingTemplate = false;
        this.showTemplateMessage(err?.message || 'Failed to load template from server.', 'error', 5000);
      }
    });
  }

  saveTemplate(): void {
    if (!this.wcif || !this.competitionId) return;
    if (!confirm('Save the current template to this competition on WCA?')) return;
    this.savingTemplate = true;
    this.templateMessage = null;

    this.templateExtensionService.saveTemplate(this.competitionId, this.wcif).subscribe({
      next: () => {
        this.savingTemplate = false;
        this.showTemplateMessage('Template saved successfully.', 'success');
      },
      error: (err: { message?: string }) => {
        this.savingTemplate = false;
        this.showTemplateMessage(err?.message || 'Failed to save template', 'error');
      }
    });
  }

}
