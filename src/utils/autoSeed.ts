import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';

export async function autoSeed() {
  try {
    const existingAdmin = await prisma.user.findUnique({
      where: { email: 'admin@servisync.com' },
    });

    if (existingAdmin) {
      // Check if customer1 also exists
      const existingCustomer = await prisma.user.findUnique({
        where: { email: 'customer1@example.com' },
      });
      if (existingCustomer) {
        return; // Already seeded
      }
    }

    console.log('[AutoSeed] Seeding default demo accounts for evaluation...');

    const adminPassword = await bcrypt.hash('Admin@123', 10);
    const managerPassword = await bcrypt.hash('Manager@123', 10);
    const techPassword = await bcrypt.hash('Tech@123', 10);
    const customerPassword = await bcrypt.hash('Customer@123', 10);

    const admin = await prisma.user.upsert({
      where: { email: 'admin@servisync.com' },
      update: {},
      create: {
        email: 'admin@servisync.com',
        password: adminPassword,
        name: 'System Admin',
        role: 'ADMIN',
        isActive: true,
        isEmailVerified: true,
      },
    });

    const manager = await prisma.user.upsert({
      where: { email: 'manager@servisync.com' },
      update: {},
      create: {
        email: 'manager@servisync.com',
        password: managerPassword,
        name: 'Operations Manager',
        role: 'MANAGER',
        isActive: true,
        isEmailVerified: true,
      },
    });

    const tech1 = await prisma.user.upsert({
      where: { email: 'tech1@servisync.com' },
      update: {},
      create: {
        email: 'tech1@servisync.com',
        password: techPassword,
        name: 'Rahim Technician',
        role: 'TECHNICIAN',
        isActive: true,
        isEmailVerified: true,
      },
    });

    await prisma.technicianProfile.upsert({
      where: { userId: tech1.id },
      update: {},
      create: {
        userId: tech1.id,
        bio: 'Expert in electrical and HVAC',
        experienceYears: 5,
        hourlyRate: 50,
        isAvailable: true,
      },
    });

    const tech2 = await prisma.user.upsert({
      where: { email: 'tech2@servisync.com' },
      update: {},
      create: {
        email: 'tech2@servisync.com',
        password: techPassword,
        name: 'Karim Technician',
        role: 'TECHNICIAN',
        isActive: true,
        isEmailVerified: true,
      },
    });

    await prisma.technicianProfile.upsert({
      where: { userId: tech2.id },
      update: {},
      create: {
        userId: tech2.id,
        bio: 'Plumbing and general repair specialist',
        experienceYears: 3,
        hourlyRate: 40,
        isAvailable: true,
      },
    });

    const customer1 = await prisma.user.upsert({
      where: { email: 'customer1@example.com' },
      update: {},
      create: {
        email: 'customer1@example.com',
        password: customerPassword,
        name: 'Alice Customer',
        role: 'CUSTOMER',
        isActive: true,
        isEmailVerified: true,
      },
    });

    await prisma.customerProfile.upsert({
      where: { userId: customer1.id },
      update: {},
      create: {
        userId: customer1.id,
        phone: '+8801712345678',
        address: '123 Main St, Dhaka',
      },
    });

    const customer2 = await prisma.user.upsert({
      where: { email: 'customer2@example.com' },
      update: {},
      create: {
        email: 'customer2@example.com',
        password: customerPassword,
        name: 'Bob Customer',
        role: 'CUSTOMER',
        isActive: true,
        isEmailVerified: true,
      },
    });

    await prisma.customerProfile.upsert({
      where: { userId: customer2.id },
      update: {},
      create: {
        userId: customer2.id,
        phone: '+8801812345678',
        address: '456 Oak Ave, Dhaka',
      },
    });

    const electricalCategory = await prisma.serviceCategory.upsert({
      where: { name: 'Electrical' },
      update: {},
      create: { name: 'Electrical', description: 'Electrical repair and installation services', isActive: true },
    });

    const plumbingCategory = await prisma.serviceCategory.upsert({
      where: { name: 'Plumbing' },
      update: {},
      create: { name: 'Plumbing', description: 'Plumbing repair and installation services', isActive: true },
    });

    const acRepairType = await prisma.serviceType.upsert({
      where: { id: 'ac-repair' },
      update: {},
      create: { id: 'ac-repair', categoryId: electricalCategory.id, name: 'AC Repair', description: 'Air conditioner repair and maintenance', basePrice: 80, durationMinutes: 120, isActive: true },
    });

    const wiringType = await prisma.serviceType.upsert({
      where: { id: 'wiring' },
      update: {},
      create: { id: 'wiring', categoryId: electricalCategory.id, name: 'Wiring', description: 'Electrical wiring installation and repair', basePrice: 100, durationMinutes: 180, isActive: true },
    });

    const leakRepairType = await prisma.serviceType.upsert({
      where: { id: 'leak-repair' },
      update: {},
      create: { id: 'leak-repair', categoryId: plumbingCategory.id, name: 'Leak Repair', description: 'Water leak detection and repair', basePrice: 60, durationMinutes: 90, isActive: true },
    });

    console.log('[AutoSeed] All demo accounts & categories seeded successfully!');
  } catch (error) {
    console.warn('[AutoSeed] Warning: Auto-seed skipped or failed non-fatally:', error);
  }
}
