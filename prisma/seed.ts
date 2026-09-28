import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FIRST = ["Somchai", "Suda", "Nattapong", "Pimchanok", "Kittisak", "Waraporn", "Anan", "Siriporn", "Thanawat", "Kanya", "Prasert", "Mali", "Chaiwat", "Rattana", "Wichai", "Nok", "Arthit", "Busaba", "Jirawat", "Ploy"];
const LAST = ["Jaidee", "Rakthai", "Srisuk", "Wongsa", "Boonmee", "Chaiyaporn", "Thongdee", "Kaewmanee", "Sukjai", "Phromma"];
const PROVINCES = ["Bangkok", "Chiang Mai", "Khon Kaen", "Phuket", "Nonthaburi", "Chonburi", "Songkhla"];
const JOBS = ["SME Owner", "Office worker", "Freelancer", "Student", "Government officer", "Online seller", "Engineer"];
const INCOMES = ["< 15,000", "15,000 – 30,000", "30,001 – 50,000", "50,001 – 100,000", "> 100,000"];
const TAGS = ["SME Owner", "iPhone User", "Android User", "Online Shopper", "Mobile Banking", "Gen Z", "Parent", "Crypto Investor", "Food Delivery"];
const PROJECTS = ["Mobile Banking Onboarding", "SME Loan Journey", "Checkout Redesign", "Rewards Program Discovery"];
const INTERVIEWERS = ["Ploy", "Mint", "Beam", "Tee"];

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];

async function main() {
  await prisma.researchSession.deleteMany();
  await prisma.blacklistRecord.deleteMany();
  await prisma.participant.deleteMany();

  for (let i = 0; i < 40; i++) {
    const first = FIRST[i % FIRST.length];
    const last = pick(LAST);
    const job = pick(JOBS);
    const tags = [...new Set([job === "SME Owner" ? "SME Owner" : pick(TAGS), rand() > 0.5 ? "iPhone User" : "Android User", pick(TAGS)])];
    const signed = rand() > 0.3;

    const p = await prisma.participant.create({
      data: {
        firstName: first,
        lastName: last,
        phone: `08${String(10000000 + i * 1234567).slice(0, 8)}`,
        email: rand() > 0.3 ? `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com` : null,
        lineId: rand() > 0.4 ? `${first.toLowerCase()}_${i}` : null,
        age: 18 + Math.floor(rand() * 45),
        gender: rand() > 0.5 ? "Female" : "Male",
        occupation: job,
        monthlyIncome: pick(INCOMES),
        province: pick(PROVINCES),
        tags: JSON.stringify(tags),
        pdpaConsentSigned: signed,
        pdpaSignedDate: signed ? new Date(2026, Math.floor(rand() * 8), 1 + Math.floor(rand() * 27)) : null,
      },
    });

    const n = Math.floor(rand() * 4);
    let last_: Date | null = null;
    for (let s = 0; s < n; s++) {
      const date = new Date(2025, 6 + Math.floor(rand() * 14), 1 + Math.floor(rand() * 27));
      await prisma.researchSession.create({
        data: {
          participantId: p.id,
          projectName: pick(PROJECTS),
          sessionDate: date,
          interviewer: pick(INTERVIEWERS),
          behaviorRating: 1 + Math.floor(rand() * 3),
          keyTakeaways: "Walked through current workflow; strong opinions on notification overload.",
        },
      });
      if (!last_ || date > last_) last_ = date;
    }
    await prisma.participant.update({ where: { id: p.id }, data: { totalInterviews: n, lastSessionDate: last_ } });

    if (i % 9 === 4) {
      await prisma.blacklistRecord.create({
        data: { participantId: p.id, reason: i % 2 ? "NO_SHOW" : "FAKE_PROFILE", details: "Did not show up and stopped replying on LINE.", flaggedBy: pick(INTERVIEWERS) },
      });
      await prisma.participant.update({ where: { id: p.id }, data: { status: "GEH" } });
    }
  }
  console.log("Seeded 40 participants");
}

main().finally(() => prisma.$disconnect());
