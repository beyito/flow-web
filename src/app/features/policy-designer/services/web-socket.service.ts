import { Injectable } from '@angular/core';
import { Client, IFrame, IMessage, StompSubscription } from '@stomp/stompjs';
import { DiagramEvent } from '../models/diagram-event.model';

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private client: Client | null = null;
  private connectPromise: Promise<void> | null = null;

  public connect(): Promise<void> {
    if (this.client?.connected) {
      return Promise.resolve();
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      this.client = new Client({
        brokerURL: this.getBrokerUrl(),
        reconnectDelay: 3000,
        debug: () => {
          // Intencionalmente silencioso para no ensuciar la consola en produccion.
        },
        onConnect: () => {
          this.connectPromise = null;
          resolve();
        },
        onStompError: (frame: IFrame) => {
          this.connectPromise = null;
          reject(new Error(frame.headers['message'] || 'STOMP error'));
        },
        onWebSocketError: () => {
          this.connectPromise = null;
          reject(new Error('No se pudo conectar al servidor WebSocket'));
        }
      });

      this.client.activate();
    });

    return this.connectPromise;
  }

  public disconnect(): void {
    this.client?.deactivate();
    this.client = null;
    this.connectPromise = null;
  }

  public subscribeToPolicy(policyId: string, callback: (event: DiagramEvent) => void): StompSubscription {
    if (!this.client?.connected) {
      throw new Error('WebSocket no conectado. Ejecuta connect() antes de suscribirte.');
    }

    return this.client.subscribe(`/topic/policy/${policyId}`, (message: IMessage) => {
      try {
        const event = JSON.parse(message.body) as DiagramEvent;
        callback(event);
      } catch {
        // Ignoramos mensajes mal formados para no romper la sesion.
      }
    });
  }

  public sendMessage(policyId: string, event: DiagramEvent): void {
    if (!this.client?.connected) {
      return;
    }

    this.client.publish({
      destination: `/app/policy/${policyId}/change`,
      body: JSON.stringify(event)
    });
  }

  private getBrokerUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname || 'localhost';
    return `${protocol}://${host}:8080/ws-designer`;
  }
}
