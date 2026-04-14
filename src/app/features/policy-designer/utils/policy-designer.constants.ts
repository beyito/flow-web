import { DesignerNodeTemplate } from '../models/policy-designer.models';

export const LANE_COLORS = ['#d1fae5', '#dbeafe', '#fef3c7', '#fecaca', '#f3e8ff', '#e0e7ff'];

export const NODE_TEMPLATES: DesignerNodeTemplate[] = [
  { type: 'START', label: 'Inicio' },
  { type: 'TASK', label: 'Tarea' },
  { type: 'DECISION', label: 'Decision' },
  { type: 'END', label: 'Fin' }
];
