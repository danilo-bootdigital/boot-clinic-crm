export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">BOOT CLINIC CRM</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <a href="/" className="border-blue-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                  Início
                </a>
                <a href="/pacientes" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                  Pacientes
                </a>
                <a href="/agenda" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                  Agenda
                </a>
                <a href="/crm" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                  CRM
                </a>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              Bem-vindo ao BOOT CLINIC CRM
            </h2>
            <p className="text-gray-600 mb-6">
              Sistema de gestão para clínicas médicas com módulos completos.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <a href="/pacientes" className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
                <h3 className="text-lg font-medium text-gray-900">Pacientes</h3>
                <p className="text-gray-500 mt-2">Gestão de pacientes e histórico</p>
              </a>

              <a href="/agenda" className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
                <h3 className="text-lg font-medium text-gray-900">Agenda</h3>
                <p className="text-gray-500 mt-2">Controle de agendamentos</p>
              </a>

              <a href="/crm" className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
                <h3 className="text-lg font-medium text-gray-900">CRM</h3>
                <p className="text-gray-500 mt-2">Pipeline de vendas</p>
              </a>
            </div>

            <div className="mt-8 p-4 bg-blue-50 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Status do Sistema</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-blue-600 font-medium">Banco de Dados:</span>
                  <span className="ml-2 text-green-600">Conectado</span>
                </div>
                <div>
                  <span className="text-blue-600 font-medium">Supabase:</span>
                  <span className="ml-2 text-green-600">Ativo</span>
                </div>
                <div>
                  <span className="text-blue-600 font-medium">Ambiente:</span>
                  <span className="ml-2 text-green-600">Produção</span>
                </div>
                <div>
                  <span className="text-blue-600 font-medium">Versão:</span>
                  <span className="ml-2">1.0.0</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}