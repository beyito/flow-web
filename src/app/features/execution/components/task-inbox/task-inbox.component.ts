import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../../../../auth.service';
import { PendingTaskDto } from '../../models/execution.models';
import { ExecutionService } from '../../services/execution.service';

@Component({
  selector: 'app-task-inbox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-inbox.component.html',
  styleUrl: './task-inbox.component.scss'
})
export class TaskInboxComponent implements OnInit {
  private readonly executionService = inject(ExecutionService);
  private readonly authService = inject(AuthService);

  public pendingTasks: PendingTaskDto[] = [];
  public selectedTask: PendingTaskDto | null = null;
  public loading = false;
  public completing = false;
  public message = '';

  public ngOnInit(): void {
    void this.loadMyTasks();
  }

  public async loadMyTasks(): Promise<void> {
    this.loading = true;
    this.message = '';

    try {
      const laneId = this.authService.getCurrentLaneId();
      if (!laneId) {
        this.pendingTasks = [];
        this.selectedTask = null;
        this.message = 'Tu perfil no tiene area asignada para buscar tareas.';
        return;
      }

      this.pendingTasks = await this.executionService.getMyPendingTasks(laneId);
      this.selectedTask = this.pendingTasks.length > 0 ? this.pendingTasks[0] : null;
      if (this.pendingTasks.length === 0) {
        this.message = 'No tienes tareas pendientes.';
      }
    } catch (error) {
      this.pendingTasks = [];
      this.selectedTask = null;
      this.message = error instanceof Error ? error.message : 'Error al cargar tareas';
    } finally {
      this.loading = false;
    }
  }

  public selectTask(task: PendingTaskDto): void {
    this.selectedTask = task;
    this.message = '';
  }

  public async completeSelectedTask(): Promise<void> {
    if (!this.selectedTask) {
      return;
    }
    this.completing = true;
    this.message = '';
    try {
      await this.executionService.completeTask(this.selectedTask.taskInstanceId, { aprobado: true });
      this.message = 'Tarea completada correctamente.';
      await this.loadMyTasks();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo completar la tarea';
    } finally {
      this.completing = false;
    }
  }
}
