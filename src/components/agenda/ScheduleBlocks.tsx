'use client'

import { useState, useEffect } from 'react'
import { Plus, Calendar, X, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ScheduleBlock {
  id: string
  professionalId: string
  professionalName: string
  date: string
  startTime: string
  endTime: string
  reason?: string
  isRecurring: boolean
  recurringPattern?: string
  createdAt: string
}

interface ScheduleBlockProps {
  professionalId?: string
}

export function ScheduleBlocks({ professionalId }: ScheduleBlockProps) {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [professionals, setProfessionals] = useState<any[]>([])
  const [newBlock, setNewBlock] = useState({
    professionalId: '',
    date: '',
    startTime: '',
    endTime: '',
    reason: '',
    isRecurring: false,
    recurringPattern: ''
  })

  const fetchBlocks = async () => {
    try {
      const params = new URLSearchParams()
      if (professionalId) params.append('professionalId', professionalId)

      const response = await fetch(`/api/schedule-blocks?${params}`)
      const data = await response.json()
      setBlocks(data)
    } catch (error) {
      console.error('Error fetching schedule blocks:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchProfessionals = async () => {
    try {
      const response = await fetch('/api/professionals?activeOnly=1')
      const data = await response.json()
      setProfessionals(data)
    } catch (error) {
      console.error('Error fetching professionals:', error)
    }
  }

  useEffect(() => {
    fetchBlocks()
    fetchProfessionals()
  }, [professionalId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/schedule-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBlock)
      })

      if (response.ok) {
        setNewBlock({
          professionalId: '',
          date: '',
          startTime: '',
          endTime: '',
          reason: '',
          isRecurring: false,
          recurringPattern: ''
        })
        setShowForm(false)
        fetchBlocks()
      }
    } catch (error) {
      console.error('Error creating schedule block:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este bloqueio?')) return

    try {
      const response = await fetch(`/api/schedule-blocks/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        fetchBlocks()
      }
    } catch (error) {
      console.error('Error deleting schedule block:', error)
    }
  }

  const formatDateTime = (date: string, time: string) => {
    const combined = new Date(`${date}T${time}`)
    return combined.toLocaleString('pt-BR')
  }

  const recurringOptions = [
    { value: 'daily', label: 'Diário' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'monthly', label: 'Mensal' }
  ]

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bloqueios de Agenda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Bloqueios de Agenda ({blocks.length})
          </CardTitle>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Bloqueio
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded-lg bg-muted">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Profissional</label>
                <Select value={newBlock.professionalId} onValueChange={(value) => setNewBlock({...newBlock, professionalId: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals.map(prof => (
                      <SelectItem key={prof.id} value={prof.id}>
                        {prof.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Data</label>
                <Input
                  type="date"
                  value={newBlock.date}
                  onChange={(e) => setNewBlock({...newBlock, date: e.target.value})}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Início</label>
                <Input
                  type="time"
                  value={newBlock.startTime}
                  onChange={(e) => setNewBlock({...newBlock, startTime: e.target.value})}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Fim</label>
                <Input
                  type="time"
                  value={newBlock.endTime}
                  onChange={(e) => setNewBlock({...newBlock, endTime: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium">Motivo</label>
              <Textarea
                value={newBlock.reason}
                onChange={(e) => setNewBlock({...newBlock, reason: e.target.value})}
                placeholder="Motivo do bloqueio"
                rows={2}
              />
            </div>

            <div className="mt-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={newBlock.isRecurring}
                  onChange={(e) => setNewBlock({...newBlock, isRecurring: e.target.checked})}
                />
                <span className="text-sm font-medium">Bloqueio Recorrente</span>
              </label>
            </div>

            {newBlock.isRecurring && (
              <div className="mt-4">
                <label className="text-sm font-medium">Padrão de Recorrência</label>
                <Select value={newBlock.recurringPattern} onValueChange={(value) => setNewBlock({...newBlock, recurringPattern: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o padrão" />
                  </SelectTrigger>
                  <SelectContent>
                    {recurringOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex space-x-2 mt-6">
              <Button type="submit">Salvar Bloqueio</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {blocks.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">
            Nenhum bloqueio encontrado
          </p>
        ) : (
          <div className="space-y-3">
            {blocks.map((block) => (
              <div key={block.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{block.professionalName}</span>
                    <Badge variant="secondary">
                      {formatDateTime(block.date, block.startTime)} - {block.endTime}
                    </Badge>
                    {block.isRecurring && (
                      <Badge variant="outline">
                        Recorrente ({recurringOptions.find(r => r.value === block.recurringPattern)?.label})
                      </Badge>
                    )}
                  </div>
                  {block.reason && (
                    <p className="text-sm text-muted-foreground mt-1">{block.reason}</p>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(block.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}