import { Injectable } from '@angular/core';
import { dia } from '@joint/plus';
import { DiagramState, Lane } from '../models/policy-designer.models';

@Injectable({ providedIn: 'root' })
export class DiagramStorageService {
  private readonly storageKey = 'diagramState';

  public save(policyId: string | null, graph: dia.Graph, lanes: Lane[]): void {
    const graphJson = graph.toJSON() as dia.Graph.JSON;
    const state: DiagramState = {
      policyId,
      diagramJson: JSON.stringify({
        ...graphJson,
        cells: graphJson.cells.filter((cell: any) => !cell.isLaneBackground)
      }),
      lanes
    };

    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  public load(): DiagramState | null {
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) {
      return null;
    }

    return JSON.parse(saved) as DiagramState;
  }

  public clear(): void {
    localStorage.removeItem(this.storageKey);
  }
}
