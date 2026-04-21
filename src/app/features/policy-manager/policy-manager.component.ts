import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core'; // 🚩 Importar ChangeDetectorRef
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PolicyDataService } from '../policy-designer/services/policy-data.service';
import { PolicySummary } from '../policy-designer/models/policy-designer.models';

@Component({
  selector: 'app-policy-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './policy-manager.component.html',
  styleUrl: './policy-manager.component.scss'
})
export class PolicyManagerComponent implements OnInit {
  private readonly policyDataService = inject(PolicyDataService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef); // 🚩 Inyectar el detector de cambios

  public policies: PolicySummary[] = [];
  public newPolicyName = '';
  public newPolicyDescription = '';
  public loading = false;
  public creating = false;
  public message = '';

  public async ngOnInit(): Promise<void> {
    await this.loadPolicies();
  }

  public async loadPolicies(): Promise<void> {
    this.loading = true;
    this.message = '';
    this.cdr.detectChanges(); // 🚩 Avisamos que empezamos a cargar

    try {
      this.policies = await this.policyDataService.getAllPolicies();
      if (this.policies.length === 0) {
        this.message = 'Aun no existen politicas creadas.';
      }
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo cargar la lista de politicas.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges(); // 🚩 Despierta Angular, ya terminamos de cargar
    }
  }

  public async createPolicy(): Promise<void> {
    const name = this.newPolicyName.trim();
    const description = this.newPolicyDescription.trim();

    if (!name) {
      this.message = 'Ingresa un nombre para la nueva politica.';
      this.cdr.detectChanges(); // 🚩 Actualizamos la vista para mostrar el error
      return;
    }

    this.creating = true;
    this.message = '';
    this.cdr.detectChanges(); // 🚩 Avisamos que empezamos a crear

    try {
      const policy = await this.policyDataService.createPolicy(name, description);
      this.newPolicyName = '';
      this.newPolicyDescription = '';
      await this.router.navigate(['/designer', policy.id]);
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo crear la politica.';
    } finally {
      this.creating = false;
      this.cdr.detectChanges(); // 🚩 Terminamos de crear
    }
  }

  public async editDiagram(policyId: string): Promise<void> {
    await this.router.navigate(['/designer', policyId]);
  }
}