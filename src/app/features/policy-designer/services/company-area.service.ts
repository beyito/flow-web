import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../auth.service';
import { CompanyArea } from '../models/policy-designer.models';

interface AreaApiResponse {
  id: string;
  name: string;
}

const AREA_COLORS = ['#E8F4FD', '#FDECEC', '#EEF9F1', '#FFF6E5', '#F4ECFD', '#EAFBF7'];

@Injectable({ providedIn: 'root' })
export class CompanyAreaService {
  private readonly authService = inject(AuthService);
  private readonly baseUrl = 'http://localhost:8080/api/admin';

  public async getCompanyAreas(): Promise<CompanyArea[]> {
    const response = await fetch(`${this.baseUrl}/areas`, {
      headers: this.authHeaders
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'No se pudieron cargar las areas de la empresa');
    }

    const areas = (await response.json()) as AreaApiResponse[];
    return areas.map((area, index) => ({
      id: area.id,
      name: area.name,
      color: AREA_COLORS[index % AREA_COLORS.length]
    }));
  }

  private get authHeaders(): Record<string, string> {
    const token = this.authService.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }
}
