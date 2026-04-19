import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../../auth.service';
import { PendingTaskDto, StartablePolicyDto } from '../../models/execution.models';
import { ExecutionService } from '../../services/execution.service';

@Component({
  selector: 'app-funcionario-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './funcionario-dashboard.component.html',
  styleUrl: './funcionario-dashboard.component.scss'
})
export class FuncionarioDashboardComponent implements OnInit {
  private readonly executionService = inject(ExecutionService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  public startablePolicies: StartablePolicyDto[] = [];
  public pendingTasks: PendingTaskDto[] = [];
  public loading = false;
  public startingPolicyId: string | null = null;
  public message = '';

  public ngOnInit(): void {
    void this.loadDashboardData();
  }

  public async loadDashboardData(): Promise<void> {
    this.loading = true;
    this.message = '';

    const laneId = this.authService.getCurrentLaneId();
    if (!laneId) {
      this.startablePolicies = [];
      this.pendingTasks = [];
      this.loading = false;
      this.message = 'Tu usuario no tiene area/lane asignada.';
      this.cdr.detectChanges();
      return;
    }

    try {
      const [startablePolicies, pendingTasks] = await Promise.all([
        this.executionService.getStartablePolicies(),
        this.executionService.getMyTasks()
      ]);
      this.startablePolicies = startablePolicies;
      this.pendingTasks = pendingTasks;
      console.log('Dashboard data loaded:', { startablePolicies, pendingTasks });
    } catch (error) {
      this.startablePolicies = [];
      this.pendingTasks = [];
      this.message = error instanceof Error ? error.message : 'No se pudo cargar el dashboard';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  public async startProcess(policy: StartablePolicyDto): Promise<void> {
    this.startingPolicyId = policy.id;
    this.message = '';
    this.cdr.detectChanges(); 

    try {
      await this.executionService.startProcess(policy.id);
      this.message = `Proceso "${policy.name}" iniciado correctamente.`;
      await this.loadDashboardData();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo iniciar el proceso';
    } finally {
      this.startingPolicyId = null;
      this.cdr.detectChanges(); 
    }
  }

  public openTask(task: PendingTaskDto): void {
    void this.router.navigate(['/execution/task', task.taskInstanceId]);
  }

  public statusLabel(status: string): string {
    switch (status) {
      case 'IN_PROGRESS':
        return 'En Proceso';
      case 'COMPLETED':
        return 'Hecho';
      case 'REJECTED':
        return 'Rechazado';
      case 'PENDING':
      default:
        return 'Pendiente';
    }
  }

  public statusClass(status: string): string {
    switch (status) {
      case 'IN_PROGRESS':
        return 'badge badge-progress';
      case 'COMPLETED':
        return 'badge badge-completed';
      case 'REJECTED':
        return 'badge badge-rejected';
      case 'PENDING':
      default:
        return 'badge badge-pending';
    }
  }
}
