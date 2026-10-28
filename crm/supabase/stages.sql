-- EXECUÇÃO MANUAL OPCIONAL: etapas iniciais da PURM; revisar antes de executar.
-- Usar apenas em projeto Supabase PURM já inicializado com schema.sql.
insert into public.purm_crm_stages(name,position,color,kind) values
('Nova solicitação',1,'#2868ff','open'),
('Primeiro contato',2,'#0e9bcd','open'),
('Em análise',3,'#8263e8','open'),
('Cotação enviada',4,'#eda32f','open'),
('Negociação',5,'#da7a42','open'),
('Ganha',6,'#179a70','won'),
('Perdida',7,'#d44e68','lost')
on conflict (name) do nothing;
