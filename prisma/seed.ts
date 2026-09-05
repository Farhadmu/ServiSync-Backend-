import bcrypt from 'bcrypt';
import { prisma } from '../src/lib/prisma';
import { env } from '../src/config/env';

async function main() {
  console.log('Seeding database...');

  const adminPassword = await bcrypt.hash('Admin@123', 12);
  const managerPassword = await bcrypt.hash('Manager@123', 12);
  const techPassword = await bcrypt.hash('Tech@123', 12);
  const customerPassword = await bcrypt.hash('Customer@123', 12);

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

  const electricalSkill = await prisma.skill.upsert({
    where: { name: 'ELECTRICAL' },
    update: {},
    create: { name: 'ELECTRICAL', description: 'Electrical systems and wiring' },
  });

  const hvacSkill = await prisma.skill.upsert({
    where: { name: 'HVAC' },
    update: {},
    create: { name: 'HVAC', description: 'Heating, ventilation, and air conditioning' },
  });

  const plumbingSkill = await prisma.skill.upsert({
    where: { name: 'PLUMBING' },
    update: {},
    create: { name: 'PLUMBING', description: 'Plumbing systems and repair' },
  });

  await prisma.serviceTypeRequiredSkill.createMany({
    data: [
      { serviceTypeId: acRepairType.id, skillId: electricalSkill.id },
      { serviceTypeId: acRepairType.id, skillId: hvacSkill.id },
      { serviceTypeId: wiringType.id, skillId: electricalSkill.id },
      { serviceTypeId: leakRepairType.id, skillId: plumbingSkill.id },
    ],
    skipDuplicates: true,
  });

  const tech1Profile = await prisma.technicianProfile.findFirst({ where: { userId: tech1.id } });
  const tech2Profile = await prisma.technicianProfile.findFirst({ where: { userId: tech2.id } });

  if (tech1Profile) {
    await prisma.technicianSkill.createMany({
      data: [
        { technicianId: tech1Profile.id, skillId: electricalSkill.id, proficiency: 'EXPERT' },
        { technicianId: tech1Profile.id, skillId: hvacSkill.id, proficiency: 'ADVANCED' },
      ],
      skipDuplicates: true,
    });
  }

  if (tech2Profile) {
    await prisma.technicianSkill.createMany({
      data: [
        { technicianId: tech2Profile.id, skillId: plumbingSkill.id, proficiency: 'EXPERT' },
        { technicianId: tech2Profile.id, skillId: electricalSkill.id, proficiency: 'INTERMEDIATE' },
      ],
      skipDuplicates: true,
    });
  }

  const serviceRequest = await prisma.serviceRequest.create({
    data: {
      customerId: customer1.id,
      serviceTypeId: acRepairType.id,
      title: 'AC not cooling properly',
      description: 'My AC is running but not cooling the room effectively.',
      location: '123 Main St, Dhaka',
      preferredDateTime: new Date(Date.now() + 86400000 * 2).toISOString(),
      status: 'PENDING',
    },
  });

  console.log('Seeding completed successfully!');
  console.log('Demo credentials:');
  console.log('  Admin:    admin@servisync.com / Admin@123');
  console.log('  Manager:  manager@servisync.com / Manager@123');
  console.log('  Tech 1:   tech1@servisync.com / Tech@123');
  console.log('  Tech 2:   tech2@servisync.com / Tech@123');
  console.log('  Customer: customer1@example.com / Customer@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
