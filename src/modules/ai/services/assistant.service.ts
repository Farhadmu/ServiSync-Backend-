import prisma from '../../../lib/prisma';
import { aiOrchestrator } from '../ai.orchestrator';
import { AIMessage, OrchestrationResult } from '../ai.types';

export interface AssistantChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: {
    currentCategory?: string;
    userRole?: string;
  };
}

export interface AssistantChatResponse {
  reply: string;
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
  suggestedServices?: Array<{
    id: string;
    name: string;
    categoryName: string;
    basePrice?: number;
  }>;
  actionLinks?: Array<{
    title: string;
    url: string;
  }>;
}

export class AssistantService {
  /**
   * Retrieves verified service catalog from PostgreSQL via Prisma to build real context
   */
  private static async getCatalogContext(): Promise<string> {
    try {
      const categories = await prisma.serviceCategory.findMany({
        where: { deletedAt: null, isActive: true },
        include: {
          serviceTypes: {
            where: { deletedAt: null, isActive: true },
            select: { id: true, name: true, description: true, basePrice: true, durationMinutes: true },
            take: 10,
          },
        },
        take: 8,
      });

      if (!categories || categories.length === 0) {
        return 'Standard Field Services: HVAC Maintenance, Plumbing Repairs, Electrical Diagnostics, Appliance Servicing, Security Installations.';
      }

      return categories
        .map((cat) => {
          const serviceList = cat.serviceTypes
            .map((st) => `- ${st.name} (Base: ৳${st.basePrice || 'Custom'}, ~${st.durationMinutes || 60}m): ${st.description || 'Standard repair & maintenance'}`)
            .join('\n');
          return `Category: ${cat.name}\n${serviceList}`;
        })
        .join('\n\n');
    } catch (err) {
      return 'ServiSync Field Services Catalog: Plumbing, HVAC, Electrical, Security, and Appliance Repair.';
    }
  }

  public static async handleChat(
    req: AssistantChatRequest
  ): Promise<OrchestrationResult<AssistantChatResponse>> {
    const catalogContext = await this.getCatalogContext();

    const systemPrompt = `You are ServiSync AI Service Assistant — the authoritative, helpful virtual guide for the ServiSync Field Service Management Platform.

CORE PLATFORM RULES & GROUNDING:
1. Grounding: You assist customers in understanding available repairs, diagnostic services, booking procedures, and platform policies.
2. Verified Catalog Context:
${catalogContext}

3. Platform Policies:
- Booking: Customers submit requests through the "Live Booking" widget on the homepage or "/dashboard/requests/new".
- Review & Dispatch: All requests are vetted by operations managers and assigned to certified, background-checked technicians based on verified skill credentials.
- Invoicing & Payments: Invoices are generated with transparent line items upon work order completion and settled via Stripe.
- Support: For disputes or ticket assistance, users can access "/help" or open a ticket at "/dashboard/support".
- Safety: All field technicians undergo identity and trade screening.

STRICT SAFETY CONSTRAINTS:
- NEVER fabricate fake appointment slots, technician availability dates, or booking confirmations.
- NEVER invent non-existent services, certifications, or fictitious prices outside the catalog context.
- NEVER reveal personal information, customer addresses, phone numbers, or invoices.
- If a customer desires to book, always guide them to use the official booking flow at "/instant-booking" or "/dashboard/requests/new".
- Keep replies concise, professional, courteous, and actionable.`;

    const aiMessages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...req.messages.slice(-6).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content.slice(0, 1500),
      })),
    ];

    const result = await aiOrchestrator.executeCompletion('assistant', {
      messages: aiMessages,
      temperature: 0.25,
      maxTokens: 600,
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || 'AI Assistant is temporarily unavailable.',
        code: result.code || 'AI_UNAVAILABLE',
      };
    }

    // Identify any matching services from the real database to provide rich action chips
    const lastUserMsg = (req.messages[req.messages.length - 1]?.content || '').toLowerCase();
    let suggestedServices: AssistantChatResponse['suggestedServices'] = [];

    try {
      const matched = await prisma.serviceType.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          OR: [
            { name: { contains: lastUserMsg.slice(0, 30), mode: 'insensitive' } },
            { category: { name: { contains: lastUserMsg.slice(0, 30), mode: 'insensitive' } } },
          ],
        },
        take: 3,
        include: { category: { select: { name: true } } },
      });

      suggestedServices = matched.map((m) => ({
        id: m.id,
        name: m.name,
        categoryName: m.category.name,
        basePrice: m.basePrice ? Number(m.basePrice) : undefined,
      }));
    } catch {
      suggestedServices = [];
    }

    return {
      success: true,
      data: {
        reply: result.data,
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        suggestedServices,
        actionLinks: [
          { title: 'Live Booking', url: '/#instant-booking' },
          { title: 'Service Catalog', url: '/#services' },
          { title: 'Help & Support', url: '/help' },
        ],
      },
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      fallbackUsed: result.fallbackUsed,
    };
  }
}
