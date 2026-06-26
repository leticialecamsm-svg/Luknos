import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
const supabase = createClient(
  'https://dpobbflxgrjbfpxmtehg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwb2JiZmx4Z3JqYmZweG10ZWhnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDc4NzA3OCwiZXhwIjoyMDk2MzYzMDc4fQ.sVAQk3mdu_Ufa_3unFpqKvuUx-UTAttyCiJfbdG-fgc',
  { realtime: { transport: ws } }
)

// 1. Busca o trigger atual para entender sua estrutura
const { data: trigger, error: triggerErr } = await supabase.rpc('exec_sql', {
  sql: `SELECT trigger_name, event_manipulation, action_statement 
        FROM information_schema.triggers 
        WHERE event_object_table = 'negotiations'`
})
console.log('Triggers em negotiations:', JSON.stringify(trigger, null, 2), triggerErr?.message)

// 2. Busca a função do trigger
const { data: funcs, error: funcsErr } = await supabase.rpc('exec_sql', {
  sql: `SELECT proname, prosrc FROM pg_proc WHERE proname LIKE '%negotiat%' OR proname LIKE '%temperature%' OR proname LIKE '%activit%'`
})
console.log('Funções:', JSON.stringify(funcs, null, 2), funcsErr?.message)
process.exit(0)
