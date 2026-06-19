'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

interface Specialty {
  id: string
  name: string
  description?: string
}

interface SpecialtiesProps {
  professionalId?: string
}

export function Specialties({ professionalId }: SpecialtiesProps) {
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newSpecialty, setNewSpecialty] = useState({
    name: '',
    description: ''
  })

  const fetchSpecialties = async () => {
    try {
      const response = await fetch('/api/specialties')
      const data = await response.json()
      setSpecialties(data)
    } catch (error) {
      console.error('Error fetching specialties:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSpecialties()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/specialties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSpecialty)
      })

      if (response.ok) {
        setNewSpecialty({ name: '', description: '' })
        setShowForm(false)
        fetchSpecialties()
      }
    } catch (error) {
      console.error('Error creating specialty:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta especialidade?')) return

    try {
      const response = await fetch(`/api/specialties/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        fetchSpecialties()
      }
    } catch (error) {
      console.error('Error deleting specialty:', error)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Especialidades</CardTitle>
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
          <CardTitle>Especialidades ({specialties.length})</CardTitle>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded-lg bg-muted">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <Input
                  value={newSpecialty.name}
                  onChange={(e) => setNewSpecialty({...newSpecialty, name: e.target.value})}
                  placeholder="Nome da especialidade"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  value={newSpecialty.description}
                  onChange={(e) => setNewSpecialty({...newSpecialty, description: e.target.value})}
                  placeholder="Descrição da especialidade"
                  rows={3}
                />
              </div>

              <div className="flex space-x-2">
                <Button type="submit">Salvar</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </form>
        )}

        {specialties.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">
            Nenhuma especialidade encontrada
          </p>
        ) : (
          <div className="space-y-3">
            {specialties.map((specialty) => (
              <div key={specialty.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted">
                <div>
                  <h3 className="font-medium">{specialty.name}</h3>
                  {specialty.description && (
                    <p className="text-sm text-muted-foreground mt-1">{specialty.description}</p>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">Ativa</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(specialty.id)}
                  >
                    <Trash2 className="h-4 w-4" />
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