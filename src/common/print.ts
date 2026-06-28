import {Injectable} from '@angular/core';
import {saveAs} from 'file-saver';
import {Certificate} from './certificate';
import {Result} from '@wca/helpers/lib/models/result';
import {formatCentiseconds} from '@wca/helpers/lib/helpers/time';
import {decodeMultiResult, formatMultiResult, isDnf} from '@wca/helpers/lib/helpers/result';

import {getEventName, EventId} from '@wca/helpers';
import {WCIF, PdfDocument, PdfMakeStatic, PdfContentItem} from './types';
import {environment} from '../environments/environment';
import {
  getUnofficialCertificateDefinition,
  isUnofficialCertificateId,
  UnofficialPodiumState,
} from './unofficial-certificates';
import {derivePodiumPlaces, PodiumResult} from './podium-data';
import {CompetitionCertificateData} from './competition-certificate-data';

declare const pdfMake: PdfMakeStatic;

export const DEFAULT_CERTIFICATE_JSON = `[
"\\n\\n\\n\\n\\n",
{"text": "certificate.event", "fontSize": "40", "bold": "true"},
"\\n",
{"text": "certificate.capitalisedPlace Place", "fontSize": "32", "bold": "true"},
"\\n\\n",
{"text": "certificate.name", "fontSize": "40", "bold": "true"},
"\\n\\n",
"with certificate.resultType of ",
{"text": "certificate.result", "bold": "true"},
"  certificate.resultUnit"
]`;

const BLANK_NAME_PLACEHOLDER = '                            ';
const BLANK_RESULT_PLACEHOLDER = '            ';

@Injectable({
  providedIn: 'root'
})
export class PrintService {

  public pageOrientation: 'landscape' | 'portrait' = 'landscape';
  public showLocalNames = false;
  public background: string = null;
  public backgroundForPreviewOnly = true;
  public countries = '';
  public xOffset = 0;
  public yOffset = 0;

  public podiumCertificateJson = '';
  public podiumCertificateStyleJson = '';

  public readonly defaultPodiumCertificateJson: string;
  public readonly defaultPodiumCertificateStyleJson: string;

  constructor() {
    const baseUrl = environment.appUrl;

    pdfMake.fonts = {
      barriecito: {
        normal: `${baseUrl}fonts/Barriecito-Regular.ttf`,
        bold: `${baseUrl}fonts/Barriecito-Regular.ttf`,
      },
      mono: {
        normal: `${baseUrl}fonts/RobotoMono.ttf`,
        bold: `${baseUrl}fonts/RobotoMono-Bold.ttf`
      },
      Roboto: {
        normal: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf',
        bold: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf',
        italics: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Italic.ttf',
        bolditalics: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-MediumItalic.ttf'
      },
    }

    this.defaultPodiumCertificateJson = DEFAULT_CERTIFICATE_JSON;
    this.podiumCertificateJson = this.defaultPodiumCertificateJson;

    const defaultStyle = {
      font: 'Roboto',
      otherFonts: ['barriecito', 'mono']
    }
    this.defaultPodiumCertificateStyleJson = JSON.stringify(defaultStyle, null, 2);
    this.podiumCertificateStyleJson = this.defaultPodiumCertificateStyleJson;
  }

  public resetPodiumCertificateJson(): void {
    this.podiumCertificateJson = DEFAULT_CERTIFICATE_JSON;
  }

  public resetPodiumCertificateStyleJson(): void {
    this.podiumCertificateStyleJson = this.defaultPodiumCertificateStyleJson;
  }

  public getEventName(eventId: EventId | string) {
    return getEventName(eventId as EventId).replace(' Cube', '');
  }

  private getNewCertificate(wcif: WCIF, eventId: string, format: string, result: PodiumResult, eventDisplayName?: string): Certificate {
    const certificate: Certificate = new Certificate();
    certificate.delegate = this.getPersonsWithRole(wcif, 'delegate');
    certificate.organizers = this.getPersonsWithRole(wcif, 'organizer');
    certificate.competitionName = wcif.name;
    certificate.name = wcif.persons.filter(p => p.registrantId === result.personId)[0].name;
    certificate.place = this.getPlace(result.rankingAfterFiltering ?? result.ranking);
    certificate.event = eventDisplayName ?? this.getEventName(eventId);
    certificate.resultType = this.getResultType(format, result);
    certificate.result = this.formatResultForEvent(result, eventId);
    certificate.resultUnit = this.getResultUnit(eventId);
    certificate.locationAndDate = '';
    return certificate;
  }

  private getNewBlankCertificate(wcif: WCIF, eventId: string, place: number, eventDisplayName?: string): Certificate {
    const certificate: Certificate = new Certificate();
    certificate.delegate = this.getPersonsWithRole(wcif, 'delegate');
    certificate.organizers = this.getPersonsWithRole(wcif, 'organizer');
    certificate.competitionName = wcif.name;
    certificate.name = BLANK_NAME_PLACEHOLDER;
    certificate.place = this.getPlace(place);
    certificate.event = eventDisplayName ?? this.getEventName(eventId);
    certificate.resultType = 'a result';
    certificate.result = BLANK_RESULT_PLACEHOLDER;
    certificate.resultUnit = this.getResultUnit(eventId);
    certificate.locationAndDate = '';
    return certificate;
  }

  private formatResultForEvent(result: Result, eventId: string): string {
    switch (eventId) {
      case '333fm':
        return (result['average'] > 0 ? this.formatFmcMean(result['average']) : isDnf(result['best']) ? 'DNF' : result['best']).toString();
      case '333bf':
      case '444bf':
      case '555bf':
        return formatCentiseconds(result['best']);
      case '333mbf': {
        const mbldResult = result['best'];
        return formatMultiResult(decodeMultiResult(mbldResult));
      }
      default:
        return formatCentiseconds(result['average'] > 0 ? result['average'] : result['best']);
    }
  }

  private formatFmcMean(mean: number) {
    if (mean === -1) {
      return 'DNF';
    }
    if (mean === null || mean === undefined) {
      return null;
    }
    return mean.toString().substring(0, 2) + '.' + mean.toString().substring(2);
  }

  private getPersonsWithRole(wcif: WCIF, role: string): string {
    const persons = wcif.persons.filter(p => p.roles.includes(role));
    persons.sort((a, b) => a.name.localeCompare(b.name));
    if (persons.length === 1) {
      return this.formatName(persons[0].name);
    } else {
      const last = persons.pop();
      return persons.map(p => this.formatName(p.name)).join(', ')
        + ' and ' + this.formatName(last.name);
    }
  }

  private getPlace(place: number) {
    if (place === 1) {
      return 'first';
    }
    if (place === 2) {
      return 'second';
    }
    if (place === 3) {
      return 'third';
    }
    console.warn('Not a podium place');
    return '';
  }

  private getOneCertificateContent(certificate: Certificate): PdfContentItem {
    const jsonWithReplacedStrings = this.replaceStringsIn(this.podiumCertificateJson, certificate);
    const textObject = this.parseJsonWithFallback(
      jsonWithReplacedStrings,
      this.replaceStringsIn(this.defaultPodiumCertificateJson, certificate),
      'certificate template'
    );
    return {
      text: textObject,
      alignment: 'center',
      margin: [this.xOffset, this.yOffset, -this.xOffset, -this.yOffset],
      pageBreak: 'after'
    };
  }

  private replaceStringsIn(s: string, certificate: Certificate): string {
    s = s.replace(/certificate.delegate/g, certificate.delegate);
    s = s.replace(/certificate.organizers/g, certificate.organizers);
    s = s.replace(/certificate.competitionName/g, certificate.competitionName);
    s = s.replace(/certificate.name/g, this.formatName(certificate.name));
    s = s.replace(/certificate.capitalisedPlace/g, certificate.place.charAt(0).toUpperCase() + certificate.place.slice(1));
    s = s.replace(/certificate.place/g, certificate.place);
    s = s.replace(/certificate.event/g, certificate.event);
    s = s.replace(/certificate.resultType/g, certificate.resultType);
    s = s.replace(/certificate.resultUnit/g, certificate.resultUnit);
    s = s.replace(/certificate.result/g, certificate.result);
    s = s.replace(/certificate.locationAndDate/g, certificate.locationAndDate);
    return s;
  }

  private formatName(name: string) {
    return this.showLocalNames ? name
      : (name).replace(new RegExp(' \\(.+\\)'), '');
  }

  public printCertificatesAsPdf(certificateData: CompetitionCertificateData, events: string[]) {
    const certificates: Certificate[] = this.getCertificates(events, certificateData);
    if (certificates.length > 0) {
      this.downloadAsPdf(certificates, certificateData.wcif);
    }
  }

  private downloadAsPdf(certificates: Certificate[], wcif: WCIF) {
    const document = this.getDocument(this.pageOrientation, this.background, false);
    this.addCertificatesToDocument(document, certificates);
    pdfMake.createPdf(document).getBlob(blob => {
      saveAs(blob, 'Certificates ' + wcif.name + '.pdf');
    });
  }

  public printCertificatesAsPreview(certificateData: CompetitionCertificateData, events: string[]) {
    const certificates: Certificate[] = this.getCertificates(events, certificateData);
    if (certificates.length > 0) {
      const document = this.getDocument(this.pageOrientation, this.background, true);
      this.addCertificatesToDocument(document, certificates);
      pdfMake.createPdf(document).getBlob(blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      });
    }
  }

  private addCertificatesToDocument(document: PdfDocument, certificates: Certificate[]) {
    certificates.forEach(cert => {
      document.content.push(this.getOneCertificateContent(cert));
    });
    this.removeLastPageBreak(document);
  }

  private getCertificates(events: string[], certificateData: CompetitionCertificateData): Certificate[] {
    const {wcif, unofficialPodiums} = certificateData;
    const revEvents = [...events].reverse();
    const certificates: Certificate[] = [];
    for (const eventId of revEvents) {
      if (isUnofficialCertificateId(eventId)) {
        certificates.push(...this.getUnofficialCertificates(eventId, wcif, unofficialPodiums));
        continue;
      }
      const event = wcif.events.find(e => e.id === eventId);
      if (!event?.hasPodiumResults) {
        certificates.push(...this.getBlankPodiumCertificates(wcif, eventId));
        continue;
      }
      const podiumPlaces = derivePodiumPlaces(event.podiumSourceResults, this.countries);
      if (!podiumPlaces.length) continue;
      const format = event.podiumFormat;
      if (!format) continue;

      for (const podiumPlace of podiumPlaces) {
        certificates.push(this.getNewCertificate(wcif, eventId, format, podiumPlace));
      }
    }
    if (certificates.length === 0) {
      alert('No certificates could be generated from the selected events.');
    }
    return certificates;
  }

  private getBlankPodiumCertificates(
    wcif: WCIF,
    eventId: string,
    eventDisplayName?: string
  ): Certificate[] {
    const certificates: Certificate[] = [];
    for (const podiumPlace of [3, 2, 1]) {
      certificates.push(this.getNewBlankCertificate(wcif, eventId, podiumPlace, eventDisplayName));
    }
    return certificates;
  }

  private getUnofficialCertificates(
    unofficialId: string,
    wcif: WCIF,
    unofficialPodiums: Record<string, UnofficialPodiumState>
  ): Certificate[] {
    const definition = getUnofficialCertificateDefinition(unofficialId);
    if (!definition) {
      return [];
    }

    const state = unofficialPodiums[unofficialId];
    if (!state?.hasSource || !state.format) {
      return this.getBlankPodiumCertificates(wcif, definition.eventIdForFormat, definition.certificateEventName);
    }

    if (!state.podium.length) {
      return this.getBlankPodiumCertificates(wcif, definition.eventIdForFormat, definition.certificateEventName);
    }

    return state.podium.map(result =>
      this.getNewCertificate(
        wcif,
        definition.eventIdForFormat,
        state.format!,
        result,
        definition.certificateEventName
      )
    );
  }

  public handleBackgroundSelected(files: FileList) {
    const reader = new FileReader();
    reader.readAsDataURL(files.item(0));
    reader.onloadend = (_e) => {
      this.background = reader.result as string;
    };
    this.backgroundForPreviewOnly = true;
  }

  public clearBackground() {
    this.background = null;
  }

  private removeLastPageBreak(document: PdfDocument): void {
    document.content[document.content.length - 1].pageBreak = '';
  }

  private getDocument(orientation: string, background: string | null, isPreview: boolean): PdfDocument {
    const document = {
      pageOrientation: orientation,
      content: [],
      pageMargins: [100, 60, 100, 60],
      styles: {
        tableOverview: {
          lineHeight: 0.8
        }
      },
      defaultStyle: {
        fontSize: 22
      }
    };
    if (this.podiumCertificateStyleJson !== '{}') {
      const styles = this.parseJsonWithFallback<Record<string, unknown>>(
        this.podiumCertificateStyleJson,
        '{}',
        'certificate style'
      );
      for (const key in styles) {
        if (Object.prototype.hasOwnProperty.call(styles, key)) {
          document.defaultStyle[key] = styles[key];
        }
      }
    }
    if (background !== null && (this.backgroundForPreviewOnly === false || isPreview)) {
      document['background'] = {
        image: background,
        width: orientation === 'landscape' ? 840 : 594,
        alignment: 'center'
      };
    }
    return document;
  }

  public generatePreviewBuffer(callback: (buffer: ArrayBuffer) => void): void {
    const sample = new Certificate();
    sample.event = '3x3x3';
    sample.name = 'Patrick Roger Smith';
    sample.place = 'first';
    sample.resultType = 'an average';
    sample.result = '7.64';
    sample.resultUnit = '';
    sample.delegate = 'John Smith';
    sample.organizers = 'Jane Doe and Bob Wilson';
    sample.competitionName = 'Example Open 2025';
    sample.locationAndDate = '';

    const savedXOffset = this.xOffset;
    const savedYOffset = this.yOffset;
    this.xOffset = 0;
    this.yOffset = 0;
    const document = this.getDocument(this.pageOrientation, null, false);
    document.content.push(this.getOneCertificateContent(sample));
    this.removeLastPageBreak(document);
    this.xOffset = savedXOffset;
    this.yOffset = savedYOffset;

    pdfMake.createPdf(document).getBuffer(callback);
  }

  private parseJsonWithFallback<T>(value: string, fallbackValue: string, context: string): T {
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Invalid ${context} JSON. Falling back to the last safe value.`, error);
      return JSON.parse(fallbackValue) as T;
    }
  }

  private getResultUnit(eventId: string) {
    switch (eventId) {
      case '333fm':
        return 'moves';
      default:
        return '';
    }
  }

  private getResultType(format: string, result: Result) {
    switch (format) {
      case 'a':
        return (result['average'] > 0) ? 'an average'
          : 'a best result';
      case 'm':
        return (result['average'] > 0) ? 'a mean'
          : 'a best result';
      case '1':
      case '2':
      case '3':
      case '5':
        return 'a best result';
      default:
        return 'a result';
    }
  }

}
