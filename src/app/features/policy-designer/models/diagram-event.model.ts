export interface DiagramEvent {
  action: string;
  cellId: string;
  payload: Record<string, unknown>;
}
