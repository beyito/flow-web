import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService, AuthProfile } from '../../auth.service';

interface CompanyInfo {
  id: string;
  name: string;
}

@Component({
  selector: 'app-admin-software',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-software.component.html'
})
export class AdminSoftwareComponent {
  private readonly authService = new AuthService();

  public companies: CompanyInfo[] = [];
  public newCompanyName = '';
  public companyMessage = '';
  public companyLoading = false;

  public adminUsername = '';
  public adminPassword = '';
  public adminCompany = '';
  public adminMessage = '';
  public adminLoading = false;

  constructor() {
    this.loadCompanies();
  }

  public get profile(): AuthProfile | null {
    return this.authService.getProfile();
  }

  public get token(): string | null {
    return this.authService.getToken();
  }

  public async loadCompanies(): Promise<void> {
    this.companyMessage = '';
    try {
      const response = await fetch('http://localhost:8080/api/admin/companies', {
        headers: this.authHeaders
      });
      if (!response.ok) {
        throw new Error('No se pudieron cargar las empresas');
      }
      this.companies = await response.json();
      if (this.companies.length > 0) {
        this.adminCompany = this.companies[0].name;
      }
    } catch (error) {
      this.companyMessage = error instanceof Error ? error.message : 'Error al cargar empresas';
    }
  }

  public async createCompany(): Promise<void> {
    this.companyLoading = true;
    this.companyMessage = '';
    try {
      const response = await fetch('http://localhost:8080/api/admin/companies', {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({ name: this.newCompanyName.trim() })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'No se pudo crear la empresa');
      }
      this.newCompanyName = '';
      this.companyMessage = 'Empresa creada correctamente';
      await this.loadCompanies();
    } catch (error) {
      this.companyMessage = error instanceof Error ? error.message : 'Error al crear empresa';
    } finally {
      this.companyLoading = false;
    }
  }

  public async createCompanyAdmin(): Promise<void> {
    this.adminLoading = true;
    this.adminMessage = '';
    try {
      const response = await fetch('http://localhost:8080/api/admin/company-admins', {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({
          username: this.adminUsername.trim(),
          password: this.adminPassword,
          company: this.adminCompany
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'No se pudo crear el administrador');
      }
      this.adminUsername = '';
      this.adminPassword = '';
      this.adminMessage = 'Administrador de empresa creado correctamente';
    } catch (error) {
      this.adminMessage = error instanceof Error ? error.message : 'Error al crear administrador';
    } finally {
      this.adminLoading = false;
    }
  }

  private get authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }
}
