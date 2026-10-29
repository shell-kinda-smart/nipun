import type { Role, Permission } from './types'

// ============================================================================
// Role permission matrix
// ============================================================================

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'employees:read',
    'employees:write',
    'employees:hold',
    'payroll:read',
    'payroll:process',
    'payroll:select',
    'payroll:submit',
    'payroll:approve',
    'payroll:reject',
    'payroll:pay',
    'reports:read',
    'reports:export',
    'reports:schedule',
    'analytics:read',
    'audit:read',
    'audit:export',
    'settings:read',
    'settings:write',
    'anomalies:read',
    'anomalies:resolve',
    'schedules:read',
    'schedules:write',
    'jobs:read',
    'jobs:retry',
    'termination:read',
    'termination:write',
    'termination:approve',
    'settlement:read',
    'settlement:approve',
  ],
  hr: [
    'employees:read',
    'employees:write',
    'employees:hold',
    'payroll:read',
    'reports:read',
    'reports:export',
    'reports:schedule',
    'analytics:read',
    'audit:read',
    'anomalies:read',
    'termination:read',
    'termination:write',
    'settlement:read',
  ],
  finance: [
    'employees:read',
    'payroll:read',
    'payroll:process',
    'payroll:select',
    'payroll:submit',
    'payroll:pay',
    'reports:read',
    'reports:export',
    'reports:schedule',
    'analytics:read',
    'audit:read',
    'audit:export',
    'anomalies:read',
    'anomalies:resolve',
    'schedules:read',
    'schedules:write',
    'settlement:read',
  ],
  // Approving payroll is a separate duty: whoever prepares a run cannot
  // approve it.
  approver: [
    'payroll:read',
    'payroll:approve',
    'payroll:reject',
    'reports:read',
    'analytics:read',
    'audit:read',
    'schedules:read',
    'termination:read',
    'termination:approve',
    'settlement:read',
    'settlement:approve',
  ],
  employee: ['payroll:read'],
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  hr: 'HR Manager',
  finance: 'Finance Manager',
  approver: 'Payroll Approver',
  employee: 'Employee',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Complete system control · users · settings · audit',
  hr: 'Employees · workforce analytics · documents',
  finance: 'Payroll preparation · payments · reports',
  approver: 'Approval decisions · final settlement sign-off',
  employee: 'Your salary · payslips · tax information',
}

// ============================================================================
// Departments
// ============================================================================

/**
 * Department identity colours.
 *
 * `color` is a complete CSS colour so it can be used directly as an inline
 * style (legend dots) and as an SVG `fill` attribute (recharts `<Cell>`).
 * The theme stores each token as bare HSL channels (`219 66% 22%`), so the
 * `hsl()` wrapper is what turns it into a real colour — without it the
 * declaration is invalid and renders as the default black.
 * `fill` is the Tailwind class equivalent, so SVG shapes can be coloured
 * through CSS. Both point at the same token.
 */
export const DEPARTMENTS = [
  { id: 'eng', name: 'Engineering', color: 'hsl(var(--dept-eng))', fill: 'fill-dept-eng', icon: 'Code2' },
  { id: 'sales', name: 'Sales', color: 'hsl(var(--dept-sales))', fill: 'fill-dept-sales', icon: 'TrendingUp' },
  { id: 'ops', name: 'Operations', color: 'hsl(var(--dept-ops))', fill: 'fill-dept-ops', icon: 'Settings2' },
  { id: 'people', name: 'People & Finance', color: 'hsl(var(--dept-people))', fill: 'fill-dept-people', icon: 'Users' },
] as const

// ============================================================================
// Designation salary bands
// ============================================================================

export const DESIGNATIONS: Record<string, { min: number; max: number; dept: string[] }> = {
  'SDE I': { min: 6, max: 9, dept: ['eng'] },
  'SDE II': { min: 10, max: 14, dept: ['eng'] },
  'Senior SDE': { min: 15, max: 22, dept: ['eng'] },
  'Tech Lead': { min: 22, max: 32, dept: ['eng'] },
  'Engineering Manager': { min: 30, max: 45, dept: ['eng'] },
  'Sales Executive': { min: 4, max: 6, dept: ['sales'] },
  'Senior Sales Executive': { min: 6, max: 9, dept: ['sales'] },
  'Sales Manager': { min: 10, max: 15, dept: ['sales'] },
  'VP Sales': { min: 25, max: 40, dept: ['sales'] },
  'Operations Executive': { min: 3, max: 5, dept: ['ops'] },
  'Operations Lead': { min: 7, max: 10, dept: ['ops'] },
  'Operations Manager': { min: 10, max: 14, dept: ['ops'] },
  'HR Executive': { min: 4, max: 6, dept: ['people'] },
  'HR Manager': { min: 10, max: 15, dept: ['people'] },
  'Finance Executive': { min: 4, max: 6, dept: ['people'] },
  'Finance Manager': { min: 12, max: 18, dept: ['people'] },
  'Platform Administrator': { min: 30, max: 50, dept: ['people'] },
}

// ============================================================================
// Name pools (used by deterministic seeder)
// ============================================================================

export const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
  'Krishna', 'Ishaan', 'Shaurya', 'Atharv', 'Advait', 'Kabir', 'Aryan', 'Ryan',
  'Aadhya', 'Ananya', 'Diya', 'Saanvi', 'Aanya', 'Pari', 'Anika', 'Navya',
  'Myra', 'Ira', 'Anvi', 'Avni', 'Sara', 'Misha', 'Priya', 'Neha',
  'Sneha', 'Meera', 'Tanvi', 'Ishita', 'Pooja', 'Kavya', 'Nandini', 'Riya',
  'Rahul', 'Rohan', 'Dev', 'Karan', 'Manav', 'Aakash', 'Vikram', 'Rajesh',
  'Arjun', 'Aryan', 'Shaurya', 'Atharv', 'Ankit', 'Harsh', 'Yash', 'Kunal',
]

export const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Gupta', 'Iyer', 'Reddy', 'Nair', 'Khan',
  'Singh', 'Kumar', 'Joshi', 'Mehta', 'Shah', 'Kapoor', 'Bose', 'Rao',
  'Chatterjee', 'Banerjee', 'Mukherjee', 'Pillai', 'Menon', 'Bhat', 'Saxena',
  'Khanna', 'Malhotra', 'Chauhan', 'Srinivasan', 'Trivedi', 'Bhatt', 'Desai',
  'Kulkarni', 'Hegde', 'Kamath', 'Achar', 'Bhandari', 'Choudhary', 'Aggarwal',
]

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const BANK_NAMES = ['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Kotak Mahindra']