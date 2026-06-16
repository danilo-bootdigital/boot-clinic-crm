'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Building } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

interface Room {
  id: string
  name: string
  description?: string
  isActive: boolean
}

interface RoomsProps {
  professionalId?: string
}

export function Rooms({ professionalId }: RoomsProps) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newRoom, setNewRoom] = useState({
    name: '',
    description: ''
  })

  const fetchRooms = async () => {
    try {
      const response = await fetch('/api/rooms')
      const data = await response.json()
      setRooms(data)
    } catch (error) {
      console.error('Error fetching rooms:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRooms()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRoom)
      })

      if (response.ok) {
        setNewRoom({ name: '', description: '' })
        setShowForm(false)
        fetchRooms()
      }
    } catch (error) {
      console.error('Error creating room:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta sala?')) return

    try {
      const response = await fetch(`/api/rooms/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        fetchRooms()
      }
    } catch (error) {
      console.error('Error deleting room:', error)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Salas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded animate-pulse" />
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
            <Building className="h-5 w-5" />
            Salas ({rooms.length})
          </CardTitle>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded-lg bg-gray-50">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nome da Sala</label>
                <Input
                  value={newRoom.name}
                  onChange={(e) => setNewRoom({...newRoom, name: e.target.value})}
                  placeholder="Nome da sala"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  value={newRoom.description}
                  onChange={(e) => setNewRoom({...newRoom, description: e.target.value})}
                  placeholder="Descrição da sala"
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

        {rooms.length === 0 ? (
          <p className="text-center text-gray-500 py-4">
            Nenhuma sala encontrada
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rooms.map((room) => (
              <div key={room.id} className="p-4 border rounded-lg hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium">{room.name}</h3>
                    {room.description && (
                      <p className="text-sm text-gray-600 mt-1">{room.description}</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <Badge variant="secondary" className={room.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                      {room.isActive ? 'Ativa' : 'Inativa'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(room.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}