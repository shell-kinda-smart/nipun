import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command'
import { Users2, Plus, Download, Play, Search } from 'lucide-react'
import { useCurrentUser, useHasPermission } from '@/store/auth'
import { useCommandPalette } from '@/store/command'
import { NAV_BY_ROLE } from '@/lib/nav'
import { useApi } from '@/hooks/useApi'
import type { Employee } from '@/data'

export function CommandPalette() {
  const open = useCommandPalette((s) => s.open)
  const setOpen = useCommandPalette((s) => s.setOpen)
  const navigate = useNavigate()
  const user = useCurrentUser()
  const canReadEmployees = useHasPermission('employees:read')
  const [search, setSearch] = useState('')

  // Global hotkey listener — ⌘K on Mac, Ctrl+K elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        useCommandPalette.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Reset search whenever the palette closes so it opens empty.
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const navItems = useMemo(() => {
    if (!user) return []
    return NAV_BY_ROLE[user.role].flatMap((g) => g.items)
  }, [user])

  // The directory powers the employee suggestions. Roles without
  // `employees:read` never see the directory, so nothing is requested.
  const employeesQuery = useApi<Employee[]>(
    canReadEmployees ? '/api/employees' : null,
    { perPage: 200 },
  )
  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data])
  const employeeTotal =
    typeof employeesQuery.meta?.total === 'number' ? employeesQuery.meta.total : employees.length

  const empMatches = useMemo(() => {
    if (!search) return employees.slice(0, 6)
    const q = search.toLowerCase()
    return employees
      .filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.designation.toLowerCase().includes(q))
      .slice(0, 8)
  }, [search, employees])

  if (!user) return null

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search. Employees, pages, actions."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-6">
            <Search className="h-6 w-6 text-muted-foreground" />
            <p>No results for "{search}"</p>
            <p className="text-xs text-muted-foreground">Try an employee name, page title or action.</p>
          </div>
        </CommandEmpty>

        <CommandGroup heading="Navigate">
          {navItems.map((item) => (
            <CommandItem
              key={item.to}
              value={`navigate ${item.label}`}
              onSelect={() => {
                navigate(item.to)
                setOpen(false)
              }}
            >
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <span>{item.label}</span>
              <CommandShortcut>Go</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading={`Employees · ${employeeTotal}`}>
          {empMatches.map((e) => (
            <CommandItem
              key={e.id}
              value={`employee ${e.name} ${e.id} ${e.designation}`}
              onSelect={() => {
                navigate(`/employees/${e.id}`)
                setOpen(false)
              }}
            >
              <Users2 className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">{e.name}</span>
              <span className="text-xs text-muted-foreground">{e.designation}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{e.id}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Actions">
          <CommandItem
            value="action process payroll"
            onSelect={() => {
              navigate('/payroll')
              setOpen(false)
            }}
          >
            <Play className="h-4 w-4 text-muted-foreground" />
            <span>Process payroll</span>
            <CommandShortcut>⏎</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="action add new employee"
            onSelect={() => {
              navigate('/employees?new=1')
              setOpen(false)
            }}
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span>Add new employee</span>
          </CommandItem>
          <CommandItem
            value="action generate report"
            onSelect={() => {
              navigate('/reports')
              setOpen(false)
            }}
          >
            <Download className="h-4 w-4 text-muted-foreground" />
            <span>Generate report</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
