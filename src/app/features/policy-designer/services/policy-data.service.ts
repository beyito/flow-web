import { Injectable } from '@angular/core';
import { executeGraphql } from '../../../core/api/graphql-client';
import { Lane, PolicyPayload, PolicySummary, TaskExecutionOrder } from '../models/policy-designer.models';

@Injectable({ providedIn: 'root' })
export class PolicyDataService {
  public async getAllPolicies(): Promise<PolicySummary[]> {
    const response = await executeGraphql<{ getAllPolicies: PolicySummary[] }>(`
      query GetAllPolicies {
        getAllPolicies {
          id
          name
          description
        }
      }
    `);

    return response.getAllPolicies ?? [];
  }

  public async getPolicyById(id: string): Promise<PolicyPayload | null> {
    const response = await executeGraphql<{ getPolicyById: PolicyPayload | null }>(`
      query GetPolicyById($id: ID!) {
        getPolicyById(id: $id) {
          id
          name
          description
          diagramJson
          lanes {
            id
            name
            color
            x
          }
        }
      }
    `, { id });

    return response.getPolicyById ?? null;
  }

  public async createPolicy(name: string, description: string): Promise<PolicySummary> {
    const response = await executeGraphql<{ createPolicy: PolicySummary }>(`
      mutation CreatePolicy($name: String!, $description: String) {
        createPolicy(name: $name, description: $description) {
          id
          name
          description
        }
      }
    `, { name, description });

    return response.createPolicy;
  }

  public async updatePolicyDiagram(policyId: string, diagramJson: string, lanes: Lane[]): Promise<void> {
    await executeGraphql<{ updatePolicyGraph: PolicySummary }>(`
      mutation UpdatePolicyGraph($policyId: ID!, $diagramJson: String!, $lanes: [LaneInput!]) {
        updatePolicyGraph(policyId: $policyId, diagramJson: $diagramJson, lanes: $lanes) {
          id
          name
        }
      }
    `, { policyId, diagramJson, lanes });
  }

  public async getTaskExecutionOrder(policyId: string): Promise<TaskExecutionOrder | null> {
    const response = await executeGraphql<{ getTaskExecutionOrder: TaskExecutionOrder | null }>(`
      query GetTaskExecutionOrder($policyId: ID!) {
        getTaskExecutionOrder(policyId: $policyId) {
          policyId
          policyName
          tasks {
            nodeId
            nodeLabel
            nodeType
            order
            dependencies
          }
        }
      }
    `, { policyId });

    return response.getTaskExecutionOrder ?? null;
  }
}
