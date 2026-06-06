export default function CRMPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">CRM - Pipeline de Vendas</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600 mb-4">
          Sistema de CRM para gestão de oportunidades e negócios.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-2">Em Negociação</h3>
            <p className="text-gray-500">3 oportunidades</p>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-2">Ganhas</h3>
            <p className="text-gray-500">12 oportunidades</p>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-2">Perdidas</h3>
            <p className="text-gray-500">5 oportunidades</p>
          </div>
        </div>

        <div className="mt-8">
          <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
            Nova Oportunidade
          </button>
        </div>
      </div>
    </div>
  )
}