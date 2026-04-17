import { ElementRef, Injectable } from '@angular/core';
import { dia, shapes } from '@joint/plus';
import { Lane, PolicyPayload } from '../models/policy-designer.models';

@Injectable({ providedIn: 'root' })
export class DiagramCanvasService {
  private readonly width = 1200;
  private readonly height = 800;
  private laneBackgrounds: dia.Element[] = [];

  public createGraph(): dia.Graph {
    return new dia.Graph({}, { cellNamespace: shapes });
  }

  public createPaper(graph: dia.Graph): dia.Paper {
    return new dia.Paper({
      model: graph,
      background: { color: '#F8F9FA' },
      async: true,
      sorting: dia.Paper.sorting.APPROX,
      cellViewNamespace: shapes,
      width: this.width,
      height: this.height,
      gridSize: 10,
      drawGrid: true,

      // 🚩 1. CONFIGURACIÓN DE MAGNETISMO Y RECONEXIÓN
      snapLinks: { radius: 30 }, // El imán atrapará el nodo si lo sueltas a 30px de distancia
      linkPinning: false, // Evita que la flecha se quede flotando en la nada (si la sueltas fuera, vuelve a su nodo original)
      defaultConnectionPoint: { name: 'boundary' }, // Hace que la flecha apunte al borde de la figura, no al centro exacto

      // 🚩 2. VALIDACIÓN (SEGURIDAD)
      // Evita que el usuario conecte la flecha al fondo de la calle o al mismo nodo de origen
      validateConnection: function(cellViewS, magnetS, cellViewT, magnetT, end, linkView) {
        if (cellViewS === cellViewT) return false; // Evita bucles infinitos (conectar a sí mismo)
        if (cellViewT.model.get('isLaneBackground')) return false; // Evita que la flecha se pegue al fondo de la calle
        return true;
      },

      // 🚩 3. PERMISOS INTERACTIVOS (AQUÍ ESTABA EL BLOQUEO)
      interactive: () => ({
        elementMove: true,
        addLinkFromMagnet: false,
        labelMove: false,
        linkMove: false,      // Cambiamos a false para no arrastrar la flecha entera por error
        arrowheadMove: true,  // ✅ ESTO PERMITE MOVER LAS PUNTAS (Origen / Destino)
        vertexMove: true,     // ✅ Permite mover los "codos" (esquinas) de la flecha
        vertexAdd: true,      // ✅ Permite crear nuevos codos al arrastrar desde el medio de la línea
        vertexRemove: true    // ✅ Permite borrar codos
      }),
      clickThreshold: 5,
      moving: { validating: false }
    });
  }

  public mountPaper(container: ElementRef, paper: dia.Paper): void {
    container.nativeElement.appendChild(paper.el);
    paper.unfreeze();
  }

  public createShape(type: string, label: string, x: number, y: number): dia.Element {
    const magnetSize = 8;
    const baseOptions = {
      position: { x, y },
      z: 10,
      ports: {
        groups: {
          'in': {
            position: { name: 'left' },
            attrs: {
              portBody: {
                magnet: true,
                r: magnetSize,
                fill: '#3b82f6',
                stroke: '#1e40af',
                strokeWidth: 2,
                opacity: 0
              }
            }
          },
          'out': {
            position: { name: 'right' },
            attrs: {
              portBody: {
                magnet: true,
                r: magnetSize,
                fill: '#3b82f6',
                stroke: '#1e40af',
                strokeWidth: 2,
                opacity: 0
              }
            }
          }
        }
      },
      attrs: {
        body: {
          fill: '#ffffff',
          stroke: '#3b82f6',
          strokeWidth: 2
        },
        label: {
          text: label,
          fill: '#1f2937',
          fontSize: 14,
          fontWeight: '600',
          textWrap: { width: -10, height: -10 }
        }
      }
    };

    let shape: dia.Element;

    switch (type) {
      case 'START':
        shape = new shapes.standard.Circle({
          ...baseOptions,
          size: { width: 80, height: 80 },
          attrs: {
            ...baseOptions.attrs,
            body: { ...baseOptions.attrs.body, fill: '#d1fae5', stroke: '#10b981' }
          }
        });
        break;
      case 'DECISION':
        shape = new shapes.standard.Polygon({
          ...baseOptions,
          size: { width: 120, height: 120 },
          attrs: {
            body: {
              refPoints: '0,60 60,0 120,60 60,120',
              fill: '#fbbf24',
              stroke: '#b45309',
              strokeWidth: 2
            },
            label: { ...baseOptions.attrs.label, text: label }
          }
        });
        break;
      case 'END':
        shape = new shapes.standard.Circle({
          ...baseOptions,
          size: { width: 90, height: 90 },
          attrs: {
            ...baseOptions.attrs,
            body: { ...baseOptions.attrs.body, fill: '#fee2e2', stroke: '#ef4444', strokeWidth: 4 }
          }
        });
        break;
      default:
        shape = new shapes.standard.Rectangle({
          ...baseOptions,
          size: { width: 140, height: 70 },
          attrs: {
            ...baseOptions.attrs,
            body: { ...baseOptions.attrs.body, rx: 8, ry: 8, fill: '#eff6ff' }
          }
        });
    }

    // Add ports to the shape
    shape.addPort({ id: 'in', group: 'in' });
    shape.addPort({ id: 'out', group: 'out' });
    shape.set('nodeType', type);
    if (type === 'TASK') {
      shape.set('nodeMeta', {
        taskForm: {
          title: '',
          description: '',
          fields: [],
          attachments: []
        }
      });
    }
    if (type === 'DECISION') {
      shape.set('nodeMeta', { decisionExpression: '' });
    }

    return shape;
  }

  public createLink(source: dia.Element, target: dia.Element, condition?: string): dia.Link {
    const link = new shapes.standard.Link();
    link.source(source);
    link.target(target);
    link.set('z', 0);
    link.toBack();
    link.attr({
      line: {
        stroke: '#0f172a',
        strokeWidth: 3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        targetMarker: {
          type: 'path',
          d: 'M 10 -5 0 0 10 5 z',
          fill: '#0f172a',
          stroke: '#0f172a',
          'stroke-width': 1
        }
      }
    });

    if (condition) {
      link.set('conditionLabel', condition);
      link.appendLabel({
        attrs: {
          text: {
            text: condition,
            fill: '#0f172a',
            fontSize: 13,
            fontWeight: 'bold'
          },
          rect: {
            fill: '#ffffff',
            stroke: '#0f172a',
            strokeWidth: 1,
            rx: 3,
            ry: 3
          }
        },
        position: 0.5
      });
    }

    link.router('orthogonal', { padding: 30 });
    link.connector('straight', { cornerType: 'line' });
    return link;
  }

public renderLaneBackgrounds(graph: dia.Graph, lanes: Lane[]): void {
    this.clearLaneBackgrounds();

    if (lanes.length === 0) {
      return;
    }

    const laneWidth = this.getLaneWidth(lanes.length);
    const headerHeight = 44; 

    lanes.forEach((lane, index) => {
      const positionX = index * laneWidth;
      
      // 🚩 Usamos HeaderedRectangle: Es UN SOLO elemento indivisible
      const laneShape = new shapes.standard.HeaderedRectangle({
        z: -10, // Se queda al fondo
        position: { x: positionX, y: 0 },
        size: { width: laneWidth, height: this.height },
        isLaneBackground: true,
        attrs: {
          // El cuerpo de la calle
          body: {
            fill: lane.color,
            fillOpacity: 0.15, // IMPORTANTE: fillOpacity para no afectar la cabecera
            stroke: '#cbd5e1', 
            strokeWidth: 1
          },
          // La cabecera
          header: {
            fill: lane.color, 
            height: headerHeight,
            stroke: '#cbd5e1', 
            strokeWidth: 1
          },
          // El texto de la cabecera
          headerText: {
            text: lane.name.toUpperCase(), 
            fill: '#0f172a',
            fontSize: 14,
            fontWeight: 'bold',
            refX: 20,
            textAnchor: 'start' 
          },
          // Sin texto en el cuerpo
          bodyText: {
            text: ''
          }
        }
      });

      (laneShape as any).laneId = lane.id;
      
      graph.addCell(laneShape);
      // Como ahora es uno solo, empujamos directamente laneShape
      this.laneBackgrounds.push(laneShape); 
    });
  }

  public renderPolicy(graph: dia.Graph, policy: PolicyPayload, lanes: Lane[]): void {
    graph.clear();
    this.clearLaneBackgrounds();

    if (policy.diagramJson) {
      const graphData = this.sanitizeGraphJSON(JSON.parse(policy.diagramJson));
      graph.fromJSON(graphData);
    }

    if (lanes.length > 0) {
      this.renderLaneBackgrounds(graph, lanes);
    }
  }

  public getPersistedGraphJSON(graph: dia.Graph): dia.Graph.JSON {
    const graphJson = graph.toJSON() as dia.Graph.JSON;
    return this.sanitizeGraphJSON(graphJson);
  }

  public sanitizeGraphJSON(graphJson: dia.Graph.JSON): dia.Graph.JSON {
    return {
      ...graphJson,
      cells: graphJson.cells.filter((cell: any) => !cell.isLaneBackground)
    };
  }

  public hasExistingLink(graph: dia.Graph, sourceId: dia.Cell.ID, targetId: dia.Cell.ID): boolean {
    return graph.getLinks().some((link) => {
      const currentSourceId = link.get('source')?.id;
      const currentTargetId = link.get('target')?.id;
      return currentSourceId === sourceId && currentTargetId === targetId;
    });
  }

  public getNodeSize(type: string): { width: number; height: number } {
    switch (type) {
      case 'START':
      case 'END':
        return { width: 80, height: 80 };
      case 'DECISION':
        return { width: 120, height: 120 };
      case 'TASK':
      default:
        return { width: 140, height: 70 };
    }
  }

  public clampNodeX(x: number, nodeWidth: number): number {
    return Math.max(10, Math.min(x, this.width - nodeWidth - 10));
  }

  public clampNodeY(y: number, nodeHeight: number): number {
    return Math.max(54, Math.min(y, this.height - nodeHeight - 10));
  }

  public recalculateLanePositions(lanes: Lane[]): Lane[] {
    const laneWidth = this.getLaneWidth(lanes.length);
    return lanes.map((lane, index) => ({
      ...lane,
      x: index * laneWidth + laneWidth / 2
    }));
  }

  public getLaneIdByX(lanes: Lane[], x: number): string | null {
    if (lanes.length === 0) {
      return null;
    }

    const laneWidth = this.getLaneWidth(lanes.length);
    const index = Math.max(0, Math.min(lanes.length - 1, Math.floor(x / laneWidth)));
    return lanes[index]?.id ?? null;
  }

  public getCanvasRect(paper: dia.Paper): DOMRect {
    return paper.viewport.getBoundingClientRect();
  }

  public clearLaneBackgrounds(): void {
    this.laneBackgrounds.forEach((background) => background.remove());
    this.laneBackgrounds = [];
  }

  public updateNodeLabel(element: dia.Element, newLabel: string): void {
    if (element.isLink()) {
      return;
    }
    element.attr('label/text', newLabel);
  }

  public deleteElement(graph: dia.Graph, cellId: dia.Cell.ID): void {
    const cell = graph.getCell(cellId);
    if (cell) {
      cell.remove();
    }
  }

  public updateLinkCondition(link: dia.Link, condition: string): void {
    if (!link || !link.isLink()) {
      return;
    }

    if (link.labels().length > 0) {
      link.removeLabel(0);
    }

    link.set('conditionLabel', condition);

    if (condition) {
      link.appendLabel({
        attrs: {
          text: {
            text: condition,
            fill: '#0f172a',
            fontSize: 13,
            fontWeight: 'bold'
          },
          rect: {
            fill: '#ffffff',
            stroke: '#0f172a',
            strokeWidth: 1,
            rx: 3,
            ry: 3
          }
        },
        position: 0.5
      });
    }
  }

  private getLaneWidth(laneCount: number): number {
    return laneCount > 0 ? this.width / laneCount : this.width;
  }
}
