import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthProfile, AuthService } from '../../auth.service';

interface AreaInfo {
  id: string;
  name: string;
  streets: string[];
}

@Component({
  selector: 'app-funcionarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './funcionarios.component.html',
  styleUrls: ['../panel.scss', '../../../../src/styles.scss']
})
export class FuncionariosComponent implements OnInit {
  private readonly authService = inject(AuthService);

  public areas: AreaInfo[] = [];
  public newAreaName = '';
  public newAreaStreets = '';
  public areaMessage = '';
  public areaLoading = false;

  public funcUsername = '';
  public funcPassword = '';
  public funcArea = '';
  public funcMessage = '';
  public funcLoading = false;

  public async ngOnInit(): Promise<void> {
    await this.loadAreas();
  }

  public get profile(): AuthProfile | null {
    return this.authService.getProfile();
  }

  public get token(): string | null {
    return this.authService.getToken();
  }

  public get company(): string {
    return this.profile?.company ?? '';
  }

  public async loadAreas(): Promise<void> {
    this.areaMessage = '';

    try {
      const response = await fetch('http://localhost:8080/api/admin/areas', {
        headers: this.authHeaders
      });

      if (!response.ok) {
        throw new Error('No se pudieron cargar las areas');
      }

      this.areas = await response.json();
      if (this.areas.length > 0) {
        this.funcArea = this.areas[0].name;
      }
    } catch (error) {
      this.areaMessage = error instanceof Error ? error.message : 'Error al cargar areas';
    }
  }

  public async createArea(): Promise<void> {
    this.areaLoading = true;
    this.areaMessage = '';

    try {
      const response = await fetch('http://localhost:8080/api/admin/areas', {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({
          name: this.newAreaName.trim(),
          streets: this.newAreaStreets
            .split(',')
            .map((street) => street.trim())
            .filter((street) => street)
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'No se pudo crear el area');
      }

      this.newAreaName = '';
      this.newAreaStreets = '';
      this.areaMessage = 'Area creada correctamente';
      await this.loadAreas();
    } catch (error) {
      this.areaMessage = error instanceof Error ? error.message : 'Error al crear area';
    } finally {
      this.areaLoading = false;
    }
  }

  public async createFunctionary(): Promise<void> {
    this.funcLoading = true;
    this.funcMessage = '';

    try {
      const response = await fetch('http://localhost:8080/api/admin/functionaries', {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({
          username: this.funcUsername.trim(),
          password: this.funcPassword,
          area: this.funcArea
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'No se pudo crear el funcionario');
      }

      this.funcUsername = '';
      this.funcPassword = '';
      this.funcMessage = 'Funcionario creado correctamente';
    } catch (error) {
      this.funcMessage = error instanceof Error ? error.message : 'Error al crear funcionario';
    } finally {
      this.funcLoading = false;
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
