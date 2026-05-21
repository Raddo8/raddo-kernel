// 150 executive lenses · one COB. Banded for the editorial Index.
// Annotation field intentionally omitted in v1; reintroduced additively in Phase 2.

export type RoleBand = "executive" | "operating" | "functional" | "advisory";

export interface Role {
  title: string;
  band: RoleBand;
}

export const BAND_META: Record<RoleBand, { label: string; order: number }> = {
  executive:  { label: "Executive",  order: 1 },
  operating:  { label: "Operating",  order: 2 },
  functional: { label: "Functional", order: 3 },
  advisory:   { label: "Advisory",   order: 4 },
};

export const ROLES: Role[] = [
  // ── Executive (top-of-house · GM · partner)
  { title: "Chief Executive Officer", band: "executive" },
  { title: "Chief Operating Officer", band: "executive" },
  { title: "Chief of Staff", band: "executive" },
  { title: "President", band: "executive" },
  { title: "Executive Vice President", band: "executive" },
  { title: "Senior Vice President", band: "executive" },
  { title: "Vice President", band: "executive" },
  { title: "Managing Director", band: "executive" },
  { title: "General Manager", band: "executive" },
  { title: "Division President", band: "executive" },
  { title: "Regional President", band: "executive" },
  { title: "Managing Partner", band: "executive" },
  { title: "General Partner", band: "executive" },
  { title: "Operating Partner", band: "executive" },
  { title: "Principal", band: "executive" },
  { title: "Group Head", band: "executive" },

  // ── Operating (run-the-business · production · facilities)
  { title: "Chief Administrative Officer", band: "operating" },
  { title: "Chief Supply Chain Officer", band: "operating" },
  { title: "Chief Manufacturing Officer", band: "operating" },
  { title: "Chief Logistics Officer", band: "operating" },
  { title: "Chief Quality Officer", band: "operating" },
  { title: "Chief Process Officer", band: "operating" },
  { title: "Chief Performance Officer", band: "operating" },
  { title: "Chief Project Officer", band: "operating" },
  { title: "Chief Program Officer", band: "operating" },
  { title: "Chief Workplace Officer", band: "operating" },
  { title: "Chief Facilities Officer", band: "operating" },
  { title: "Chief Real Estate Officer", band: "operating" },
  { title: "Chief Retail Officer", band: "operating" },
  { title: "Chief Merchandising Officer", band: "operating" },
  { title: "Chief Safety Officer", band: "operating" },
  { title: "Chief Engineer", band: "operating" },
  { title: "Head of Operations", band: "operating" },
  { title: "VP Operations", band: "operating" },
  { title: "Director of Operations", band: "operating" },
  { title: "Plant Manager", band: "operating" },

  // ── Functional · Finance & capital
  { title: "Chief Financial Officer", band: "functional" },
  { title: "Chief Accounting Officer", band: "functional" },
  { title: "Chief Investment Officer", band: "functional" },
  { title: "Chief Risk Officer", band: "functional" },
  { title: "Chief Audit Officer", band: "functional" },
  { title: "Chief Treasury Officer", band: "functional" },
  { title: "Chief Credit Officer", band: "functional" },
  { title: "Chief Underwriting Officer", band: "functional" },
  { title: "Chief Actuary", band: "functional" },
  { title: "Chief Tax Officer", band: "functional" },
  { title: "Chief Procurement Officer", band: "functional" },
  { title: "Chief Investor Relations Officer", band: "functional" },
  { title: "Controller", band: "functional" },
  { title: "Treasurer", band: "functional" },
  { title: "Head of Financial Planning & Analysis", band: "functional" },
  { title: "Head of Investor Relations", band: "functional" },
  { title: "Head of Mergers & Acquisitions", band: "functional" },
  { title: "Head of Corporate Development", band: "functional" },
  { title: "Head of Finance", band: "functional" },
  { title: "VP Finance", band: "functional" },
  { title: "VP Investor Relations", band: "functional" },
  { title: "VP Risk Management", band: "functional" },
  { title: "VP Internal Audit", band: "functional" },

  // ── Functional · Strategy & growth
  { title: "Chief Strategy Officer", band: "functional" },
  { title: "Chief Growth Officer", band: "functional" },
  { title: "Chief Transformation Officer", band: "functional" },
  { title: "Chief Restructuring Officer", band: "functional" },
  { title: "Chief Innovation Officer", band: "functional" },
  { title: "Chief Portfolio Officer", band: "functional" },
  { title: "Chief Business Officer", band: "functional" },
  { title: "Chief Business Development Officer", band: "functional" },
  { title: "Head of Strategy", band: "functional" },
  { title: "VP Strategy", band: "functional" },
  { title: "VP Business Development", band: "functional" },

  // ── Functional · Revenue
  { title: "Chief Revenue Officer", band: "functional" },
  { title: "Chief Sales Officer", band: "functional" },
  { title: "Chief Commercial Officer", band: "functional" },
  { title: "Chief Customer Officer", band: "functional" },
  { title: "Chief Customer Success Officer", band: "functional" },
  { title: "Chief Customer Experience Officer", band: "functional" },
  { title: "Chief Channel Officer", band: "functional" },
  { title: "Chief Partnership Officer", band: "functional" },
  { title: "Head of Sales", band: "functional" },
  { title: "VP Sales", band: "functional" },
  { title: "VP Customer Success", band: "functional" },
  { title: "VP Revenue Operations", band: "functional" },

  // ── Functional · Marketing & comms
  { title: "Chief Marketing Officer", band: "functional" },
  { title: "Chief Brand Officer", band: "functional" },
  { title: "Chief Content Officer", band: "functional" },
  { title: "Chief Communications Officer", band: "functional" },
  { title: "Chief Experience Officer", band: "functional" },
  { title: "Chief Digital Officer", band: "functional" },
  { title: "Chief Marketing & Communications Officer", band: "functional" },
  { title: "Chief Reputation Officer", band: "functional" },
  { title: "Head of Marketing", band: "functional" },
  { title: "Head of Communications", band: "functional" },
  { title: "VP Marketing", band: "functional" },
  { title: "VP Communications", band: "functional" },

  // ── Functional · People
  { title: "Chief People Officer", band: "functional" },
  { title: "Chief Human Resources Officer", band: "functional" },
  { title: "Chief Talent Officer", band: "functional" },
  { title: "Chief Learning Officer", band: "functional" },
  { title: "Chief Culture Officer", band: "functional" },
  { title: "Chief Diversity Officer", band: "functional" },
  { title: "Chief Diversity, Equity & Inclusion Officer", band: "functional" },
  { title: "Chief Talent & Culture Officer", band: "functional" },
  { title: "Chief Health Officer", band: "functional" },
  { title: "Chief Wellness Officer", band: "functional" },
  { title: "Head of People", band: "functional" },
  { title: "Head of Talent", band: "functional" },

  // ── Functional · Tech / product / data
  { title: "Chief Technology Officer", band: "functional" },
  { title: "Chief Information Officer", band: "functional" },
  { title: "Chief Product Officer", band: "functional" },
  { title: "Chief Information Security Officer", band: "functional" },
  { title: "Chief Data Officer", band: "functional" },
  { title: "Chief Analytics Officer", band: "functional" },
  { title: "Chief AI Officer", band: "functional" },
  { title: "Chief Architecture Officer", band: "functional" },
  { title: "Chief Engineering Officer", band: "functional" },
  { title: "Chief Knowledge Officer", band: "functional" },
  { title: "Chief Data & Analytics Officer", band: "functional" },
  { title: "Chief Insights Officer", band: "functional" },
  { title: "Head of Product", band: "functional" },
  { title: "Head of Engineering", band: "functional" },
  { title: "VP Product", band: "functional" },
  { title: "VP Engineering", band: "functional" },
  { title: "VP Technology", band: "functional" },

  // ── Functional · Legal / compliance / risk
  { title: "Chief Legal Officer", band: "functional" },
  { title: "Chief Compliance Officer", band: "functional" },
  { title: "Chief Privacy Officer", band: "functional" },
  { title: "Chief Ethics Officer", band: "functional" },
  { title: "Chief Regulatory Officer", band: "functional" },
  { title: "Chief Trust Officer", band: "functional" },
  { title: "Chief Security Officer", band: "functional" },
  { title: "General Counsel", band: "functional" },
  { title: "Deputy General Counsel", band: "functional" },
  { title: "Head of Legal", band: "functional" },
  { title: "Head of Compliance", band: "functional" },

  // ── Functional · Science / research / sustainability
  { title: "Chief Medical Officer", band: "functional" },
  { title: "Chief Scientific Officer", band: "functional" },
  { title: "Chief Research Officer", band: "functional" },
  { title: "Chief Economist", band: "functional" },
  { title: "Chief Sustainability Officer", band: "functional" },
  { title: "Chief ESG Officer", band: "functional" },

  // ── Advisory (board · counsel · independent)
  { title: "Chairman", band: "advisory" },
  { title: "Vice Chairman", band: "advisory" },
  { title: "Board Chair", band: "advisory" },
  { title: "Lead Director", band: "advisory" },
  { title: "Board Director", band: "advisory" },
  { title: "Independent Director", band: "advisory" },
  { title: "Senior Advisor", band: "advisory" },
  { title: "Strategic Advisor", band: "advisory" },
  { title: "Executive Advisor", band: "advisory" },
  { title: "Corporate Secretary", band: "advisory" },
];

if (import.meta.env.DEV && ROLES.length !== 150) {
  // eslint-disable-next-line no-console
  console.warn(`[roles-index-data] expected 150 roles · got ${ROLES.length}`);
}
