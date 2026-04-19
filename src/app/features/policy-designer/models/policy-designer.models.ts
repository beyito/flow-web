export interface PolicySummary {
  id: string;
  name: string;
  description?: string;
}

export interface CompanyArea {
  id: string;
  name: string;
  color: string;
}

export type Lane = CompanyArea & { x: number };

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface FormField {
  id: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date' | 'file';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // Para select y checkbox
  requiresAttachment?: boolean;
  attachmentLabel?: string;
}

export interface TaskFormData {
  title: string;
  description: string;
  fields: FormField[];
  attachments: Attachment[];
}

export interface NodeMetadata {
  taskForm?: TaskFormData;
  decisionExpression?: string;
}

export interface PolicyPayload extends PolicySummary {
  diagramJson?: string;
  lanes?: Lane[];
}

export interface DiagramState {
  policyId: string | null;
  diagramJson: string;
  lanes: Lane[];
}

export interface TaskOrder {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  order: number;
  dependencies: string[];
  laneId?: string;
  laneName?: string;
}

export interface TaskExecutionOrder {
  policyId: string;
  policyName: string;
  tasks: TaskOrder[];
}

export interface DesignerNodeTemplate {
  type: string;
  label: string;
}
