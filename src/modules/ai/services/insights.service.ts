import prisma from '../../../lib/prisma';
import { aiOrchestrator } from '../ai.orchestrator';
import { OrchestrationResult } from '../ai.types';

export interface ManagerInsightsMetrics {
  totalPendingRequests: number;
  slaBreachCount: number;
  slaWarningCount: number;
  activeWorkOrders: number;
  completedWorkOrders: number;
  activeTechniciansCount: number;
  averageJobsPerTechnician: number;
  invoicesPendingSettlement: number;
  timeRange: string;
}

export interface ManagerInsightsResponse {
  metrics: ManagerInsightsMetrics;
  executiveSummary: string;
  identifiedBottlenecks: string[];
  recommendedActions: string[];
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
}

export class InsightsService {
  /**
   * Aggregates real operational data and generates actionable insights for Managers and Admins
   */
  public static async generateInsights(): Promise<OrchestrationResult<ManagerInsightsResponse>> {
    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Gather real authorized metrics from database
    const [
      pendingCount,
      slaWarningCount,
      slaBreachCount,
      activeWorkOrders,
      completedWorkOrders,
      activeTechnicians,
      pendingInvoices,
    ] = await Promise.all([
      prisma.serviceRequest.count({
        where: { status: { in: ['PENDING', 'UNDER_REVIEW'] }, deletedAt: null },
      }),
      prisma.serviceRequest.count({
        where: {
          status: { in: ['PENDING', 'UNDER_REVIEW'] },
          createdAt: { lte: twelveHoursAgo, gt: twentyFourHoursAgo },
          deletedAt: null,
        },
      }),
      prisma.serviceRequest.count({
        where: {
          status: { in: ['PENDING', 'UNDER_REVIEW'] },
          createdAt: { lte: twentyFourHoursAgo },
          deletedAt: null,
        },
      }),
      prisma.workOrder.count({
        where: { status: { in: ['SCHEDULED', 'ARRIVED', 'IN_PROGRESS'] } },
      }),
      prisma.workOrder.count({
        where: { status: 'COMPLETED' },
      }),
      prisma.technicianProfile.count({
        where: { isAvailable: true },
      }),
      prisma.invoice.count({
        where: { status: 'PENDING' },
      }),
    ]);

    const activeTechsCount = Math.max(1, activeTechnicians);
    const avgJobs = parseFloat((activeWorkOrders / activeTechsCount).toFixed(1));

    const metrics: ManagerInsightsMetrics = {
      totalPendingRequests: pendingCount,
      slaWarningCount,
      slaBreachCount,
      activeWorkOrders,
      completedWorkOrders,
      activeTechniciansCount: activeTechnicians,
      averageJobsPerTechnician: avgJobs,
      invoicesPendingSettlement: pendingInvoices,
      timeRange: 'Last 24 Hours / Live Operations State',
    };

    // 2. Synthesize AI Insights from real facts
    const factsPrompt = `OPERATIONAL FACTS (Measured from Database):
- Pending Customer Requests: ${metrics.totalPendingRequests}
- Requests Approaching 12h SLA Warning: ${metrics.slaWarningCount}
- Requests Exceeding 24h SLA Breach: ${metrics.slaBreachCount}
- Active Work Orders in Progress: ${metrics.activeWorkOrders}
- Completed Work Orders: ${metrics.completedWorkOrders}
- Available Field Technicians: ${metrics.activeTechniciansCount}
- Workload Ratio: ${metrics.averageJobsPerTechnician} active jobs/tech
- Pending Invoices: ${metrics.invoicesPendingSettlement}

Generate an operational briefing for the Operations Manager.
Strictly adhere to the facts provided. Do NOT invent customer names, fake revenue numbers, or fictitious technicians.
Format JSON only:
{
  "summary": "2-3 sentences summarizing current dispatch health, SLA status, and workload balance.",
  "bottlenecks": ["2 bullet points identifying actual bottlenecks from the numbers"],
  "actions": ["2 bullet points with concrete dispatch/review steps to resolve bottlenecks"]
}`;

    const aiRes = await aiOrchestrator.executeCompletion('insights', {
      messages: [
        { role: 'system', content: 'You are an operations intelligence analyst. Output JSON only.' },
        { role: 'user', content: factsPrompt },
      ],
      temperature: 0.15,
      maxTokens: 500,
      responseFormat: 'json',
    });

    let executiveSummary = `Operations pipeline currently holds ${metrics.totalPendingRequests} pending requests and ${metrics.activeWorkOrders} active field jobs across ${metrics.activeTechniciansCount} available technicians.`;
    let bottlenecks = [
      metrics.slaBreachCount > 0
        ? `${metrics.slaBreachCount} request(s) have breached the 24-hour initial review SLA window.`
        : 'Initial request review SLA is within healthy limits.',
      metrics.averageJobsPerTechnician > 3
        ? `Technician load (${metrics.averageJobsPerTechnician} jobs/tech) exceeds normal capacity.`
        : 'Technician workload distribution is balanced.',
    ];
    let recommendedActions = [
      'Prioritize pending service requests older than 12 hours in the dispatch queue.',
      'Ensure on-site service reports are completed to clear pending invoice settlement.',
    ];

    let providerName = aiRes.provider;
    let modelName = aiRes.model;
    let fallbackUsed = Boolean(aiRes.fallbackUsed);

    if (aiRes.success && aiRes.data) {
      try {
        const parsed = JSON.parse(aiRes.data);
        if (parsed.summary) executiveSummary = parsed.summary;
        if (Array.isArray(parsed.bottlenecks) && parsed.bottlenecks.length > 0) {
          bottlenecks = parsed.bottlenecks;
        }
        if (Array.isArray(parsed.actions) && parsed.actions.length > 0) {
          recommendedActions = parsed.actions;
        }
      } catch {
        // Fallback to measured facts heuristics
      }
    }

    return {
      success: true,
      data: {
        metrics,
        executiveSummary,
        identifiedBottlenecks: bottlenecks,
        recommendedActions,
        provider: providerName,
        model: modelName,
        fallbackUsed,
      },
      provider: providerName,
      model: modelName,
      fallbackUsed,
    };
  }
}
