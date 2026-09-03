@startuml
left to right direction
actor Visitante
actor Empregador
actor Trabalhador
actor Administrador

rectangle "Sistema de simulação de combate a pobreza" {
  
  Administrador -- (Gerenciar segurança) : <<UC01>>
  Administrador -- (Gerenciar usuarios) : <<UC02>>

  Visitante -- (Acessar texto e apresentação) : <<UC03>>
  Visitante -- (Acessar Simulador) : <<UC04>>
  Visitante -- (Cadastrar usuario) : <<UC05>>

  Empregador -- (Adicionar vaga) : <<UC06>>
  Empregador -- (Gerenciar vaga) : <<UC07>>
  Empregador -- (Fazer Login) : <<UC08>>

  Trabalhador -- (Fazer Login) : <<UC09>>
  Trabalhador -- (Acessar Banco de Dados) : <<UC10>>
  Trabalhador -- (Acessar área de ajuda) : <<UC11>>
  Trabalhador -- (Acessar processos seletivos) : <<UC12>>
  
  (Acessar Banco de vaga) .> (Fazer Login) : <<include>> 
  (Adicionar Vaga) .> (Fazer Login) : <<include>>
  (Acessar processos seletivos) .> (Fazer Login) : <<include>>
}
@enduml
