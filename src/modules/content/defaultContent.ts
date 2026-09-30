export interface DefaultSectionData {
  sectionKey: string;
  title: string;
  subtitle: string;
  order: number;
  isVisible: boolean;
  isPublished: boolean;
  content: Record<string, any>;
}

export const DEFAULT_WEBSITE_SECTIONS: DefaultSectionData[] = [
  {
    sectionKey: 'hero',
    title: 'Smartly Connecting Customers, Technicians, and Service Operations.',
    subtitle:
      'ServiSync streamlines the complete field service lifecycle — from customer request submission and conflict-free dispatching to real-time status transitions, on-site service reports, and automated Stripe billing.',
    order: 1,
    isVisible: true,
    isPublished: true,
    content: {
      badgeText: 'Field Service Management System',
      highlightedText: 'Customers, Technicians,',
      primaryCtaText: 'Get Started as Customer',
      primaryCtaLink: '/register',
      secondaryCtaText: 'Explore Service Catalog',
      secondaryCtaLink: '#services',
      metrics: [
        { label: 'Role Architecture', value: '4 Roles', description: 'Strict RBAC Enforcement' },
        { label: 'Service Lifecycle', value: '7 Stages', description: 'End-to-End Audited State Machine' },
        { label: 'Payment Gateway', value: 'Stripe', description: 'Verified Billing & Invoicing' },
      ],
    },
  },
  {
    sectionKey: 'features',
    title: 'Engineered for Reliability & Scale',
    subtitle:
      'ServiSync combines modern web architecture with strict backend authorization, real-time cache synchronization, and complete audit logging.',
    order: 2,
    isVisible: true,
    isPublished: true,
    content: {
      badge: 'Platform Capabilities',
      items: [
        {
          icon: 'ShieldCheck',
          title: 'Role-Based Access Control',
          description:
            'Guaranteed backend authorization across CUSTOMER, TECHNICIAN, MANAGER, and ADMIN. Privileges are verified on every API call.',
          tag: 'Security',
        },
        {
          icon: 'Zap',
          title: 'Instant Cache Invalidation',
          description:
            'TanStack Query engine guarantees optimistic updates, background synchronization, and automatic cache invalidation upon mutations.',
          tag: 'Performance',
        },
        {
          icon: 'CreditCard',
          title: 'Automated Stripe Invoicing',
          description:
            'Seamless Stripe Checkout sessions with verified backend webhook processing, preventing fraudulent payment states.',
          tag: 'Billing',
        },
        {
          icon: 'Wrench',
          title: 'Skill-Based Dispatching',
          description:
            'Technician qualifications and availability are validated before work order assignment to prevent scheduling conflicts.',
          tag: 'Operations',
        },
        {
          icon: 'ClipboardCheck',
          title: 'Digital Field Service Reports',
          description:
            'Technicians document diagnostic findings, actions taken, parts used, and photo attachments directly upon completion.',
          tag: 'Documentation',
        },
        {
          icon: 'TrendingUp',
          title: 'Audited Operational Intelligence',
          description:
            'Comprehensive audit log tracing for every status change, financial settlement, and administrative action with IP and user-agent stamps.',
          tag: 'Compliance',
        },
      ],
    },
  },
  {
    sectionKey: 'workflow',
    title: 'How ServiSync Powers Field Service',
    subtitle:
      'From problem identification to payment settlement, every state transition is strictly authorized, audited, and synchronized in real-time.',
    order: 3,
    isVisible: true,
    isPublished: true,
    content: {
      badge: 'End-to-End Workflow',
      steps: [
        {
          stepNumber: '01',
          title: 'Submit Service Request',
          role: 'Customer',
          description:
            'Customer selects an active service category, defines the problem, adds site location, and picks an arrival window.',
          icon: 'CalendarCheck',
        },
        {
          stepNumber: '02',
          title: 'Review & Dispatch',
          role: 'Manager',
          description:
            'Operations review the request, check technician availability and certifications, and dispatch without scheduling overlap.',
          icon: 'Users',
        },
        {
          stepNumber: '03',
          title: 'Field Execution & Report',
          role: 'Technician',
          description:
            'Technician accepts the job, transitions status from Arrived to In-Progress, and completes a digital service report with findings.',
          icon: 'ClipboardCheck',
        },
        {
          stepNumber: '04',
          title: 'Invoice & Stripe Settlement',
          role: 'Manager & Customer',
          description:
            'Manager issues an itemized digital invoice and the customer securely pays online via integrated Stripe Checkout.',
          icon: 'CreditCard',
        },
      ],
    },
  },
  {
    sectionKey: 'roles',
    title: 'Tailored Experiences for Every Stakeholder',
    subtitle:
      'Dedicated interfaces built specifically for the daily workflows of customers, field technicians, operations managers, and system administrators.',
    order: 4,
    isVisible: true,
    isPublished: true,
    content: {
      badge: 'Stakeholder Portals',
      roles: [
        {
          role: 'Customer',
          tagline: 'Effortless Service Booking',
          description: 'A frictionless self-service portal for property owners and tenants.',
          bullets: [
            'Interactive category selection with live cost estimation',
            'Real-time status timeline tracking from pending to complete',
            'Technician profile and direct phone contact',
            'Secure Stripe payment and job feedback submission',
          ],
        },
        {
          role: 'Technician',
          tagline: 'Mobile-Optimized Field Hub',
          description: 'Designed for on-the-go technicians working in the field.',
          bullets: [
            'Daily schedule and assigned job queue',
            'One-tap status updates (Arrived, In-Progress, Completed)',
            'Turn-by-turn navigation via Google Maps',
            'Digital service report submission with diagnostics',
          ],
        },
        {
          role: 'Manager',
          tagline: 'Operations & Dispatch Control',
          description: 'Command center for service triage, scheduling, and billing.',
          bullets: [
            'Request review, approval, and conflict-free dispatching',
            'Real-time technician availability and skill verification',
            'One-click itemized invoice creation and monitoring',
            'Operational revenue aggregation and performance stats',
          ],
        },
        {
          role: 'Admin',
          tagline: 'Enterprise System Governance',
          description: 'Centralized administration, access management, and auditing.',
          bullets: [
            'User role management and account activation controls',
            'Category and service type catalog administration',
            'Website CMS content management with live publishing',
            'Searchable audit trail tracking all system mutations',
          ],
        },
      ],
    },
  },
  {
    sectionKey: 'showcase',
    title: 'Experience the Four Dedicated Portals',
    subtitle:
      'Each role receives a custom-tailored interface designed to maximize speed, accuracy, and operational transparency.',
    order: 5,
    isVisible: true,
    isPublished: true,
    content: {
      badge: 'Product Showcase',
      tabs: [
        {
          id: 'customer',
          label: 'Customer Portal',
          heading: 'Effortless Field Service Requests',
          description:
            'Customers can easily browse categories, select preconfigured service types with transparent base rates, specify emergency priority, and track technicians in real-time.',
          highlights: ['Visual category selector', 'Live pricing estimator', 'Direct Stripe checkout', 'Review & rating submission'],
        },
        {
          id: 'technician',
          label: 'Technician Workspace',
          heading: 'Dedicated Field Execution Mobile UI',
          description:
            'Technicians receive their daily schedule, review assignment notes, log arrival on site, and generate verified digital service reports directly on mobile or tablet.',
          highlights: ['Job queue with status buttons', 'Google Maps route integration', 'Digital findings & actions log', 'Direct customer phone dialer'],
        },
        {
          id: 'manager',
          label: 'Operations Dispatch',
          heading: 'Conflict-Free Scheduling & Invoicing',
          description:
            'Managers supervise incoming requests, match qualified technicians based on required skills (Electrical, Plumbing, HVAC), and generate itemized invoices upon completion.',
          highlights: ['Conflict-free dispatch scheduler', 'Technician skill matching', 'Instant invoice generation', 'Revenue analytics'],
        },
        {
          id: 'admin',
          label: 'Admin Control Center',
          heading: 'Complete Security & System Governance',
          description:
            'Administrators control user permissions, service categories, pricing defaults, audit logging, and the public website CMS from a single unified control panel.',
          highlights: ['Role-based access management', 'Service catalog editor', 'Website CMS editor', 'Immutable security audit logs'],
        },
      ],
    },
  },
  {
    sectionKey: 'faq',
    title: 'Frequently Asked Questions',
    subtitle:
      'Find answers to common questions about ServiSync platform architecture, scheduling, billing, and security.',
    order: 6,
    isVisible: true,
    isPublished: true,
    content: {
      badge: 'Knowledge Base',
      items: [
        {
          question: 'How does ServiSync prevent scheduling conflicts?',
          answer:
            'When a manager schedules a technician, the backend checks for overlapping active assignments within the scheduled window. If the technician is already booked, the system alerts the manager and prevents double booking.',
          category: 'Operations',
        },
        {
          question: 'How are payments handled and verified?',
          answer:
            'Once work is completed and an invoice is generated by a manager, the customer initiates payment via Stripe Checkout. The backend listens for Stripe webhook notifications to verify payment settlement before updating invoice status to PAID.',
          category: 'Billing',
        },
        {
          question: 'Can technicians be assigned jobs outside their skill set?',
          answer:
            'No. Each service type specifies required skill certifications (e.g. Electrical, HVAC, Plumbing). The dispatch system only displays technicians possessing the required certifications with active availability.',
          category: 'Operations',
        },
        {
          question: 'Is public content managed dynamically?',
          answer:
            'Yes. Administrators have a dedicated Website Content Management module inside the Admin Dashboard to customize hero messaging, features, workflow steps, FAQs, and footer settings with draft/publish support.',
          category: 'Platform',
        },
        {
          question: 'How does ServiSync ensure data security and accountability?',
          answer:
            'All endpoints enforce server-side JWT authentication and RBAC authorization. Every critical state change, dispatch action, and financial transaction creates an immutable audit log recording user ID, action, timestamp, and IP address.',
          category: 'Security',
        },
      ],
    },
  },
  {
    sectionKey: 'cta',
    title: 'Ready to Transform Your Field Service Operations?',
    subtitle:
      'Join thousands of satisfied customers and streamlined operations teams. Book your first service request or schedule a walkthrough today.',
    order: 7,
    isVisible: true,
    isPublished: true,
    content: {
      primaryButtonText: 'Book a Service Now',
      primaryButtonLink: '/register',
      secondaryButtonText: 'Sign In to Portal',
      secondaryButtonLink: '/login',
    },
  },
  {
    sectionKey: 'footer',
    title: 'ServiSync Field Service Management',
    subtitle: 'Smartly Connecting Customers, Field Technicians, and Service Operations.',
    order: 8,
    isVisible: true,
    isPublished: true,
    content: {
      companyName: 'ServiSync Systems Inc.',
      tagline: 'Enterprise-grade Field Service Management System.',
      copyright: '© 2026 ServiSync Systems. All rights reserved.',
      contactEmail: 'support@servisync.com',
      contactPhone: '+880 1712-345678',
      address: 'Dhaka, Bangladesh',
      links: [
        { label: 'Service Catalog', href: '#services' },
        { label: 'How It Works', href: '#how-it-works' },
        { label: 'Platform Features', href: '#features' },
        { label: 'Role Portals', href: '#roles' },
        { label: 'FAQ', href: '#faq' },
      ],
    },
  },
];
