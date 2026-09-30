import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [mensagem, setMensagem] = useState('Carregando...')

  useEffect(() => {
    supabase
      .from('hello')
      .select('mensagem')
      .limit(1)
      .single()
      .then(({ data, error }) =>
        setMensagem(error ? `Erro: ${error.message}` : data.mensagem)
      )
  }, [])

  return (
    <div style={{ textAlign: 'center', marginTop: '3rem' }}>
      <h1>Projeto Lab. Eng. de Software</h1>
      <p>React + TypeScript → Supabase → PostgreSQL</p>
      <h2>{mensagem}</h2>
    </div>
  )
}

export default App
