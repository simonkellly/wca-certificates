import {HttpHeaders} from '@angular/common/http';
import {client} from '../wca-api/openapiClient/client.gen';
import {environment} from '../environments/environment';

let authInterceptorRegistered = false;

export function configureWcaClient(getAccessToken?: () => string | null): void {
  client.setConfig({
    baseUrl: `${environment.wcaUrl}/api`,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (getAccessToken && !authInterceptorRegistered) {
    client.interceptors.request.use((request) => {
      const token = getAccessToken();
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
      return request;
    });
    authInterceptorRegistered = true;
  }
}

export function getWcaAuthHeaders(token: string): HttpHeaders {
  return new HttpHeaders({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  });
}

export {client};
