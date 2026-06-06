#!/bin/bash

echo "🧪 Iniciando testes da Agenda Médica..."

# Teste 1: Verificar se as APIs estão respondendo
echo "📋 Teste 1: Verificando endpoints da agenda..."

# Testar especialidades
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/agenda/specialties)
if [ "$response" -eq 200 ]; then
    echo "✅ API de especialidades está respondendo"
else
    echo "❌ API de especialidades não está respondendo (HTTP $response)"
    exit 1
fi

# Testar profissionais
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/agenda/professionals)
if [ "$response" -eq 200 ]; then
    echo "✅ API de profissionais está respondendo"
else
    echo "❌ API de profissionais não está respondendo (HTTP $response)"
    exit 1
fi

# Testar agendamentos
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/agenda/appointments)
if [ "$response" -eq 200 ]; then
    echo "✅ API de agendamentos está respondendo"
else
    echo "❌ API de agendamentos não está respondendo (HTTP $response)"
    exit 1
fi

echo ""
echo "🎯 Testes de API concluídos com sucesso!"

# Teste 2: Verificar se as páginas carregam
echo ""
echo "📋 Teste 2: Verificando páginas da agenda..."

# Testar página da agenda
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/agenda)
if [ "$response" -eq 200 ]; then
    echo "✅ Página da agenda está acessível"
else
    echo "❌ Página da agenda não está acessível (HTTP $response)"
    exit 1
fi

echo ""
echo "🎯 Testes de página concluídos com sucesso!"

echo ""
echo "🏁 Todos os testes foram concluídos com sucesso!"
echo "✅ Módulo de Agenda Médica está pronto para uso!"