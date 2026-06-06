export default function AgendaPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Agenda Médica</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600 mb-4">
          Controle completo de agendamentos e consultas.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-2">Hoje</h3>
            <p className="text-gray-500">8 consultas</p>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-2">Esta Semana</h3>
            <p className="text-gray-500">42 consultas</p>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-2">Este Mês</h3>
            <p className="text-gray-500">168 consultas</p>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-2">Confirmadas</h3>
            <p className="text-gray-500">156 consultas</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
            Novo Agendamento
          </button>
          <button className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">
            Ver Agenda
          </button>
        </div>
      </div>
    </div>
  )
}