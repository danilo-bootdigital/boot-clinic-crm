'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Repeat, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionButton } from '@/components/ui/action-button'
import { TaskFilters, type TaskFilterKey } from '@/components/tasks/TaskFilters'
import { TaskListItem } from '@/components/tasks/TaskListItem'
import { TaskDrawer } from '@/components/tasks/TaskDrawer'
import { emptyTaskForm, type TaskFormValue } from '@/components/tasks/TaskForm'

const ADMIN_ROLES = ['SUPER_ADMIN', 'OWNER', 'MANAGER']
const PAGE_SIZE = 20

function toDateInput(iso: string) {
  return String(iso).slice(0, 10)
}

export default function TarefasPage() {
  const router = useRouter()
  const [me, setMe] = useState<any | null>(null)
  const [users, setUsers] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<TaskFilterKey>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<any | null>(null)
  const [form, setForm] = useState<TaskFormValue>(emptyTaskForm())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then(setMe)
    fetch('/api/users').then((r) => (r.ok ? r.json() : [])).then(setUsers)
    fetch('/api/patients?limit=100').then((r) => (r.ok ? r.json() : { patients: [] })).then((d) => setPatients(d.patients ?? []))
  }, [])

  // Debounce da busca (300ms) — evita uma chamada por tecla digitada.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ filter, page: String(page), pageSize: String(PAGE_SIZE) })
    if (search) params.set('search', search)
    const res = await fetch(`/api/followup/tasks?${params}`, { cache: 'no-store' })
    if (res.status === 401) { router.push('/login?redirect=/tarefas'); return }
    if (res.ok) {
      const d = await res.json()
      setTasks(d.tasks ?? [])
      setCounts(d.counts ?? {})
      setTotal(d.total ?? 0)
    }
    setLoading(false)
  }, [filter, page, search, router])

  useEffect(() => { load() }, [load])

  function changeFilter(f: TaskFilterKey) { setFilter(f); setPage(1) }

  function abrirNova() {
    setForm(emptyTaskForm(me?.id ?? ''))
    setEditingTask(null)
    setError(null)
    setDrawerOpen(true)
  }

  function abrirVer(t: any) {
    setForm({
      title: t.title,
      dueDate: toDateInput(t.dueDate),
      priority: t.priority,
      assignedToId: t.assignedToId || '',
      description: t.description || '',
      category: t.category || '',
      patientId: t.patientId || '',
      isRecurring: !!t.isRecurring,
      recurrenceType: t.recurrenceType || 'WEEKLY',
      recurrenceEvery: t.recurrenceEvery || 1,
    })
    setEditingTask(t)
    setError(null)
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditingTask(null)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const payload = { ...form, category: form.category.trim() }
    const res = editingTask
      ? await fetch(`/api/followup/tasks/${editingTask.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/followup/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setBusy(false)
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao salvar tarefa'); return }
    closeDrawer()
    load()
  }

  async function setStatus(id: string, status: string, canceledReason?: string) {
    await fetch(`/api/followup/tasks/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(canceledReason !== undefined && { canceledReason }) }),
    })
    closeDrawer()
    load()
  }

  function cancelarComMotivo(id: string) {
    const motivo = window.prompt('Motivo do cancelamento (opcional):')
    if (motivo === null) return
    setStatus(id, 'CANCELED', motivo)
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta tarefa?')) return
    await fetch(`/api/followup/tasks/${id}`, { method: 'DELETE' })
    closeDrawer()
    load()
  }

  async function quickComplete(id: string) {
    await fetch(`/api/followup/tasks/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }),
    })
    load()
  }

  const isAdmin = me ? ADMIN_ROLES.includes(me.role) : false
  const canComplete = !!editingTask && (isAdmin || editingTask.assignedToId === me?.id || editingTask.createdById === me?.id)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tarefas"
        description="Organize as pendências da clínica e acompanhe o que precisa ser resolvido."
        icon={<Repeat className="h-5 w-5" />}
        actions={<ActionButton icon={<Plus />} onClick={abrirNova}>Nova tarefa</ActionButton>}
      />

      <TaskFilters
        filter={filter}
        onFilterChange={changeFilter}
        counts={counts}
        search={searchInput}
        onSearchChange={setSearchInput}
        showMineFilter={isAdmin}
      />

      {loading ? (
        <LoadingState rows={6} label="Carregando tarefas" />
      ) : tasks.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={<Repeat className="h-6 w-6" />}
            title="Nenhuma tarefa encontrada"
            description={search || filter !== 'all' ? 'Ajuste a busca ou os filtros.' : 'Crie a primeira tarefa em "Nova tarefa".'}
            action={<ActionButton icon={<Plus />} onClick={abrirNova}>Nova tarefa</ActionButton>}
          />
        </SectionCard>
      ) : (
        <SectionCard>
          <div className="divide-y divide-border">
            {tasks.map((t) => (
              <TaskListItem
                key={t.id}
                task={t}
                currentUserId={me?.id ?? ''}
                isAdmin={isAdmin}
                onOpen={abrirVer}
                onComplete={quickComplete}
                onDelete={isAdmin ? remove : undefined}
              />
            ))}
          </div>
          {total > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground">
              <span>Página {page} de {totalPages} · {total} tarefa(s)</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40">Anterior</button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40">Próxima</button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      <TaskDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        editingTask={editingTask}
        form={form}
        setForm={setForm}
        users={users}
        patients={patients}
        onSubmit={salvar}
        busy={busy}
        error={error}
        canComplete={canComplete}
        canCancel={isAdmin}
        canDelete={isAdmin}
        onComplete={() => editingTask && setStatus(editingTask.id, 'COMPLETED')}
        onCancel={() => editingTask && cancelarComMotivo(editingTask.id)}
        onDelete={() => editingTask && remove(editingTask.id)}
      />
    </div>
  )
}
