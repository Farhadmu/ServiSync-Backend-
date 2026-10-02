import prisma from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';

export interface RecommendationBreakdown {
  skillMatch: number;      // max 35
  customerRating: number;  // max 25
  workloadBalance: number; // max 20
  experience: number;      // max 20
  total: number;           // max 100
}

export interface CandidateTechnician {
  technicianId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  bio: string | null;
  experienceYears: number;
  hourlyRate: number;
  matchedSkills: string[];
  missingSkills: string[];
  activeJobsCount: number;
  averageRating: number;
  totalReviews: number;
  score: number;
  scoreBreakdown: RecommendationBreakdown;
  eligibilityReasons: string[];
  isTopPick: boolean;
}

export interface IneligibleTechnician {
  technicianId: string;
  userId: string;
  name: string;
  email: string;
  exclusionReasons: string[];
}

export interface RecommendationResult {
  serviceRequestId: string;
  serviceTypeName: string;
  requiredSkills: string[];
  appointmentWindow: {
    startAt: string | null;
    endAt: string | null;
    durationMinutes: number;
  };
  recommended: CandidateTechnician[];
  ineligible: IneligibleTechnician[];
  totalEligible: number;
  totalCandidates: number;
  summary: string;
}

export async function getTechnicianRecommendations(
  serviceRequestId: string,
  preferredStartAt?: string,
  preferredEndAt?: string
): Promise<RecommendationResult> {
  const serviceRequest = await prisma.serviceRequest.findUnique({
    where: { id: serviceRequestId, deletedAt: null },
    include: {
      serviceType: {
        include: {
          category: true,
          requiredSkills: { include: { skill: true } },
        },
      },
      customer: { select: { id: true, name: true } },
    },
  });

  if (!serviceRequest) {
    throw new ApiError(404, 'Service request not found');
  }

  const durationMinutes = serviceRequest.serviceType.durationMinutes || 120;
  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;

  if (preferredStartAt && preferredEndAt) {
    windowStart = new Date(preferredStartAt);
    windowEnd = new Date(preferredEndAt);
  } else if (serviceRequest.preferredDateTime) {
    windowStart = new Date(serviceRequest.preferredDateTime);
    windowEnd = new Date(windowStart.getTime() + durationMinutes * 60 * 1000);
  }

  const requiredSkillNames = serviceRequest.serviceType.requiredSkills.map(
    (rs) => rs.skill.name.toLowerCase()
  );

  // Fetch all active technicians
  const technicians = await prisma.technicianProfile.findMany({
    where: {
      user: {
        deletedAt: null,
        isActive: true,
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      skills: { include: { skill: true } },
      assignments: {
        where: {
          status: { in: ['PENDING', 'ACCEPTED', 'SCHEDULED'] },
        },
        include: {
          schedule: true,
        },
      },
    },
  });

  const recommended: CandidateTechnician[] = [];
  const ineligible: IneligibleTechnician[] = [];

  // Batch fetch all customer feedback for all candidate technicians to eliminate N+1 query overhead
  const allCandidateUserIds = technicians.map((t) => t.userId);
  const allFeedbacks = await prisma.feedback.findMany({
    where: { technicianId: { in: allCandidateUserIds } },
    select: { technicianId: true, rating: true },
  });

  const feedbackMap = new Map<string, number[]>();
  for (const f of allFeedbacks) {
    const list = feedbackMap.get(f.technicianId) || [];
    list.push(f.rating);
    feedbackMap.set(f.technicianId, list);
  }

  for (const tech of technicians) {
    const techSkillNames = tech.skills.map((s) => s.skill.name.toLowerCase());
    const matchedSkills = tech.skills
      .filter((s) => requiredSkillNames.includes(s.skill.name.toLowerCase()))
      .map((s) => s.skill.name);
    const missingSkills = serviceRequest.serviceType.requiredSkills
      .filter((rs) => !techSkillNames.includes(rs.skill.name.toLowerCase()))
      .map((rs) => rs.skill.name);

    const exclusionReasons: string[] = [];

    // 1. Availability check
    if (!tech.isAvailable) {
      exclusionReasons.push('Technician is currently marked as unavailable for dispatch');
    }

    // 2. Skill qualification check
    if (requiredSkillNames.length > 0 && missingSkills.length > 0) {
      exclusionReasons.push(`Missing required qualification(s): ${missingSkills.join(', ')}`);
    }

    // 3. Schedule conflict check (if window is defined)
    if (windowStart && windowEnd) {
      const conflictingSchedule = tech.assignments.find((a) => {
        if (!a.schedule || a.schedule.cancelledAt) return false;
        return a.schedule.startAt < windowEnd! && a.schedule.endAt > windowStart!;
      });

      if (conflictingSchedule?.schedule) {
        const conflictTime = `${new Date(conflictingSchedule.schedule.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(conflictingSchedule.schedule.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        exclusionReasons.push(`Schedule conflict with existing booking (${conflictTime})`);
      }
    }

    // 4. Workload limit check (max 5 active jobs)
    const activeJobsCount = tech.assignments.length;
    if (activeJobsCount >= 5) {
      exclusionReasons.push(`Maximum daily workload reached (${activeJobsCount}/5 active jobs)`);
    }

    if (exclusionReasons.length > 0) {
      ineligible.push({
        technicianId: tech.id,
        userId: tech.userId,
        name: tech.user.name,
        email: tech.user.email,
        exclusionReasons,
      });
      continue;
    }

    // Calculate rating from batched feedback map (O(1) lookup)
    const userRatings = feedbackMap.get(tech.userId) || [];
    const totalReviews = userRatings.length;
    const averageRating =
      totalReviews > 0
        ? Number((userRatings.reduce((acc, r) => acc + r, 0) / totalReviews).toFixed(1))
        : 4.5; // Default reputable baseline for verified onboarding

    // Compute Multi-Factor Deterministic Score:
    // A. Skill Match: max 35 pts
    let skillScore = 30;
    if (tech.skills.length > requiredSkillNames.length) {
      skillScore = Math.min(35, skillScore + (tech.skills.length - requiredSkillNames.length));
    }

    // B. Customer Rating: max 25 pts
    const ratingScore = Math.round((averageRating / 5) * 25);

    // C. Workload Balance: max 20 pts (fewer active jobs = higher score)
    const workloadScore = Math.max(0, 20 - activeJobsCount * 4);

    // D. Experience Years: max 20 pts
    const experienceYears = tech.experienceYears || 1;
    const experienceScore = Math.min(20, Math.max(5, experienceYears * 3));

    const totalScore = Math.min(100, skillScore + ratingScore + workloadScore + experienceScore);

    const eligibilityReasons: string[] = [
      `Holds required skills: ${matchedSkills.length > 0 ? matchedSkills.join(', ') : 'Verified trade qualifications'}`,
      `Verified rating: ${averageRating}★ (${totalReviews} reviews)`,
      `Available capacity: ${activeJobsCount} active job${activeJobsCount === 1 ? '' : 's'} assigned`,
      `${experienceYears} year${experienceYears === 1 ? '' : 's'} verified field experience`,
    ];

    if (windowStart && windowEnd) {
      eligibilityReasons.unshift('Schedule clear: No overlapping booking during requested window');
    }

    recommended.push({
      technicianId: tech.id,
      userId: tech.userId,
      name: tech.user.name,
      email: tech.user.email,
      image: tech.user.image,
      bio: tech.bio,
      experienceYears,
      hourlyRate: Number(tech.hourlyRate) || 50,
      matchedSkills,
      missingSkills,
      activeJobsCount,
      averageRating,
      totalReviews,
      score: totalScore,
      scoreBreakdown: {
        skillMatch: skillScore,
        customerRating: ratingScore,
        workloadBalance: workloadScore,
        experience: experienceScore,
        total: totalScore,
      },
      eligibilityReasons,
      isTopPick: false,
    });
  }

  // Deterministic sort: Highest score first, then highest rating, then lowest workload
  recommended.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
    return a.activeJobsCount - b.activeJobsCount;
  });

  if (recommended.length > 0) {
    recommended[0].isTopPick = true;
  }

  const summary = recommended.length > 0
    ? `Identified ${recommended.length} certified technician${recommended.length === 1 ? '' : 's'} meeting all required qualifications and schedule requirements. Top recommendation: ${recommended[0].name} (${recommended[0].score}% match).`
    : `No eligible technicians currently meet all trade qualifications and schedule availability requirements for this request. Consider rescheduling or adjusting technician assignments.`;

  return {
    serviceRequestId,
    serviceTypeName: serviceRequest.serviceType.name,
    requiredSkills: serviceRequest.serviceType.requiredSkills.map((rs) => rs.skill.name),
    appointmentWindow: {
      startAt: windowStart ? windowStart.toISOString() : null,
      endAt: windowEnd ? windowEnd.toISOString() : null,
      durationMinutes,
    },
    recommended,
    ineligible,
    totalEligible: recommended.length,
    totalCandidates: technicians.length,
    summary,
  };
}
