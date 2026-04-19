import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../auth.service';
import {
  PendingTaskDto,
  ProcessInstance,
  StartablePolicyDto,
  TaskDetailDto,
  TaskInstance
} from '../models/execution.models';

@Injectable({
  providedIn: 'root'
})
export class ExecutionService {
  private readonly authService = inject(AuthService);
  private readonly baseUrl = 'http://localhost:8080/api/execution';

  public async startProcess(policyId: string): Promise<ProcessInstance> {
    const response = await fetch(`${this.baseUrl}/process/start`, {
      method: 'POST',
      headers: this.authHeaders,
      body: JSON.stringify({ policyId })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'No se pudo iniciar el proceso');
    }

    return response.json();
  }

  public async getMyPendingTasks(laneId: string): Promise<PendingTaskDto[]> {
    const response = await fetch(`${this.baseUrl}/tasks/pending/${encodeURIComponent(laneId)}`, {
      headers: this.authHeaders
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'No se pudieron cargar las tareas pendientes');
    }

    return response.json();
  }

  public async getStartablePolicies(): Promise<StartablePolicyDto[]> {
    const response = await fetch(`${this.baseUrl}/startable-policies`, {
      headers: this.authHeaders
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'No se pudieron cargar los procesos disponibles');
    }

    return response.json();
  }

  public async getMyTasks(): Promise<PendingTaskDto[]> {
    const response = await fetch(`${this.baseUrl}/my-tasks`, {
      headers: this.authHeaders
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'No se pudieron cargar tus tareas pendientes');
    }

    return response.json();
  }

  public async getTaskDetails(taskInstanceId: string): Promise<TaskDetailDto> {
    const response = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(taskInstanceId)}`, {
      headers: this.authHeaders
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'No se pudo cargar el detalle de la tarea');
    }

    return response.json();
  }

  public async takeTask(taskInstanceId: string): Promise<TaskInstance> {
    const response = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(taskInstanceId)}/take`, {
      method: 'POST',
      headers: this.authHeaders
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'No se pudo tomar la tarea');
    }

    return response.json();
  }

  public async completeTask(taskInstanceId: string, formData: unknown): Promise<TaskInstance> {
    const payload = typeof formData === 'string' ? formData : JSON.stringify(formData);
    const response = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(taskInstanceId)}/complete`, {
      method: 'POST',
      headers: this.authHeaders,
      body: JSON.stringify({ formData: payload })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'No se pudo completar la tarea');
    }

    return response.json();
  }

  private get authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.authService.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }
}
