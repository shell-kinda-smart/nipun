import type { Role, Permission } from '@/data'
import {
  LayoutDashboard,
  Users2,
  Receipt,
  BarChart3,
  FileSpreadsheet,
  AlertTriangle,
  ShieldCheck,
  Bell,
  Settings,
  FileText,
  ScrollText,
  Calculator,
  UserCircle,
  Wallet,
  CalendarClock,
  ListChecks,
  PauseCircle,
  UserMinus,
  Briefcase,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  permission?: Permission
  badge?: 'notifications' | 'anomalies'
}

export interface NavGroup {
  title?: string
  items: NavItem[]
}

/**
 * Navigation per role. The sidebar renders the active role's tree.
 * `badge` is a live counter wired to the data store (set later).
 */
export const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  admin: [
    {
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/employees', label: 'Employees', icon: Users2, permission: 'employees:read' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { to: '/payroll', label: 'Payroll', icon: Wallet, permission: 'payroll:read', badge: 'notifications' },
        { to: '/payroll/runs', label: 'Payroll Runs', icon: ListChecks, permission: 'payroll:read' },
        { to: '/payroll/payments', label: 'Payments', icon: Wallet, permission: 'payroll:read' },
        { to: '/analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics:read' },
        { to: '/anomalies', label: 'Anomalies', icon: AlertTriangle, permission: 'anomalies:read', badge: 'anomalies' },
      ],
    },
    {
      title: 'Insights',
      items: [
        { to: '/reports', label: 'Reports', icon: FileSpreadsheet, permission: 'reports:read' },
        { to: '/tax', label: 'Tax Center', icon: Calculator, permission: 'payroll:read' },
      ],
    },
    {
      title: 'Governance',
      items: [
        { to: '/audit', label: 'Audit Log', icon: ScrollText, permission: 'audit:read' },
        { to: '/schedules', label: 'Schedules', icon: CalendarClock, permission: 'schedules:read' },
        { to: '/jobs', label: 'Background Jobs', icon: PauseCircle, permission: 'jobs:read' },
        { to: '/terminations', label: 'Terminations', icon: UserMinus, permission: 'termination:read' },
        { to: '/notifications', label: 'Notifications', icon: Bell },
        { to: '/settings/profile', label: 'Settings', icon: Settings, permission: 'settings:read' },
      ],
    },
  ],
  hr: [
    {
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/employees', label: 'Employees', icon: Users2, permission: 'employees:read' },
        { to: '/analytics', label: 'Workforce Analytics', icon: BarChart3, permission: 'analytics:read' },
      ],
    },
    {
      title: 'Workforce',
      items: [
        { to: '/documents', label: 'Documents', icon: FileText },
        { to: '/employees/holds', label: 'Holds', icon: UserMinus, permission: 'employees:read' },
        { to: '/terminations', label: 'Terminations', icon: Briefcase, permission: 'termination:read' },
        { to: '/reports', label: 'Reports', icon: FileSpreadsheet, permission: 'reports:read' },
      ],
    },
    {
      title: 'Account',
      items: [
        { to: '/notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ],
  finance: [
    {
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/payroll', label: 'Payroll', icon: Wallet, permission: 'payroll:read', badge: 'notifications' },
        { to: '/payroll/runs', label: 'Payroll Runs', icon: ListChecks, permission: 'payroll:read' },
        { to: '/payroll/payments', label: 'Payments', icon: Wallet, permission: 'payroll:read' },
        { to: '/tax', label: 'Tax Center', icon: Calculator, permission: 'payroll:read' },
      ],
    },
    {
      title: 'Insights',
      items: [
        { to: '/analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics:read' },
        { to: '/reports', label: 'Reports', icon: FileSpreadsheet, permission: 'reports:read' },
        { to: '/anomalies', label: 'Anomalies', icon: AlertTriangle, permission: 'anomalies:read', badge: 'anomalies' },
      ],
    },
    {
      title: 'Governance',
      items: [
        { to: '/audit', label: 'Audit Log', icon: ScrollText, permission: 'audit:read' },
        { to: '/schedules', label: 'Schedules', icon: CalendarClock, permission: 'schedules:read' },
        { to: '/jobs', label: 'Background Jobs', icon: PauseCircle, permission: 'jobs:read' },
        { to: '/notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ],
  // The approver decides: it reviews runs, terminations and settlements.
  approver: [
    {
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/payroll/approvals', label: 'Approvals', icon: ListChecks, permission: 'payroll:approve' },
      ],
    },
    {
      title: 'Decisions',
      items: [
        { to: '/terminations', label: 'Terminations', icon: UserMinus, permission: 'termination:read' },
        { to: '/settlements', label: 'Final Settlements', icon: FileText, permission: 'settlement:read' },
      ],
    },
    {
      title: 'Insight',
      items: [
        { to: '/reports', label: 'Reports', icon: FileSpreadsheet, permission: 'reports:read' },
        { to: '/audit', label: 'Audit Log', icon: ScrollText, permission: 'audit:read' },
      ],
    },
    {
      title: 'Account',
      items: [
        { to: '/notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ],
  employee: [
    {
      items: [
        { to: '/', label: 'Overview', icon: LayoutDashboard },
        { to: '/me/payslips', label: 'My Payslips', icon: Receipt, permission: 'payroll:read' },
        { to: '/me/tax', label: 'My Tax Info', icon: ShieldCheck, permission: 'payroll:read' },
      ],
    },
    {
      title: 'Account',
      items: [
        { to: '/me/termination', label: 'My Documents', icon: FileText },
        { to: '/me/profile', label: 'My Profile', icon: UserCircle },
        { to: '/notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ],
}

// Mobile bottom-nav: top 4 destinations per role
export const MOBILE_NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: [
    { to: '/', label: 'Home', icon: LayoutDashboard },
    { to: '/employees', label: 'People', icon: Users2 },
    { to: '/payroll', label: 'Payroll', icon: Wallet },
    { to: '/anomalies', label: 'Alerts', icon: AlertTriangle },
  ],
  hr: [
    { to: '/', label: 'Home', icon: LayoutDashboard },
    { to: '/employees', label: 'People', icon: Users2 },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/notifications', label: 'Alerts', icon: Bell },
  ],
  finance: [
    { to: '/', label: 'Home', icon: LayoutDashboard },
    { to: '/payroll', label: 'Payroll', icon: Wallet },
    { to: '/reports', label: 'Reports', icon: FileSpreadsheet },
    { to: '/anomalies', label: 'Alerts', icon: AlertTriangle },
  ],
  approver: [
    { to: '/', label: 'Home', icon: LayoutDashboard },
    { to: '/payroll/approvals', label: 'Approvals', icon: ListChecks },
    { to: '/terminations', label: 'Terminations', icon: UserMinus },
    { to: '/notifications', label: 'Alerts', icon: Bell },
  ],
  employee: [
    { to: '/', label: 'Home', icon: LayoutDashboard },
    { to: '/me/payslips', label: 'Payslips', icon: Receipt },
    { to: '/me/tax', label: 'Tax', icon: ShieldCheck },
    { to: '/me/termination', label: 'Documents', icon: FileText },
  ],
}