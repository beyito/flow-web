export type ProcessStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface ProcessInstance {
  id: string;
  policyId: string;
  status: ProcessStatus;
  startedBy: string;
  startedAt: string;
  completedAt?: string | null;
}

export interface TaskInstance {
  id: string;
  processInstanceId: string;
  taskId: string;
  laneId: string;
  status: TaskStatus;
  assignedTo?: string | null;
  formData?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface PendingTaskDto {
  taskInstanceId: string;
  processInstanceId: string;
  policyId: string;
  processName: string;
  taskId: string;
  taskName: string;
  laneId: string;
  createdAt: string;
}

export interface StartablePolicyDto {
  id: string;
  name: string;
  description?: string;
}
