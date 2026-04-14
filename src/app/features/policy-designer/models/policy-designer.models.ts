export interface PolicySummary {
  id: string;
  name: string;
  description?: string;
}

export interface Lane {
  id: string;
  name: string;
  color: string;
  x: number;
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

export interface DesignerNodeTemplate {
  type: string;
  label: string;
}
